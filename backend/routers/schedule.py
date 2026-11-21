"""Alfred Backend — Schedule API router."""

import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models import ScheduleCreate, ScheduleUpdate, ScheduleResponse, PublishNowRequest
from database import get_db

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def _normalize_iso_utc(val: str | None) -> str:
    """Ensure timestamp strings from database or clients are valid ISO 8601 UTC strings."""
    if not val:
        return ""
    s = str(val).strip().replace(" ", "T")
    if not s.endswith("Z") and not re.search(r"[+-]\d{2}:?\d{2}$", s):
        s += "Z"
    return s


@router.post("/publish-now", response_model=ScheduleResponse, status_code=201)
async def publish_post_now(body: PublishNowRequest, background_tasks: BackgroundTasks):
    """Immediately queue and upload a clip right now to a social platform."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (body.clip_id,))
        clip = await cursor.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")

        # Auto-approve clip if not already marked approved
        if clip["status"] != "approved":
            await db.execute("UPDATE clips SET status = 'approved' WHERE id = ?", (body.clip_id,))
            await db.commit()

        post_id = str(uuid.uuid4())
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        await db.execute(
            """INSERT INTO scheduled_posts (id, clip_id, platform, scheduled_at, title, description, tags, status, attempts)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 0)""",
            (post_id, body.clip_id, body.platform, now_utc, body.title, body.description, body.tags),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        row = await cursor.fetchone()

        # Kick off background uploader immediately
        from scheduler.worker import process_due_posts
        background_tasks.add_task(process_due_posts)

        return _row_to_response(row)
    finally:
        await db.close()


@router.post("", response_model=ScheduleResponse, status_code=201)
async def create_scheduled_post(body: ScheduleCreate):
    """Schedule a clip for upload to a social platform."""
    db = await get_db()
    try:
        # Verify clip exists and is approved
        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (body.clip_id,))
        clip = await cursor.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")
        if clip["status"] != "approved":
            raise HTTPException(status_code=400, detail="Clip must be approved before scheduling")

        post_id = str(uuid.uuid4())
        norm_scheduled_at = _normalize_iso_utc(body.scheduled_at)
        await db.execute(
            """INSERT INTO scheduled_posts (id, clip_id, platform, scheduled_at, title, description, tags)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (post_id, body.clip_id, body.platform, norm_scheduled_at,
             body.title, body.description, body.tags),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        row = await cursor.fetchone()
        return _row_to_response(row)
    finally:
        await db.close()


@router.get("", response_model=list[ScheduleResponse])
async def list_scheduled_posts(from_date: str | None = None, to_date: str | None = None):
    """List scheduled posts, optionally filtered by date range."""
    db = await get_db()
    try:
        query = "SELECT * FROM scheduled_posts"
        params: list[str] = []
        conditions = []

        if from_date:
            conditions.append("scheduled_at >= ?")
            params.append(from_date)
        if to_date:
            conditions.append("scheduled_at <= ?")
            params.append(to_date)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " ORDER BY scheduled_at ASC"

        cursor = await db.execute(query, params)
        rows = await cursor.fetchall()
        return [_row_to_response(r) for r in rows]
    finally:
        await db.close()


@router.patch("/{post_id}", response_model=ScheduleResponse)
async def update_scheduled_post(post_id: str, body: ScheduleUpdate):
    """Update a scheduled post's time or metadata, resetting failure state if rescheduled."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        existing = await cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Scheduled post not found")

        updates = []
        params = []
        for field in ["title", "description", "tags"]:
            value = getattr(body, field, None)
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if body.scheduled_at is not None:
            updates.append("scheduled_at = ?")
            params.append(_normalize_iso_utc(body.scheduled_at))

        # If rescheduled or explicitly set to scheduled, reset failure counters
        target_status = body.status
        if not target_status and body.scheduled_at and existing["status"] == "failed":
            target_status = "scheduled"

        if target_status:
            updates.append("status = ?")
            params.append(target_status)
            if target_status == "scheduled":
                updates.append("attempts = 0")
                updates.append("last_error = NULL")

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        updates.append("updated_at = ?")
        params.append(now_utc)
        params.append(post_id)
        await db.execute(
            f"UPDATE scheduled_posts SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        return _row_to_response(await cursor.fetchone())
    finally:
        await db.close()


@router.post("/{post_id}/retry", response_model=ScheduleResponse)
async def retry_scheduled_post(post_id: str, background_tasks: BackgroundTasks):
    """Reset a failed post to scheduled and trigger immediate upload."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        existing = await cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Scheduled post not found")

        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        await db.execute(
            """UPDATE scheduled_posts
               SET status = 'scheduled', attempts = 0, last_error = NULL,
                   scheduled_at = ?, updated_at = ?
               WHERE id = ?""",
            (now_utc, now_utc, post_id),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        row = await cursor.fetchone()

        from scheduler.worker import process_due_posts
        background_tasks.add_task(process_due_posts)

        return _row_to_response(row)
    finally:
        await db.close()


@router.post("/retry-all")
async def retry_all_failed_posts(background_tasks: BackgroundTasks):
    """Reset all failed posts back to scheduled and trigger upload."""
    db = await get_db()
    try:
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        await db.execute(
            """UPDATE scheduled_posts
               SET status = 'scheduled', attempts = 0, last_error = NULL,
                   scheduled_at = ?, updated_at = ?
               WHERE status = 'failed'""",
            (now_utc, now_utc),
        )
        await db.commit()

        from scheduler.worker import process_due_posts
        background_tasks.add_task(process_due_posts)

        return {"success": True}
    finally:
        await db.close()


@router.delete("/failed")
async def delete_all_failed_posts():
    """Bulk delete all failed scheduled posts."""
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM scheduled_posts WHERE status = 'failed'")
        await db.commit()
        return {"success": True, "deleted": cursor.rowcount}
    finally:
        await db.close()


@router.delete("/{post_id}")
async def delete_scheduled_post(post_id: str):
    """Cancel a scheduled post."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM scheduled_posts WHERE id = ?", (post_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Scheduled post not found")

        await db.execute("DELETE FROM scheduled_posts WHERE id = ?", (post_id,))
        await db.commit()
        return {"success": True}
    finally:
        await db.close()


def _row_to_response(row) -> ScheduleResponse:
    return ScheduleResponse(
        id=row["id"],
        clip_id=row["clip_id"],
        platform=row["platform"],
        scheduled_at=_normalize_iso_utc(row["scheduled_at"]),
        title=row["title"],
        description=row["description"],
        tags=row["tags"],
        status=row["status"],
        attempts=row["attempts"],
        last_error=row["last_error"],
        created_at=_normalize_iso_utc(row["created_at"]),
        updated_at=_normalize_iso_utc(row["updated_at"]),
    )

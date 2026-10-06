"""Alfred Backend — Schedule API router."""

import uuid
from fastapi import APIRouter, HTTPException
from models import ScheduleCreate, ScheduleUpdate, ScheduleResponse
from database import get_db

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


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
        await db.execute(
            """INSERT INTO scheduled_posts (id, clip_id, platform, scheduled_at, title, description, tags)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (post_id, body.clip_id, body.platform, body.scheduled_at,
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
    """Update a scheduled post's time or metadata."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM scheduled_posts WHERE id = ?", (post_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Scheduled post not found")

        updates = []
        params = []
        for field in ["scheduled_at", "title", "description", "tags"]:
            value = getattr(body, field, None)
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        updates.append("updated_at = CURRENT_TIMESTAMP")
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
        id=row["id"], clip_id=row["clip_id"], platform=row["platform"],
        scheduled_at=row["scheduled_at"], title=row["title"],
        description=row["description"], tags=row["tags"],
        status=row["status"], attempts=row["attempts"],
        last_error=row["last_error"], created_at=row["created_at"],
        updated_at=row["updated_at"],
    )

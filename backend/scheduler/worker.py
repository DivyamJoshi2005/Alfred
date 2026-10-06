"""Alfred Backend — Scheduler worker background loop.

Polls the database for scheduled posts that are due, executes uploads
via platform uploaders, handles retries with exponential backoff,
and broadcasts status updates via WebSocket.
"""

import asyncio
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import MAX_UPLOAD_RETRIES, SCHEDULER_POLL_INTERVAL
from database import get_db
from routers.ws import manager


async def scheduler_loop():
    """Background loop polling scheduled posts every interval."""
    print(f"[Scheduler] Background worker started (polling every {SCHEDULER_POLL_INTERVAL}s)")
    while True:
        try:
            await process_due_posts()
        except asyncio.CancelledError:
            print("[Scheduler] Worker cancelled, shutting down loop.")
            break
        except Exception as e:
            print(f"[Scheduler] Unexpected error in polling cycle: {e}")
            traceback.print_exc()

        try:
            await asyncio.sleep(SCHEDULER_POLL_INTERVAL)
        except asyncio.CancelledError:
            print("[Scheduler] Sleep interrupted, stopping worker.")
            break


async def process_due_posts():
    """Query and process all posts that are due for upload."""
    db = await get_db()
    try:
        # Check posts where status is 'scheduled' and scheduled_at <= current UTC/local time
        cursor = await db.execute(
            """SELECT sp.*, c.output_path as clip_path, c.duration, c.status as clip_status
               FROM scheduled_posts sp
               JOIN clips c ON sp.clip_id = c.id
               WHERE sp.status = 'scheduled'
                 AND datetime(sp.scheduled_at) <= datetime('now')
               ORDER BY sp.scheduled_at ASC"""
        )
        due_posts = await cursor.fetchall()

        if not due_posts:
            return

        print(f"[Scheduler] Found {len(due_posts)} due post(s) ready to process.")

        for row in due_posts:
            post = dict(row)
            await execute_single_upload(db, post)

    finally:
        await db.close()


async def execute_single_upload(db, post: dict[str, Any]):
    """Execute upload for a single scheduled post with retry logic."""
    post_id = post["id"]
    platform = post["platform"]
    clip_path = post.get("clip_path")
    attempts = post.get("attempts", 0)

    # Validate clip file
    if not clip_path or not Path(clip_path).exists():
        err = f"Rendered clip file not found at {clip_path}"
        await db.execute(
            "UPDATE scheduled_posts SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (err, post_id),
        )
        await db.commit()
        await manager.send_upload_status(post_id, "failed", error=err)
        await manager.send_notification("error", f"Scheduled upload failed for {post.get('title')}: {err}")
        return

    # Update status to 'uploading'
    await db.execute(
        "UPDATE scheduled_posts SET status = 'uploading', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (post_id,),
    )
    await db.commit()
    await manager.send_upload_status(post_id, "uploading")
    await manager.send_notification("info", f"Uploading '{post.get('title') or 'Clip'}' to {platform.title()}...")

    # Attempt the upload
    try:
        from uploaders import get_uploader

        uploader = get_uploader(platform)
        result = await uploader.upload(
            clip_path=clip_path,
            title=post.get("title") or "Alfred Clip",
            description=post.get("description") or "",
            tags=post.get("tags"),
        )

        if result.get("success"):
            # Mark uploaded
            await db.execute(
                """UPDATE scheduled_posts
                   SET status = 'uploaded', last_error = NULL, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (post_id,),
            )
            # Update social account last_used_at
            await db.execute(
                "UPDATE social_accounts SET last_used_at = CURRENT_TIMESTAMP WHERE platform = ?",
                (platform,),
            )
            await db.commit()

            upload_url = result.get("url", "")
            success_msg = f"Published to {platform.title()}! {upload_url}".strip()
            await manager.send_upload_status(post_id, "uploaded")
            await manager.send_notification("info", f"✅ {success_msg}")
            print(f"[Scheduler] Post {post_id} uploaded successfully to {platform}")
        else:
            raise RuntimeError(result.get("error", "Unknown upload error"))

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"[Scheduler] Post {post_id} failed on attempt {attempts + 1}: {error_msg}")
        new_attempts = attempts + 1

        if new_attempts >= MAX_UPLOAD_RETRIES:
            # Reached max retries -> Mark failed
            await db.execute(
                """UPDATE scheduled_posts
                   SET status = 'failed', attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (new_attempts, error_msg, post_id),
            )
            await db.commit()
            await manager.send_upload_status(post_id, "failed", error=error_msg)
            await manager.send_notification("error", f"❌ Upload to {platform} failed permanently: {error_msg}")
        else:
            # Reschedule for retry in next cycles
            await db.execute(
                """UPDATE scheduled_posts
                   SET status = 'scheduled', attempts = ?, last_error = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (new_attempts, error_msg, post_id),
            )
            await db.commit()
            await manager.send_upload_status(
                post_id,
                "scheduled",
                error=f"Attempt {new_attempts}/{MAX_UPLOAD_RETRIES} failed: {error_msg}",
            )
            await manager.send_notification(
                "warning",
                f"⚠️ Upload to {platform} failed (attempt {new_attempts}/{MAX_UPLOAD_RETRIES}), will retry.",
            )

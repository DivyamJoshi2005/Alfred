"""Alfred Backend — Jobs API router."""

import uuid
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models import JobCreate, JobResponse, JobDetailResponse, ClipResponse
from database import get_db
from config import SUPPORTED_VIDEO_EXTENSIONS

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def resolve_video_file(path_str: str) -> Path | None:
    """Smartly resolve a video file whether given as absolute path, relative path, or filename."""
    if not path_str:
        return None

    p = Path(path_str)
    if p.exists() and p.is_file():
        return p.resolve()

    # Search candidates
    search_dirs = [
        Path.cwd(),
        Path.cwd().parent,
        Path(__file__).resolve().parent.parent,         # backend dir
        Path(__file__).resolve().parent.parent.parent,  # Alfred project root
        Path.home() / "Alfred" / "projects",
        Path.home() / "Downloads",
        Path.home() / "Desktop",
    ]

    filename = p.name
    # 1. Exact match in search directories
    for d in search_dirs:
        if not d.exists() or not d.is_dir():
            continue
        candidate = d / filename
        if candidate.exists() and candidate.is_file():
            return candidate.resolve()

    # 2. Fuzzy match normalizing multiple spaces / whitespace
    import re
    norm_filename = re.sub(r'\s+', ' ', filename).strip().lower()
    for d in search_dirs:
        if not d.exists() or not d.is_dir():
            continue
        try:
            for item in d.iterdir():
                if item.is_file() and re.sub(r'\s+', ' ', item.name).strip().lower() == norm_filename:
                    return item.resolve()
        except Exception:
            pass

    # 3. Recursive search in Alfred project root and home/Alfred
    for root in [Path(__file__).resolve().parent.parent.parent, Path.home() / "Alfred"]:
        if not root.exists():
            continue
        try:
            for item in root.rglob(f"*{p.suffix}"):
                if re.sub(r'\s+', ' ', item.name).strip().lower() == norm_filename:
                    return item.resolve()
        except Exception:
            pass

    return None


@router.get("/local-videos")
async def list_local_videos():
    """List available video files in the Alfred project and common media locations."""
    results = []
    seen = set()
    search_dirs = [
        Path(__file__).resolve().parent.parent.parent,  # Alfred project root
        Path.home() / "Alfred" / "projects",
        Path.home() / "Downloads",
    ]
    for d in search_dirs:
        if not d.exists() or not d.is_dir():
            continue
        try:
            for f in d.glob("*"):
                if f.is_file() and f.suffix.lower() in SUPPORTED_VIDEO_EXTENSIONS:
                    resolved = str(f.resolve())
                    if resolved not in seen:
                        seen.add(resolved)
                        size_mb = round(f.stat().st_size / (1024 * 1024), 1)
                        results.append({
                            "name": f.name,
                            "path": resolved,
                            "size_mb": size_mb,
                            "folder": d.name,
                        })
        except Exception:
            pass
    return results


@router.post("", response_model=JobResponse, status_code=201)
async def create_job(body: JobCreate, background_tasks: BackgroundTasks):
    """Create a new video processing job."""
    resolved = resolve_video_file(body.video_path)
    if not resolved:
        raise HTTPException(status_code=400, detail=f"File not found: {body.video_path}")

    video_path = resolved

    # Validate extension
    if video_path.suffix.lower() not in SUPPORTED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {video_path.suffix}. Supported: {', '.join(SUPPORTED_VIDEO_EXTENSIONS)}"
        )

    job_id = str(uuid.uuid4())
    video_name = video_path.stem

    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, video_path, video_name, status) VALUES (?, ?, ?, 'queued')",
            (job_id, str(video_path), video_name),
        )
        await db.commit()

        row = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        job = await row.fetchone()

        # Trigger pipeline in background
        from pipeline.orchestrator import run_pipeline
        background_tasks.add_task(run_pipeline, job_id)

        return JobResponse(
            id=job["id"],
            video_path=job["video_path"],
            video_name=job["video_name"],
            status=job["status"],
            created_at=job["created_at"],
            updated_at=job["updated_at"],
            error_msg=job["error_msg"],
        )
    finally:
        await db.close()


@router.get("", response_model=list[JobResponse])
async def list_jobs():
    """List all jobs, most recent first."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM jobs ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [
            JobResponse(
                id=row["id"],
                video_path=row["video_path"],
                video_name=row["video_name"],
                status=row["status"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                error_msg=row["error_msg"],
            )
            for row in rows
        ]
    finally:
        await db.close()


@router.get("/{job_id}", response_model=JobDetailResponse)
async def get_job(job_id: str):
    """Get job details including clips."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        job = await cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        clip_cursor = await db.execute(
            "SELECT * FROM clips WHERE job_id = ? ORDER BY rank", (job_id,)
        )
        clip_rows = await clip_cursor.fetchall()
        clips = [
            ClipResponse(
                id=c["id"],
                job_id=c["job_id"],
                rank=c["rank"],
                start_time=c["start_time"],
                end_time=c["end_time"],
                duration=c["duration"],
                transcript_text=c["transcript_text"],
                hook_text=c["hook_text"],
                hook_audio_path=c["hook_audio_path"],
                output_path=c["output_path"],
                status=c["status"],
                rationale=c["rationale"],
                created_at=c["created_at"],
            )
            for c in clip_rows
        ]

        return JobDetailResponse(
            id=job["id"],
            video_path=job["video_path"],
            video_name=job["video_name"],
            status=job["status"],
            created_at=job["created_at"],
            updated_at=job["updated_at"],
            error_msg=job["error_msg"],
            clips=clips,
        )
    finally:
        await db.close()


@router.delete("/{job_id}")
async def delete_job(job_id: str):
    """Delete a job and its associated data."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM jobs WHERE id = ?", (job_id,))
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Job not found")

        await db.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        await db.commit()
        return {"success": True}
    finally:
        await db.close()

"""Alfred Backend — Jobs API router."""

import uuid
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from models import JobCreate, YouTubeIngestCreate, JobResponse, JobDetailResponse, ClipResponse
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


@router.post("/upload", response_model=JobResponse, status_code=201)
async def upload_and_create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a video file directly from browser drag-and-drop and queue processing."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED_VIDEO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format: {suffix}. Supported: {', '.join(SUPPORTED_VIDEO_EXTENSIONS)}"
        )

    from config import ALFRED_PROJECTS_DIR
    uploads_dir = ALFRED_PROJECTS_DIR / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    clean_filename = Path(file.filename or "video.mp4").name
    save_path = uploads_dir / clean_filename
    counter = 1
    while save_path.exists():
        save_path = uploads_dir / f"{Path(clean_filename).stem}_{counter}{suffix}"
        counter += 1

    import shutil
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save video: {e}")

    job_id = str(uuid.uuid4())
    video_name = save_path.stem

    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, video_path, video_name, status) VALUES (?, ?, ?, 'queued')",
            (job_id, str(save_path), video_name),
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


async def download_youtube_video(url: str, output_dir: Path, progress_callback=None) -> tuple[str, str]:
    """Download video from YouTube using yt-dlp, merging into high-quality MP4."""
    import yt_dlp

    output_dir.mkdir(parents=True, exist_ok=True)
    outtmpl = str(output_dir / "%(title).150B [%(id)s].%(ext)s")

    loop = asyncio.get_running_loop()

    def _progress_hook(d):
        if progress_callback and d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes") or 0
            if total > 0:
                pct = round((downloaded / total) * 100, 1)
                loop.call_soon_threadsafe(progress_callback, pct)

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
        "outtmpl": outtmpl,
        "noplaylist": True,
        "merge_output_format": "mp4",
        "progress_hooks": [_progress_hook] if progress_callback else [],
        "quiet": True,
        "no_warnings": True,
    }

    def _sync_download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            target_file = ydl.prepare_filename(info)
            mp4_file = Path(target_file).with_suffix(".mp4")
            title = info.get("title") or mp4_file.stem
            if mp4_file.exists():
                return str(mp4_file), title
            elif Path(target_file).exists():
                return str(target_file), title
            else:
                vid_id = info.get("id")
                matches = list(output_dir.glob(f"*{vid_id}*"))
                if matches:
                    return str(matches[0]), title
                raise RuntimeError("Downloaded video file could not be located on disk")

    return await asyncio.to_thread(_sync_download)


async def _process_youtube_job(job_id: str, url: str):
    """Background task: download YouTube video via yt-dlp then run AI pipeline."""
    from config import ALFRED_PROJECTS_DIR
    from routers.ws import manager
    from pipeline.orchestrator import run_pipeline

    uploads_dir = ALFRED_PROJECTS_DIR / "uploads"

    try:
        await manager.send_notification("info", "📥 Connecting to YouTube and starting download...")
        await manager.send_progress(job_id, "downloading", 10.0, "Fetching video metadata via yt-dlp...")

        def on_dl_progress(pct: float):
            asyncio.create_task(
                manager.send_progress(
                    job_id,
                    "downloading",
                    max(10.0, min(95.0, pct)),
                    f"Downloading video: {pct}% complete",
                )
            )

        video_path, video_title = await download_youtube_video(url, uploads_dir, on_dl_progress)
        clean_name = Path(video_path).stem

        db = await get_db()
        try:
            await db.execute(
                "UPDATE jobs SET video_path = ?, video_name = ?, status = 'queued', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (video_path, clean_name, job_id),
            )
            await db.commit()
        finally:
            await db.close()

        await manager.send_notification("info", f"✅ Downloaded '{clean_name}'. Starting AI processing pipeline...")
        await manager.send_progress(job_id, "downloading", 100.0, f"Downloaded '{clean_name}', starting transcription...")

        # Run 6-stage AI pipeline
        await run_pipeline(job_id)

    except Exception as e:
        error_msg = f"YouTube download failed: {str(e)}"
        print(f"[YouTubeIngest] Error for job {job_id}: {error_msg}")
        db = await get_db()
        try:
            await db.execute(
                "UPDATE jobs SET status = 'failed', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (error_msg, job_id),
            )
            await db.commit()
        finally:
            await db.close()
        await manager.send_job_status(job_id, "failed", error=error_msg)
        await manager.send_notification("error", f"❌ {error_msg}")


@router.post("/youtube", response_model=JobResponse, status_code=201)
async def ingest_from_youtube(
    body: YouTubeIngestCreate,
    background_tasks: BackgroundTasks,
):
    """Ingest a video directly from a YouTube link, download it via yt-dlp, and start pipeline."""
    url = body.url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="Invalid URL. Please enter a valid YouTube link starting with https://",
        )

    job_id = str(uuid.uuid4())
    display_name = f"YouTube: {url[:35]}..."

    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO jobs (id, video_path, video_name, status) VALUES (?, '', ?, 'downloading')",
            (job_id, display_name),
        )
        await db.commit()

        row = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        job = await row.fetchone()

        background_tasks.add_task(_process_youtube_job, job_id, url)

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
        clips = []
        for c in clip_rows:
            c_keys = c.keys() if hasattr(c, "keys") else []
            clips.append(
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
                    visual_score=c["visual_score"] if "visual_score" in c_keys else 0.0,
                    audio_score=c["audio_score"] if "audio_score" in c_keys else 0.0,
                    hook_score=c["hook_score"] if "hook_score" in c_keys else 0.0,
                    retention_score=c["retention_score"] if "retention_score" in c_keys else 0.0,
                    visual_hook_rationale=c["visual_hook_rationale"] if "visual_hook_rationale" in c_keys else None,
                    storyboard_paths=c["storyboard_paths"] if "storyboard_paths" in c_keys else None,
                    created_at=c["created_at"],
                )
            )

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

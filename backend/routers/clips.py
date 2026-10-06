from pathlib import Path
from fastapi import APIRouter, HTTPException
from models import ClipResponse, ClipUpdate, ClipRerenderRequest, ClipSynthesizeRequest
from database import get_db

router = APIRouter(prefix="/api/clips", tags=["clips"])


@router.get("/job/{job_id}", response_model=list[ClipResponse])
async def list_clips_for_job(job_id: str):
    """List all clips for a specific job, ordered by rank."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM clips WHERE job_id = ? ORDER BY rank", (job_id,)
        )
        rows = await cursor.fetchall()
        return [
            ClipResponse(
                id=row["id"], job_id=row["job_id"], rank=row["rank"],
                start_time=row["start_time"], end_time=row["end_time"],
                duration=row["duration"], transcript_text=row["transcript_text"],
                hook_text=row["hook_text"], hook_audio_path=row["hook_audio_path"],
                output_path=row["output_path"], status=row["status"],
                rationale=row["rationale"], created_at=row["created_at"],
            )
            for row in rows
        ]
    finally:
        await db.close()


@router.patch("/{clip_id}", response_model=ClipResponse)
async def update_clip(clip_id: str, body: ClipUpdate):
    """Update clip status (approve/reject) or edit hook text."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        clip = await cursor.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")

        updates = []
        params = []

        if body.status is not None:
            valid_statuses = {"pending", "approved", "rejected"}
            if body.status not in valid_statuses:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
                )
            updates.append("status = ?")
            params.append(body.status)

        if body.hook_text is not None:
            updates.append("hook_text = ?")
            params.append(body.hook_text)

        if body.start_time is not None:
            updates.append("start_time = ?")
            params.append(body.start_time)

        if body.end_time is not None:
            updates.append("end_time = ?")
            params.append(body.end_time)

        if body.start_time is not None or body.end_time is not None:
            # Recompute duration
            st = body.start_time if body.start_time is not None else clip["start_time"]
            et = body.end_time if body.end_time is not None else clip["end_time"]
            updates.append("duration = ?")
            params.append(max(et - st, 0))

        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        params.append(clip_id)
        await db.execute(
            f"UPDATE clips SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        updated = await cursor.fetchone()
        return ClipResponse(
            id=updated["id"], job_id=updated["job_id"], rank=updated["rank"],
            start_time=updated["start_time"], end_time=updated["end_time"],
            duration=updated["duration"], transcript_text=updated["transcript_text"],
            hook_text=updated["hook_text"], hook_audio_path=updated["hook_audio_path"],
            output_path=updated["output_path"], status=updated["status"],
            rationale=updated["rationale"], created_at=updated["created_at"],
        )
    finally:
        await db.close()


@router.post("/{clip_id}/rerender", response_model=ClipResponse)
async def rerender_clip(clip_id: str, body: ClipRerenderRequest):
    """Re-render clip with adjusted trim timing, framing mode, and audio mode."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        clip = await cursor.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")

        job_cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (clip["job_id"],))
        job = await job_cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        video_path = Path(job["video_path"])
        if not video_path.exists():
            raise HTTPException(status_code=400, detail="Source video not found")

        start_time = body.start_time if body.start_time is not None else clip["start_time"]
        end_time = body.end_time if body.end_time is not None else clip["end_time"]
        if end_time <= start_time:
            raise HTTPException(status_code=400, detail="End time must be greater than start time")

        duration = end_time - start_time
        hook_text = body.hook_text if body.hook_text is not None else clip["hook_text"]
        framing_mode = body.framing_mode or "presentation_fit"
        audio_mode = body.audio_mode or "original"

        from config import ALFRED_PROJECTS_DIR
        output_path = (
            Path(clip["output_path"])
            if clip["output_path"]
            else ALFRED_PROJECTS_DIR / job["video_name"] / "clips" / f"clip_{clip['rank']}.mp4"
        )

        from pipeline.assembler import render_single_clip
        await render_single_clip(
            video_path=video_path,
            start_time=start_time,
            end_time=end_time,
            output_path=output_path,
            crop_coords=None,
            hook_audio_path=clip["hook_audio_path"],
            hook_text=hook_text,
            framing_mode=framing_mode,
            audio_mode=audio_mode,
        )

        await db.execute(
            """UPDATE clips
               SET start_time = ?, end_time = ?, duration = ?, hook_text = ?, output_path = ?, status = 'rendered'
               WHERE id = ?""",
            (start_time, end_time, duration, hook_text, str(output_path), clip_id),
        )
        await db.commit()

        updated_cur = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        updated = await updated_cur.fetchone()
        return ClipResponse(
            id=updated["id"], job_id=updated["job_id"], rank=updated["rank"],
            start_time=updated["start_time"], end_time=updated["end_time"],
            duration=updated["duration"], transcript_text=updated["transcript_text"],
            hook_text=updated["hook_text"], hook_audio_path=updated["hook_audio_path"],
            output_path=updated["output_path"], status=updated["status"],
            rationale=updated["rationale"], created_at=updated["created_at"],
        )
    finally:
        await db.close()


@router.post("/{clip_id}/synthesize-voice")
async def synthesize_clip_voice(clip_id: str, body: ClipSynthesizeRequest):
    """Synthesize custom speech or user cloned voice for the clip hook."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        clip = await cursor.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")

        job_cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (clip["job_id"],))
        job = await job_cursor.fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        from config import ALFRED_PROJECTS_DIR
        clips_dir = ALFRED_PROJECTS_DIR / job["video_name"] / "clips"
        clips_dir.mkdir(parents=True, exist_ok=True)
        out_wav = clips_dir / f"hook_{clip['rank']}.wav"

        from pipeline.tts import get_tts_engine
        tts = get_tts_engine()
        tts.synthesize(body.script_text, out_wav, voice=body.voice_preset or "af_heart")

        # Apply voice cloning if requested
        if body.use_cloned_voice:
            from pipeline.voice_cloner import VoiceCloner
            cloner = VoiceCloner()
            samples = cloner.list_voice_samples()
            valid_samples = [s for s in samples if s["has_embedding"]]
            if valid_samples:
                ref = valid_samples[0]
                if body.reference_sample_name:
                    named = [s for s in valid_samples if s["name"] == body.reference_sample_name]
                    if named:
                        ref = named[0]
                cloned_wav = clips_dir / f"hook_{clip['rank']}_cloned.wav"
                cloner.clone_voice(out_wav, Path(ref["embedding_path"]), cloned_wav)
                out_wav = cloned_wav

        await db.execute(
            "UPDATE clips SET hook_audio_path = ?, hook_text = ? WHERE id = ?",
            (str(out_wav), body.script_text, clip_id),
        )
        await db.commit()

        return {
            "hook_audio_path": str(out_wav),
            "hook_text": body.script_text,
        }
    finally:
        await db.close()

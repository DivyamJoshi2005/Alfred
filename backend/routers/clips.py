from pathlib import Path
from fastapi import APIRouter, HTTPException
from models import ClipResponse, ClipUpdate, ClipRerenderRequest, ClipSynthesizeRequest
from database import get_db

router = APIRouter(prefix="/api/clips", tags=["clips"])


def _row_to_clip_response(row) -> ClipResponse:
    keys = row.keys() if hasattr(row, "keys") else []
    return ClipResponse(
        id=row["id"],
        job_id=row["job_id"],
        rank=row["rank"],
        start_time=row["start_time"],
        end_time=row["end_time"],
        duration=row["duration"],
        transcript_text=row["transcript_text"],
        hook_text=row["hook_text"],
        hook_audio_path=row["hook_audio_path"],
        audio_mode=row["audio_mode"] if "audio_mode" in keys and row["audio_mode"] else "original",
        hook_offset_sec=float(row["hook_offset_sec"]) if "hook_offset_sec" in keys and row["hook_offset_sec"] is not None else 0.0,
        ducking_volume=float(row["ducking_volume"]) if "ducking_volume" in keys and row["ducking_volume"] is not None else 0.15,
        tags=row["tags"] if "tags" in keys else None,
        output_path=row["output_path"],
        status=row["status"],
        rationale=row["rationale"],
        visual_score=row["visual_score"] if "visual_score" in keys else 0.0,
        audio_score=row["audio_score"] if "audio_score" in keys else 0.0,
        hook_score=row["hook_score"] if "hook_score" in keys else 0.0,
        retention_score=row["retention_score"] if "retention_score" in keys else 0.0,
        visual_hook_rationale=row["visual_hook_rationale"] if "visual_hook_rationale" in keys else None,
        storyboard_paths=row["storyboard_paths"] if "storyboard_paths" in keys else None,
        created_at=row["created_at"],
    )


@router.get("/job/{job_id}", response_model=list[ClipResponse])
async def list_clips_for_job(job_id: str):
    """List all clips for a specific job, ordered by rank."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM clips WHERE job_id = ? ORDER BY rank", (job_id,)
        )
        rows = await cursor.fetchall()
        return [_row_to_clip_response(row) for row in rows]
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

        if body.audio_mode is not None:
            updates.append("audio_mode = ?")
            params.append(body.audio_mode)

        if body.hook_offset_sec is not None:
            updates.append("hook_offset_sec = ?")
            params.append(body.hook_offset_sec)

        if body.ducking_volume is not None:
            updates.append("ducking_volume = ?")
            params.append(max(0.0, min(1.0, float(body.ducking_volume))))

        if body.tags is not None:
            updates.append("tags = ?")
            params.append(body.tags)

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
        return _row_to_clip_response(updated)
    finally:
        await db.close()


@router.post("/{clip_id}/rerender", response_model=ClipResponse)
async def rerender_clip(clip_id: str, body: ClipRerenderRequest):
    """Re-render clip with adjusted trim timing, framing mode, active sound profile, and audio mode."""
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

        # Determine audio mode: 'original', 'intro_hook', 'custom_voiceover' (or legacy aliases)
        raw_mode = (body.audio_mode or clip["audio_mode"] or "original").lower().strip()
        if raw_mode in ("intro_hook", "preroll"):
            audio_mode = "intro_hook"
            hook_offset_sec = 0.0
        elif raw_mode in ("custom_voiceover", "voiceover", "full_voiceover"):
            audio_mode = "custom_voiceover"
            hook_offset_sec = max(0.0, float(body.hook_offset_sec if body.hook_offset_sec is not None else (clip["hook_offset_sec"] or 0.0)))
        else:
            audio_mode = "original"
            hook_offset_sec = 0.0

        from config import ALFRED_PROJECTS_DIR
        output_path = (
            Path(clip["output_path"])
            if clip["output_path"]
            else ALFRED_PROJECTS_DIR / job["video_name"] / "clips" / f"clip_{clip['rank']}.mp4"
        )

        hook_audio_path = clip["hook_audio_path"]

        # If user selected an audio mode with hook voiceover (intro_hook or custom_voiceover),
        # ensure synthesized hook audio exists using active sound profile from Settings
        if audio_mode != "original":
            # Fetch active sound profile from settings
            settings_cur = await db.execute("SELECT key, value FROM settings")
            s_rows = await settings_cur.fetchall()
            settings_map = {r["key"]: r["value"] for r in s_rows}

            voice_preset = body.voice_preset or settings_map.get("voice_preset", "af_sarah")
            cloning_enabled = (
                body.use_cloned_voice
                if body.use_cloned_voice is not None
                else (settings_map.get("voice_cloning_enabled", "false").lower() == "true")
            )
            reference_sample_name = body.reference_sample_name or settings_map.get("selected_voice_sample", None)

            needs_synth = (
                bool(hook_text) and (
                    hook_text != clip["hook_text"]
                    or not hook_audio_path
                    or not Path(hook_audio_path).exists()
                    or body.voice_preset is not None
                    or body.use_cloned_voice is not None
                )
            )

            if needs_synth:
                try:
                    from pipeline.tts import get_tts_engine
                    tts = get_tts_engine()
                    clips_dir = ALFRED_PROJECTS_DIR / job["video_name"] / "clips"
                    clips_dir.mkdir(parents=True, exist_ok=True)
                    tts_out = clips_dir / f"hook_{clip['rank']}.wav"
                    tts.synthesize(hook_text, tts_out, voice=voice_preset)
                    hook_audio_path = str(tts_out)

                    if cloning_enabled:
                        try:
                            from pipeline.voice_cloner import VoiceCloner
                            cloner = VoiceCloner()
                            samples = cloner.list_voice_samples()
                            valid_samples = [s for s in samples if s.get("has_embedding")]
                            if valid_samples:
                                ref = valid_samples[0]
                                if reference_sample_name:
                                    named = [s for s in valid_samples if s["name"] == reference_sample_name]
                                    if named:
                                        ref = named[0]
                                cloned_wav = clips_dir / f"hook_{clip['rank']}_cloned.wav"
                                cloner.clone_voice(tts_out, Path(ref["embedding_path"]), cloned_wav)
                                hook_audio_path = str(cloned_wav)
                        except Exception as ce:
                            print(f"[Rerender] Voice cloning notice: {ce}")
                except Exception as e:
                    print(f"[Rerender] Failed to synthesize hook audio: {e}")
        else:
            # ORIGINAL SOUND ONLY: No voiceovers, overlays, or ducking. Pure source video audio!
            hook_audio_path = None

        # Original sound ducking volume level (0.0 to 1.0)
        ducking_volume = (
            body.ducking_volume
            if body.ducking_volume is not None
            else (float(clip["ducking_volume"]) if "ducking_volume" in clip.keys() and clip["ducking_volume"] is not None else 0.15)
        )
        ducking_volume = max(0.0, min(1.0, float(ducking_volume)))

        from pipeline.assembler import render_single_clip
        await render_single_clip(
            video_path=video_path,
            start_time=start_time,
            end_time=end_time,
            output_path=output_path,
            crop_coords=None,
            hook_audio_path=hook_audio_path,
            hook_text=hook_text if audio_mode != "original" else None,
            framing_mode=framing_mode,
            audio_mode=audio_mode,
            hook_offset_sec=hook_offset_sec,
            ducking_volume=ducking_volume,
        )

        await db.execute(
            """UPDATE clips
               SET start_time = ?, end_time = ?, duration = ?, hook_text = ?, hook_audio_path = ?, audio_mode = ?, hook_offset_sec = ?, ducking_volume = ?, output_path = ?, status = 'rendered'
               WHERE id = ?""",
            (
                start_time,
                end_time,
                duration,
                hook_text,
                str(hook_audio_path) if hook_audio_path else (clip["hook_audio_path"] if audio_mode != "original" else None),
                audio_mode,
                hook_offset_sec,
                ducking_volume,
                str(output_path),
                clip_id,
            ),
        )
        await db.commit()

        updated_cur = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        updated = await updated_cur.fetchone()
        return _row_to_clip_response(updated)
    finally:
        await db.close()


@router.post("/{clip_id}/synthesize-voice")
async def synthesize_clip_voice(clip_id: str, body: ClipSynthesizeRequest):
    """Synthesize speech or cloned voice for the clip hook using active Settings sound profile."""
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

        # Resolve sound profile settings
        settings_cur = await db.execute("SELECT key, value FROM settings")
        s_rows = await settings_cur.fetchall()
        settings_map = {r["key"]: r["value"] for r in s_rows}

        voice_preset = body.voice_preset or settings_map.get("voice_preset", "af_sarah")
        use_cloned = (
            body.use_cloned_voice
            if body.use_cloned_voice is not None
            else (settings_map.get("voice_cloning_enabled", "false").lower() == "true")
        )
        sample_name = body.reference_sample_name or settings_map.get("selected_voice_sample", None)

        from config import ALFRED_PROJECTS_DIR
        clips_dir = ALFRED_PROJECTS_DIR / job["video_name"] / "clips"
        clips_dir.mkdir(parents=True, exist_ok=True)
        out_wav = clips_dir / f"hook_{clip['rank']}.wav"

        from pipeline.tts import get_tts_engine
        tts = get_tts_engine()
        tts.synthesize(body.script_text, out_wav, voice=voice_preset)

        # Apply voice cloning if requested or enabled in settings
        if use_cloned:
            from pipeline.voice_cloner import VoiceCloner
            cloner = VoiceCloner()
            samples = cloner.list_voice_samples()
            valid_samples = [s for s in samples if s.get("has_embedding")]
            if valid_samples:
                ref = valid_samples[0]
                if sample_name:
                    named = [s for s in valid_samples if s["name"] == sample_name]
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


@router.post("/{clip_id}/generate-tags")
async def generate_clip_tags(clip_id: str):
    """Generate smart content-aware hashtags based on the clip's transcript and hook."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM clips WHERE id = ?", (clip_id,))
        clip = await cursor.fetchone()
        if not clip:
            raise HTTPException(status_code=404, detail="Clip not found")

        job_cursor = await db.execute("SELECT video_name FROM jobs WHERE id = ?", (clip["job_id"],))
        job = await job_cursor.fetchone()
        video_name = job["video_name"] if job else ""

        from pipeline.hook_generator import generate_content_hashtags
        tags = generate_content_hashtags(
            transcript=clip["transcript_text"] or "",
            hook_text=clip["hook_text"] or "",
            video_name=video_name,
        )

        await db.execute("UPDATE clips SET tags = ? WHERE id = ?", (tags, clip_id))
        await db.commit()

        return {
            "clip_id": clip_id,
            "tags": tags,
        }
    finally:
        await db.close()

"""Pipeline Orchestrator — Sequential execution of all ML stages with progress reporting."""

import asyncio
import traceback
from pathlib import Path

from database import get_db
from config import ALFRED_PROJECTS_DIR
from routers.ws import manager


async def run_pipeline(job_id: str):
    """Execute the full pipeline for a job: Transcribe → Analyze → Hooks → TTS → Crop → Assemble."""
    db = await get_db()
    try:
        # Fetch job
        cursor = await db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
        job = await cursor.fetchone()
        if not job:
            return

        video_path = Path(job["video_path"])
        video_name = job["video_name"]

        # Create project directory
        project_dir = ALFRED_PROJECTS_DIR / video_name
        clips_dir = project_dir / "clips"
        clips_dir.mkdir(parents=True, exist_ok=True)

        # Update status to processing
        await db.execute(
            "UPDATE jobs SET status = 'transcribing', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )
        await db.commit()
        await manager.send_job_status(job_id, "transcribing")

        # ── Stage 1: Audio Extraction + Transcription ──
        await manager.send_progress(job_id, "transcribing", 0, "Extracting audio...")

        from pipeline.transcriber import transcribe_video
        transcript_data = await transcribe_video(
            video_path=video_path,
            output_dir=project_dir,
            job_id=job_id,
        )

        # Save transcript to DB
        import uuid
        transcript_id = str(uuid.uuid4())
        import json
        await db.execute(
            """INSERT INTO transcripts (id, job_id, full_text, segments, words)
               VALUES (?, ?, ?, ?, ?)""",
            (transcript_id, job_id, transcript_data["full_text"],
             json.dumps(transcript_data["segments"]),
             json.dumps(transcript_data["words"])),
        )
        await db.commit()

        # ── Stage 2: Viral Segment Identification ──
        await db.execute(
            "UPDATE jobs SET status = 'analyzing', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )
        await db.commit()
        await manager.send_progress(job_id, "analyzing", 0, "Identifying viral segments...")

        from pipeline.analyzer import identify_segments
        segments = await identify_segments(
            transcript_data=transcript_data,
            job_id=job_id,
        )

        # ── Stage 3: Hook Generation ──
        await manager.send_progress(job_id, "generating_hooks", 0, "Generating hooks...")

        from pipeline.hook_generator import generate_hooks
        segments_with_hooks = await generate_hooks(
            segments=segments,
            job_id=job_id,
        )

        # Save clips to DB
        for i, seg in enumerate(segments_with_hooks):
            clip_id = str(uuid.uuid4())
            duration = seg["end_time"] - seg["start_time"]
            await db.execute(
                """INSERT INTO clips (id, job_id, rank, start_time, end_time, duration,
                   transcript_text, hook_text, status, rationale)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
                (clip_id, job_id, i + 1, seg["start_time"], seg["end_time"],
                 duration, seg["transcript_text"], seg.get("hook_text"),
                 seg.get("rationale")),
            )
            seg["clip_id"] = clip_id
            seg["rank"] = i + 1
        await db.commit()

        # ── Stage 4: TTS Synthesis & Voice Cloning ──
        await manager.send_progress(job_id, "generating_hooks", 50, "Synthesizing hook audio...")

        # Read voice settings from DB
        settings_cursor = await db.execute("SELECT key, value FROM settings WHERE key IN ('voice_preset', 'voice_cloning_enabled')")
        settings_rows = await settings_cursor.fetchall()
        user_settings = {r["key"]: r["value"] for r in settings_rows}
        voice_preset = user_settings.get("voice_preset", "default")
        voice_cloning_enabled = user_settings.get("voice_cloning_enabled", "false").lower() == "true"

        from pipeline.tts import synthesize_hooks
        segments_with_audio = await synthesize_hooks(
            segments=segments_with_hooks,
            output_dir=clips_dir,
            job_id=job_id,
            voice_preset=voice_preset,
        )

        # Apply voice cloning if enabled
        if voice_cloning_enabled:
            from pipeline.voice_cloner import VoiceCloner
            cloner = VoiceCloner()
            samples = cloner.list_voice_samples()
            valid_samples = [s for s in samples if s["has_embedding"]]
            if valid_samples:
                ref_sample = valid_samples[0]
                await manager.send_progress(job_id, "generating_hooks", 95, f"Applying voice clone ({ref_sample['name']})...")
                for seg in segments_with_audio:
                    base_audio = seg.get("hook_audio_path")
                    if base_audio and Path(base_audio).exists():
                        cloned_path = Path(base_audio).parent / f"{Path(base_audio).stem}_cloned.wav"
                        try:
                            cloner.clone_voice(Path(base_audio), Path(ref_sample["embedding_path"]), cloned_path)
                            seg["hook_audio_path"] = str(cloned_path)
                        except Exception as ce:
                            print(f"[Pipeline] Voice clone conversion failed ({ce}), keeping base TTS")

        # Update hook_audio_path in DB
        for seg in segments_with_audio:
            if seg.get("hook_audio_path"):
                await db.execute(
                    "UPDATE clips SET hook_audio_path = ? WHERE id = ?",
                    (str(seg["hook_audio_path"]), seg["clip_id"]),
                )
        await db.commit()

        # ── Stage 5: Smart Cropping (face detection) ──
        await db.execute(
            "UPDATE jobs SET status = 'rendering', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )
        await db.commit()
        await manager.send_progress(job_id, "cropping", 0, "Detecting faces for smart crop...")

        from pipeline.smart_crop import detect_faces_for_segments
        segments_with_crops = await detect_faces_for_segments(
            video_path=video_path,
            segments=segments_with_audio,
            job_id=job_id,
        )

        # ── Stage 6: Video Assembly ──
        await manager.send_progress(job_id, "rendering", 0, "Assembling clips...")

        from pipeline.assembler import assemble_clips
        final_clips = await assemble_clips(
            video_path=video_path,
            segments=segments_with_crops,
            output_dir=clips_dir,
            job_id=job_id,
        )

        # Update output paths in DB
        for seg in final_clips:
            await db.execute(
                "UPDATE clips SET output_path = ?, status = 'rendered' WHERE id = ?",
                (str(seg["output_path"]), seg["clip_id"]),
            )
        await db.commit()

        # ── Done ──
        await db.execute(
            "UPDATE jobs SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )
        await db.commit()
        await manager.send_job_status(job_id, "completed")
        await manager.send_notification("info", f"✅ {video_name}: {len(final_clips)} clips ready for review!")

    except Exception as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        traceback.print_exc()
        await db.execute(
            "UPDATE jobs SET status = 'failed', error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (error_msg, job_id),
        )
        await db.commit()
        await manager.send_job_status(job_id, "failed", error=error_msg)
        await manager.send_notification("error", f"❌ Pipeline failed for {job_id}: {error_msg}")
    finally:
        await db.close()

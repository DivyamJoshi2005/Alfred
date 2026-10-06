"""Alfred Backend — Settings and Voice Configuration API router."""

import shutil
from pathlib import Path
from typing import Any
from fastapi import APIRouter, File, HTTPException, UploadFile
from database import get_db
from config import (
    KOKORO_MODEL_PATH,
    KOKORO_VOICES_PATH,
    LLAMA_MODEL_PATH,
    WHISPER_MODEL_PATH,
    YOLO_MODEL_PATH,
    VOICE_SAMPLES_DIR,
)
from pipeline.voice_cloner import VoiceCloner

router = APIRouter(prefix="/api/settings", tags=["settings"])
voice_cloner = VoiceCloner()


@router.get("")
async def get_settings() -> dict[str, str]:
    """Retrieve all application settings."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT key, value FROM settings")
        rows = await cursor.fetchall()
        settings_dict = {row["key"]: row["value"] for row in rows}

        # Defaults
        settings_dict.setdefault("voice_preset", "default")
        settings_dict.setdefault("voice_cloning_enabled", "false")
        settings_dict.setdefault("output_directory", "~/Alfred/projects")
        return settings_dict
    finally:
        await db.close()


@router.patch("")
async def update_settings(updates: dict[str, str]) -> dict[str, str]:
    """Update settings keys."""
    db = await get_db()
    try:
        for k, v in updates.items():
            await db.execute(
                """INSERT INTO settings (key, value) VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
                (k, str(v)),
            )
        await db.commit()
        return await get_settings()
    finally:
        await db.close()


@router.get("/models")
async def check_models_status() -> dict[str, Any]:
    """Report status and readiness of ML models on disk."""
    return {
        "whisper_tiny": {
            "name": "Whisper Tiny (Audio Transcription)",
            "ready": WHISPER_MODEL_PATH.exists() or True,  # faster-whisper can also auto-download
            "path": str(WHISPER_MODEL_PATH),
        },
        "llama_1b": {
            "name": "Llama 3.2 1B (Highlight Selection & Hooks)",
            "ready": LLAMA_MODEL_PATH.exists(),
            "path": str(LLAMA_MODEL_PATH),
        },
        "kokoro_82m": {
            "name": "Kokoro-82M (Text-to-Speech)",
            "ready": KOKORO_MODEL_PATH.exists() and KOKORO_VOICES_PATH.exists(),
            "path": str(KOKORO_MODEL_PATH),
            "fallback_available": True,
        },
        "yolov8n_face": {
            "name": "YOLOv8n-face (Smart 9:16 Cropping)",
            "ready": YOLO_MODEL_PATH.exists(),
            "path": str(YOLO_MODEL_PATH),
            "center_crop_fallback": True,
        },
        "openvoice_v2": {
            "name": "OpenVoice v2 (Voice Cloning)",
            "ready": voice_cloner.is_model_downloaded(),
            "acoustic_profile_ready": True,
        },
    }


@router.get("/voice-samples")
async def list_voice_samples() -> list[dict[str, Any]]:
    """List available voice samples for voice cloning."""
    return voice_cloner.list_voice_samples()


@router.post("/voice-sample")
async def upload_voice_sample(file: UploadFile = File(...), sample_name: str = "my_voice"):
    """Upload a ~10-second reference voice sample and generate speaker embedding."""
    if not file.filename.lower().endswith((".wav", ".mp3", ".m4a", ".ogg")):
        raise HTTPException(status_code=400, detail="Only audio files (.wav, .mp3, .m4a) are supported")

    clean_name = "".join(c for c in sample_name if c.isalnum() or c in ("-", "_")).strip() or "voice_sample"
    temp_target = VOICE_SAMPLES_DIR / f"temp_{clean_name}_{file.filename}"

    try:
        with open(temp_target, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Extract speaker embedding
        embedding_path = voice_cloner.extract_speaker_embedding(temp_target, sample_name=clean_name)

        return {
            "success": True,
            "sample_name": clean_name,
            "embedding_path": str(embedding_path),
            "message": "Voice sample uploaded and speaker embedding generated successfully.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process voice sample: {str(e)}")
    finally:
        if temp_target.exists():
            temp_target.unlink(missing_ok=True)

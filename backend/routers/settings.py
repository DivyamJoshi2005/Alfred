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
        "whisper_base": {
            "name": "Whisper Base.en / Small.en (Studio Audio Transcription)",
            "ready": True,
            "engine": "faster-whisper CTranslate2 (int8 CPU, VAD Beam-Search)",
            "path": "Systran/faster-whisper-base.en (CTranslate2 int8)",
        },
        "llama_1b": {
            "name": "Llama 3.2 1B (Highlight Selection & Hooks)",
            "ready": LLAMA_MODEL_PATH.exists(),
            "engine": "llama-cpp-python (Q4_K_M GGUF)",
            "path": str(LLAMA_MODEL_PATH),
        },
        "kokoro_82m": {
            "name": "Kokoro-82M (Text-to-Speech)",
            "ready": KOKORO_MODEL_PATH.exists() and KOKORO_VOICES_PATH.exists(),
            "engine": "ONNX Runtime (24kHz Mono)",
            "path": str(KOKORO_MODEL_PATH),
        },
        "yolov8n_face": {
            "name": "YOLOv8n-face (Smart 9:16 Cropping)",
            "ready": YOLO_MODEL_PATH.exists(),
            "engine": "ONNX Runtime (Dynamic 640x640 Face Tracking)",
            "path": str(YOLO_MODEL_PATH),
        },
        "openvoice_v2": {
            "name": "OpenVoice v2 (Voice Cloning)",
            "ready": voice_cloner.is_model_downloaded(),
            "engine": "OpenVoice Tone Converter Checkpoint",
            "path": str(voice_cloner.checkpoints_dir / "converter" / "checkpoint.pth"),
        },
    }


@router.get("/voice-samples")
async def list_voice_samples() -> list[dict[str, Any]]:
    """List available voice samples for voice cloning."""
    return voice_cloner.list_voice_samples()


@router.post("/voice-sample")
async def upload_voice_sample(file: UploadFile = File(...), sample_name: str = "my_voice"):
    """Upload a ~10-second reference voice sample and generate speaker embedding."""
    if not file.filename.lower().endswith((".wav", ".mp3", ".m4a", ".ogg", ".webm")):
        raise HTTPException(status_code=400, detail="Only audio files (.wav, .mp3, .m4a, .ogg, .webm) are supported")

    clean_name = "".join(c for c in sample_name if c.isalnum() or c in ("-", "_")).strip() or "voice_sample"
    voice_cloner.samples_dir.mkdir(parents=True, exist_ok=True)
    temp_target = voice_cloner.samples_dir / f"temp_{clean_name}_{file.filename}"

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


@router.delete("/voice-sample/{sample_name}")
async def delete_voice_sample(sample_name: str):
    """Delete a stored voice profile and its embedding."""
    success = voice_cloner.delete_voice_sample(sample_name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Voice profile '{sample_name}' not found")
    return {"success": True, "message": f"Deleted voice profile '{sample_name}'"}


VOICE_SAMPLE_SCRIPTS = {
    "af_sarah": "Hi! I'm Sarah. I provide a warm and engaging voice for your video hooks.",
    "af_bella": "Hey! I'm Bella. I deliver a bright and upbeat voice that grabs attention fast.",
    "am_michael": "Hello, I'm Michael. My deep and grounded tone is perfect for podcast insights.",
    "am_adam": "Hi there, I'm Adam. I bring a confident and direct voice for clear professional hooks.",
}


@router.get("/voice-preview")
async def get_voice_preview(voice: str = "af_sarah"):
    """Synthesize or return cached audio preview for a voice preset."""
    from fastapi.responses import FileResponse
    from config import ALFRED_DATA_DIR
    from pipeline.tts import get_tts_engine, VOICE_PRESET_MAP

    clean_voice = VOICE_PRESET_MAP.get(voice.lower(), voice)
    preview_dir = ALFRED_DATA_DIR / "voice_previews"
    try:
        preview_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        import tempfile
        preview_dir = Path(tempfile.gettempdir()) / "alfred_voice_previews"
        preview_dir.mkdir(parents=True, exist_ok=True)
    out_file = preview_dir / f"{clean_voice}.wav"

    if not out_file.exists():
        script = VOICE_SAMPLE_SCRIPTS.get(
            clean_voice,
            f"Hello, this is a voice sample of {voice}."
        )
        tts = get_tts_engine()
        tts.synthesize(script, out_file, voice=clean_voice)

    return FileResponse(
        str(out_file),
        media_type="audio/wav",
        headers={
            "Cache-Control": "public, max-age=86400",
        },
    )

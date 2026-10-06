"""Alfred Backend — Configuration and path constants."""

import os
from pathlib import Path

# ── Base Paths ──────────────────────────────────────────────
HOME = Path.home()
ALFRED_DATA_DIR = HOME / ".alfred"
ALFRED_PROJECTS_DIR = HOME / "Alfred" / "projects"

# Database
DB_DIR = ALFRED_DATA_DIR / "db"
DB_PATH = DB_DIR / "alfred.db"

# Chromium browser profiles for social uploads
CHROMIUM_PROFILES_DIR = ALFRED_DATA_DIR / "chromium_profiles"

# Logs
LOG_DIR = ALFRED_DATA_DIR / "logs"
LOG_PATH = LOG_DIR / "alfred.log"

# ML Models (relative to app bundle in production, local in dev)
MODELS_DIR = Path(os.environ.get("ALFRED_MODELS_DIR", Path(__file__).parent.parent / "models"))

# Model file paths
WHISPER_MODEL_PATH = MODELS_DIR / "whisper-tiny.onnx"
LLAMA_MODEL_PATH = MODELS_DIR / "llama-3.2-1b.Q4_K_M.gguf"
KOKORO_MODEL_PATH = MODELS_DIR / "kokoro-82m.onnx"
KOKORO_VOICES_PATH = (MODELS_DIR / "voices.bin") if (MODELS_DIR / "voices.bin").exists() else (MODELS_DIR / "voices.json")
YOLO_MODEL_PATH = MODELS_DIR / "yolov8n-face.onnx"
XTTS_MODEL_DIR = MODELS_DIR / "xtts-v2"
VOICE_SAMPLES_DIR = ALFRED_DATA_DIR / "voice_samples"

# FFmpeg binary
FFMPEG_PATH = os.environ.get("ALFRED_FFMPEG_PATH", "ffmpeg")

# ── Server Config ───────────────────────────────────────────
SERVER_HOST = "127.0.0.1"
SERVER_PORT = int(os.environ.get("ALFRED_PORT", "8741"))

# ── Pipeline Config ─────────────────────────────────────────
# Whisper
WHISPER_SAMPLE_RATE = 16000
WHISPER_LANGUAGE = "en"

# Llama
LLAMA_CONTEXT_SIZE = 4096
LLAMA_TEMPERATURE = 0.3
LLAMA_MAX_TOKENS = 2048

# Clip extraction
MIN_CLIP_DURATION = 15   # seconds
MAX_CLIP_DURATION = 60   # seconds
TARGET_CLIP_COUNT = 5    # top N viral segments

# Smart crop
YOLO_SAMPLE_FPS = 2      # frames per second for face detection
CROP_SMOOTHING_WINDOW = 5 # moving average window for crop coords

# TTS
TTS_SAMPLE_RATE = 24000

# Scheduler
SCHEDULER_POLL_INTERVAL = 60  # seconds
MAX_UPLOAD_RETRIES = 3

# ── Video Config ────────────────────────────────────────────
SUPPORTED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
OUTPUT_VIDEO_CODEC = "libx264"
OUTPUT_VIDEO_PRESET = "medium"
OUTPUT_VIDEO_CRF = "23"
OUTPUT_AUDIO_CODEC = "aac"
OUTPUT_AUDIO_BITRATE = "128k"

# ── Ensure directories exist ───────────────────────────────
def ensure_directories():
    """Create all necessary directories on startup."""
    for directory in [
        ALFRED_DATA_DIR,
        ALFRED_PROJECTS_DIR,
        DB_DIR,
        CHROMIUM_PROFILES_DIR,
        LOG_DIR,
        VOICE_SAMPLES_DIR,
        MODELS_DIR,
    ]:
        directory.mkdir(parents=True, exist_ok=True)

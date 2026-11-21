# ⚙️ Alfred Backend & Local AI Studio

> Asynchronous FastAPI backend daemon, local AI model runtime, and media assembly engine for Alfred.

Alfred transforms long-form horizontal videos (keynotes, tech talks, podcasts, educational lectures) into high-retention 9:16 vertical shorts—**100% locally on-device**, with zero cloud API dependencies, zero telemetry, and complete data privacy.

---

## 📑 Table of Contents

- [Overview & Architecture](#overview-architecture)
- [Local AI Model Fleet](#local-ai-model-fleet)
- [Core Pipeline Modules](#core-pipeline-modules)
  - [1. Demuxing & Transcription (`transcriber.py`)](#1-demuxing-transcription-transcriberpy)
  - [2. Multimodal Hook & Viral Scoring (`multimodal_analyzer.py`)](#2-multimodal-hook-viral-scoring-multimodalanalyzerpy)
  - [3. Hook & Headline Generation (`hook_generator.py`)](#3-hook-headline-generation-hookgeneratorpy)
  - [4. Voice Synthesis & Cloning (`tts.py` & `voice_cloner.py`)](#4-voice-synthesis-cloning-ttspy-voiceclonerpy)
  - [5. Face Tracking & Smart Cropping (`smart_crop.py`)](#5-face-tracking-smart-cropping-smartcroppy)
  - [6. Precision Video Assembly & Audio Ducking (`assembler.py`)](#6-precision-video-assembly-audio-ducking-assemblerpy)
  - [7. Pipeline Orchestration (`orchestrator.py`)](#7-pipeline-orchestration-orchestratorpy)
- [Stealth Social Distribution & Playwright Automation](#stealth-social-distribution-playwright-automation)
  - [Instant "Publish Now" vs Scheduled Queue](#instant-publish-now-vs-scheduled-queue)
  - [Anti-Bot Fingerprint Hardening & Stealth Profiles](#anti-bot-fingerprint-hardening-stealth-profiles)
  - [Self-Healing Browser Setup & Linux Wayland Support](#self-healing-browser-setup-linux-wayland-support)
  - [Queue Management & Failure Recovery](#queue-management-failure-recovery)
- [Database Architecture & WAL Mode](#database-architecture-wal-mode)
- [Complete REST & WebSocket API Surface](#complete-rest-websocket-api-surface)
- [Backend Directory Layout](#backend-directory-layout)
- [Local Development & Setup](#local-development-setup)
- [Troubleshooting & Diagnostics](#troubleshooting-diagnostics)

---

## 🏛️ Overview & Architecture

The backend daemon is built around an asynchronous, non-blocking state machine running on **FastAPI**, **uvicorn**, and **asyncio**. It exposes both REST endpoints and a real-time WebSocket telemetry gateway (`/ws`), while coordinating local neural network inference and FFmpeg filtergraphs in background worker pools.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              FASTAPI ASYNC BACKEND DAEMON                              │
│                                                                                        │
│  [HTTP / REST GATEWAY]       [WEBSOCKET GATEWAY]       [BACKGROUND ENGINE]             │
│  POST /api/jobs/upload  ──►  ws://localhost:8741/ws ──► Pipeline Orchestrator          │
│  GET  /api/clips/job/{id}◄── Broadcast Stage Progress   (Async Worker Pool)            │
│  POST /api/clips/rerender    (0% → 100% telemetry)     │                               │
│  POST /api/schedule/publish-now                        ▼                               │
│                                                        [LOCAL AI ENGINE]               │
│  [PERSISTENCE LAYER]                                   1. FFmpeg Audio Demux (16kHz)   │
│  SQLite DB (~/.alfred/db/alfred.db)                    2. faster-whisper + Silero VAD  │
│  - jobs & transcripts tables                           3. Multimodal Energy Analyzer   │
│  - clips (metrics, framing, audio mode, storyboards)   4. Llama 3.2 1B Hook Writer     │
│  - scheduled_posts (status, attempts, last_error)      5. Kokoro-82M ONNX + Voice Clone│
│  - social_accounts (persistent Chromium sessions)      6. FFmpeg 9 Filtergraph Muxer   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧠 Local AI Model Fleet

All 5 local AI models operate completely offline without cloud API keys:

| Model | Architecture | Size | Role | Runtime | Hardware Optimization |
|---|---|---|---|---|---|
| **Whisper Base.en / Small.en** | CTranslate2 INT8 | ~140 MB / ~460 MB | Speech-to-text with word-level timestamps & Silero VAD | `faster-whisper` | CPU AVX2/AVX-512 SIMD & CUDA |
| **Llama 3.2 1B Instruct** | Q4_K_M GGUF | 771 MB | Viral highlight ranking & contextual attention hook writing | `llama-cpp-python` | Metal / CUDA / CPU BLAS |
| **Kokoro-82M** | StyleTTS2 ONNX | 311 MB | Ultra-fast 24kHz mono voice narration | `onnxruntime` | CPU & CUDA Execution Providers |
| **YOLOv8n-Face** | Dynamic 640×640 ONNX | 12.1 MB | Kinetic 9:16 smart cropping & face tracking | `onnxruntime` | Multithreaded frame inference |
| **OpenVoice v2** | PyTorch Checkpoint | 126 MB | Reference speaker tone converter & voice cloning | PyTorch / NumPy | CPU & CUDA |

> Check local model readiness anytime via `GET /api/settings/models`.

---

## ⚙️ Core Pipeline Modules

### 1. Demuxing & Transcription (`transcriber.py`)
- **Direct Stream Extraction**: Extracts master audio as 16kHz mono WAV (`-vn -ac 1 -ar 16000`) in < 1 second.
- **`faster-whisper` Engine**: Employs CTranslate2 INT8 quantization for fast, accurate speech recognition.
- **5-Path Beam Search**: Recognizes technical terminology, proper nouns, and fast speakers with high precision.
- **Silero Voice Activity Detection (VAD)**: Strictly gates transcription to human speech segments, eliminating music hallucinations and silence artifacts.
- Outputs granular word-level timestamps for frame-accurate clip boundary snapping.

### 2. Multimodal Hook & Viral Scoring (`multimodal_analyzer.py`)
Analyzes the master video across three parallel sensory dimensions:
- **Optical Flow Motion Energy**: Samples frames at 2 fps using OpenCV Farneback dense optical flow to detect visual momentum, camera pans, and screen transitions.
- **Dynamic Audio RMS Spikes**: Analyzes root-mean-square audio energy contrast to catch high-arousal acoustic events (laughter, audience applause, enthusiastic vocal swells, dramatic pauses).
- **Scene-Cut Boundary Anchoring**: Detects camera shot transitions to anchor clip start points naturally.
- **4-Frame Visual Hook Storyboards**: Automatically captures storyboard frames at `+0.0s`, `+1.0s`, `+2.0s`, and `+3.0s` to verify the opening visual energy.
- **Calibrated Retention Index (0–100%)**: Computes a non-linear percentile index where top highlight moments achieve 88%–96% predicted retention, accompanied by clear human-readable narrative rationales.

### 3. Hook & Headline Generation (`hook_generator.py`)
- Employs local **Llama 3.2 1B Instruct** (`llama-3.2-1b.Q4_K_M.gguf`) to synthesize:
  - **Spoken Hook**: A natural 1–2 sentence verbal teaser designed to spark curiosity without sounding like clickbait.
  - **Visual Headline**: A punchy 3–7 word uppercase headline badge placed in the upper 22% safe-zone.
- Includes a rule-based NLP fallback engine ensuring hook generation succeeds even without local LLM weights.

### 4. Voice Synthesis & Cloning (`tts.py` & `voice_cloner.py`)
- **Kokoro-82M ONNX**: 82M parameter StyleTTS2 model generating 24kHz studio audio at RTF ~0.10x.
- **Vocal Presets**: High-fidelity voices including `af_heart`, `af_bella`, `af_nicole`, `am_adam`, and `am_michael`.
- **In-Browser Reference Voice Recorder**: Record 10–15s reference samples with your microphone directly from Settings (`POST /api/settings/voice-sample`).
- **OpenVoice v2 Tone Conversion**: Extracts speaker acoustic embeddings from recorded reference samples and transfers personal timbre to synthesized hook narration completely offline.

### 5. Face Tracking & Smart Cropping (`smart_crop.py`)
- Uses **YOLOv8n-Face ONNX** to detect speaker faces at 2 fps.
- Computes smoothed horizontal crop windows using a 5-frame moving average window, preventing jarring camera jitter during head movement.

### 6. Precision Video Assembly & Audio Ducking (`assembler.py`)
Renders broadcast-ready 1080×1920 MP4 files using FFmpeg 9:
- **3 Presentation Framing Layouts**:
  - `presentation_fit`: 16:9 canvas centered with dark blurred background fill (0% slide cut off).
  - `split_screen`: Stacked dual viewports (speaker face top, slides/video bottom).
  - `face_focus`: Kinetic 9:16 crop tracked by YOLOv8n-face.
- **3 Audio Master Modes**:
  - `original`: 100% pure source dialogue with zero voiceover and zero ducking.
  - `intro_hook`: Spoken hook plays at clip start (`t=0.0s`) with calibrated background ducking to 15% and smooth recovery.
  - `custom_voiceover`: Timeline-positioned voiceover at user-defined `hook_offset_sec` with dynamic window ducking.
- **Visual Headline Badge**: Burns uppercase safe-zone headline text into the upper 22% margin, with full sanitization for FFmpeg 9 drawtext special characters (`%` converted to ` PERCENT`, quotes/colons escaped).

### 7. Pipeline Orchestration (`orchestrator.py`)
Coordinates the 6-stage extraction workflow in an async worker task, updating database records and broadcasting real-time progress events over WebSockets.

---

## 🚀 Stealth Social Distribution & Playwright Automation

Alfred includes an offline-first social distribution system that bypasses official developer API restrictions, token expirations, and platform developer review processes.

### Instant "Publish Now" vs Scheduled Queue
- **⚡ Instant "Publish Now" (`POST /api/schedule/publish-now`)**:
  - Automatically marks the clip as approved if needed.
  - Inserts a scheduled post with `scheduled_at = CURRENT_TIMESTAMP`.
  - Immediately dispatches a background upload task without waiting for the scheduler polling cycle.
- **📅 Scheduled Queue (`POST /api/schedule`)**:
  - Schedules a post for a specific future timestamp.
  - The background scheduler (`scheduler/worker.py`) polls every 30–60 seconds and triggers due posts.

### Anti-Bot Fingerprint Hardening & Stealth Profiles
- **Persistent Browser Profiles**: Profiles and cookies are stored in `~/.alfred/chromium_profiles/{platform}`.
- **Fingerprint Masking** (`uploaders/stealth.py`):
  - Hides `navigator.webdriver`.
  - Mocks `window.chrome`, browser plugins, languages, and notification permissions.
  - Uses randomized human-like typing cadence (40–120ms per key with natural micro-pauses).
  - Simulates mouse hover before clicking.

### Self-Healing Browser Setup & Linux Wayland Support
- **Automatic Self-Healing**: `ensure_playwright_browsers()` automatically detects if Chromium browser binaries are missing and installs them via `playwright install chromium`.
- **Linux Wayland/X11 Compatibility**: Configures launch arguments (`--ozone-platform-hint=auto`, `--ignore-certificate-errors`, `--no-sandbox`) to run smoothly across KDE Plasma, GNOME, and Linux desktop environments.

### Queue Management & Failure Recovery
- **Retry Single Failed Post** (`POST /api/schedule/{post_id}/retry`): Resets attempt counter, clears error logs, and triggers an immediate upload.
- **Retry All Failed Posts** (`POST /api/schedule/retry-all`): Batch recovery for all failed posts after network reconnection.
- **Clear Failed Records** (`DELETE /api/schedule/failed`): Purges all failed records from the queue.
- **Automatic Failure Reset**: Updating or rescheduling a failed post via `PATCH /api/schedule/{post_id}` automatically resets status to `scheduled` and clears error logs.

---

## 🗄️ Database Architecture & WAL Mode

Alfred uses an embedded SQLite database with Write-Ahead Logging (`PRAGMA journal_mode=WAL`) located at `~/.alfred/db/alfred.db`:

- `jobs`: Video ingestion jobs, original paths, and processing states (`queued`, `transcribing`, `analyzing`, `rendering`, `completed`, `failed`).
- `transcripts`: Full transcript text, word-level timestamps, and segment data.
- `clips`: AI-extracted highlight clips, In/Out timecodes, retention scores, storyboard paths, framing mode, audio mode, and hook offset.
- `scheduled_posts`: Social distribution queue, platform targets, scheduled timestamps, status (`scheduled`, `publishing`, `published`, `failed`), retry attempts, and error logs.
- `social_accounts`: Platform browser profile paths, account names, and authentication states.
- `settings`: Key-value application configuration store.

---

## 📡 Complete REST & WebSocket API Surface

### Ingestion & Jobs (`/api/jobs`)
| Method | Endpoint | Request Body | Description |
|---|---|---|---|
| `POST` | `/api/jobs/upload` | Multipart: `file: UploadFile`, `clip_count: int` | Ingest video and initiate processing pipeline |
| `GET` | `/api/jobs` | — | List all historical ingestion jobs |
| `GET` | `/api/jobs/{job_id}` | — | Get job progress, status, and clip list |
| `DELETE`| `/api/jobs/{job_id}` | — | Delete job and remove video files from disk |
| `POST` | `/api/jobs/{job_id}/cancel` | — | Cancel an active pipeline job |

### Clips & Editorial Deck (`/api/clips`)
| Method | Endpoint | Request Body | Description |
|---|---|---|---|
| `GET` | `/api/clips/{clip_id}` | — | Retrieve clip metadata, scores, and paths |
| `GET` | `/api/clips/job/{job_id}`| — | Retrieve all candidate clips for a job |
| `PATCH` | `/api/clips/{clip_id}` | `{status, hook_text, start_time, end_time, audio_mode, hook_offset_sec}` | Update clip approval status, hook text, or trim boundaries |
| `POST` | `/api/clips/{clip_id}/rerender` | `{start_time, end_time, framing_mode, audio_mode, hook_offset_sec}` | Re-render clip with custom boundaries, framing, or audio ducking |
| `POST` | `/api/clips/{clip_id}/synthesize-voice` | `{text, voice_preset, use_voice_clone, sample_name}` | Synthesize Kokoro or cloned voiceover track |

### Distribution & Scheduling (`/api/schedule`)
| Method | Endpoint | Request Body | Description |
|---|---|---|---|
| `POST` | `/api/schedule/publish-now` | `{clip_id, platform, title, description, tags}` | **Immediately upload clip right now** in the background |
| `POST` | `/api/schedule` | `{clip_id, platform, scheduled_at, title, description, tags}` | Schedule a clip for future publication |
| `GET` | `/api/schedule` | Query: `from_date`, `to_date` | Retrieve scheduled calendar posts |
| `PATCH` | `/api/schedule/{post_id}` | `{scheduled_at, title, description, tags, status}` | Reschedule post or update metadata (resets failure state) |
| `POST` | `/api/schedule/{post_id}/retry` | — | Reset failed post to scheduled and trigger immediate upload |
| `POST` | `/api/schedule/retry-all` | — | Reset all failed posts and trigger immediate uploads |
| `DELETE`| `/api/schedule/failed` | — | Bulk delete all failed scheduled posts |
| `DELETE`| `/api/schedule/{post_id}` | — | Cancel and delete a scheduled post |

### Social Accounts & Stealth Auth (`/api/accounts`)
| Method | Endpoint | Query / Body | Description |
|---|---|---|---|
| `GET` | `/api/accounts` | — | List all connected social account profiles |
| `GET` | `/api/accounts/{platform}/status` | — | Verify whether saved browser session cookies are still authenticated |
| `POST` | `/api/accounts/{platform}/connect` | Query: `interactive: bool` | Launch visible browser window for manual login and capture session |
| `DELETE`| `/api/accounts/{platform}` | — | Disconnect platform account and delete local profile |

### Settings & Local AI Studio (`/api/settings`)
| Method | Endpoint | Request Body | Description |
|---|---|---|---|
| `GET` | `/api/settings` | — | Retrieve system configuration and preferences |
| `POST` | `/api/settings` | Key-value settings object | Update application configuration |
| `GET` | `/api/settings/models` | — | Retrieve local readiness status of all 5 local AI models |
| `GET` | `/api/settings/voice-samples` | — | List recorded/uploaded voice cloning reference samples |
| `POST` | `/api/settings/voice-sample` | Multipart: `file: UploadFile` | Upload or save in-browser mic recording as reference sample |
| `DELETE`| `/api/settings/voice-samples/{filename}` | — | Delete a stored voice cloning sample |

### Media Streaming & Telemetry
| Protocol | Endpoint | Description |
|---|---|---|
| `GET` | `/api/media?path=...` | Byte-range video and storyboard frame streaming endpoint (`Accept-Ranges: bytes`) |
| `GET` | `/api/health` | System health check, database status, and uptime |
| `WS` | `/ws` | Real-time bi-directional pipeline telemetry channel |

---

## 📁 Backend Directory Layout

```text
backend/
├── main.py               # FastAPI application entry point, SPA static hosting & media streamer
├── config.py             # System paths, server ports, and model configurations
├── database.py           # SQLite schema, async connection pool, and migrations
├── models/               # Pydantic schemas (Job, Clip, Schedule, Account)
│   ├── __init__.py
│   ├── job.py
│   └── schedule.py
├── pipeline/             # Core local AI processing pipeline
│   ├── orchestrator.py   # Multi-stage automated pipeline coordinator
│   ├── transcriber.py    # Speech-to-text engine (faster-whisper + Silero VAD)
│   ├── analyzer.py       # Highlight ranker & viral scoring algorithms
│   ├── multimodal_analyzer.py # Optical flow motion, RMS energy & storyboards
│   ├── hook_generator.py # Spoken & visual attention hook generator (Llama 3.2)
│   ├── tts.py            # Kokoro-82M ONNX Text-to-Speech engine
│   ├── voice_cloner.py   # OpenVoice v2 tone converter
│   ├── smart_crop.py     # YOLOv8n-Face tracking & 9:16 layout logic
│   └── assembler.py      # FFmpeg 9 video slicer, master ducking & overlays
├── routers/              # REST & WebSocket API endpoints
│   ├── jobs.py           # Video upload, intake jobs, & telemetry
│   ├── clips.py          # Clip fine-tuning, re-rendering & voice synthesis
│   ├── schedule.py       # Calendar queue, retry logic, & instant publish
│   ├── accounts.py       # Interactive stealth browser login & session checks
│   ├── settings.py       # Model readiness checks & voice reference studio
│   └── ws.py             # Real-time WebSocket telemetry gateway
├── scheduler/            # Background broadcast scheduler
│   └── worker.py         # Cron loop polling due posts and dispatching uploads
├── uploaders/            # Social platform automation adapters
│   ├── base.py           # Abstract base uploader interface
│   ├── stealth.py        # Anti-detection stealth scripts & browser installer
│   ├── youtube.py        # YouTube Studio Shorts uploader
│   ├── instagram.py      # Instagram Reels uploader
│   └── twitter.py        # X (Twitter) video uploader
├── pyproject.toml        # Python package dependencies managed by uv
└── uv.lock               # Deterministic dependency lockfile
```

---

## 🚀 Local Development & Setup

### 1. Install Dependencies
```bash
cd backend
uv sync
```

### 2. Run the Daemon
```bash
uv run python main.py
```
- **Studio Web Interface**: [http://127.0.0.1:8741](http://127.0.0.1:8741)
- **Interactive OpenAPI Docs**: [http://127.0.0.1:8741/docs](http://127.0.0.1:8741/docs)

---

## ❓ Troubleshooting & Diagnostics

- **Playwright Missing Browser**: If Playwright reports a missing browser, run `.venv/bin/playwright install chromium` or rely on Alfred's automatic self-healing check.
- **Address Already in Use**: If port 8741 is busy, terminate the previous daemon with `fuser -k 8741/tcp`.
- **FFmpeg Text Escaping**: FFmpeg 9 enforces strict escaping on `drawtext` filters. Alfred automatically sanitizes special characters.

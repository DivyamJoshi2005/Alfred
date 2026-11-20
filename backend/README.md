# Alfred Backend & Local AI Studio

Offline-first AI content repurposing & distribution engine.

Alfred transforms long-form horizontal videos (vlogs, tech keynotes, podcasts, educational lectures) into high-retention 9:16 vertical shorts—100% locally with zero cloud API dependencies, zero recurring fees, and complete data privacy.

---

## Architecture & Local AI Models

Alfred runs completely on-device without cloud telemetry or external API keys. All 5 local AI models are managed and verified in `models/` and cached HuggingFace storage:

| Model | Architecture | Size | Role | Runtime |
|---|---|---|---|---|
| **Whisper Base.en / Small.en** | CTranslate2 INT8 | ~140 MB / ~460 MB | Studio Audio Transcription with word-level timestamps & Silero VAD | `faster-whisper` (CPU AVX2) |
| **Llama 3.2 1B Instruct** | Q4_K_M GGUF | 771 MB | Viral Highlight Identification & Contextual Hook Script Generation | `llama-cpp-python` |
| **Kokoro-82M** | StyleTTS2 ONNX | 311 MB | Ultra-fast Text-to-Speech narration (24kHz Mono) | `onnxruntime` |
| **YOLOv8n-Face** | Dynamic 640×640 ONNX | 12.1 MB | Kinetic 9:16 Smart Cropping & Face Tracking | `onnxruntime` |
| **OpenVoice v2** | PyTorch Checkpoint | 126 MB | Reference Speaker Tone Converter & Voice Cloning | PyTorch / NumPy |

Check all models' local readiness anytime via `GET /api/settings/models`.

---

## Key Pipeline Features

1. **Multimodal Visual & Audio Hook Analyzer** (`pipeline/multimodal_analyzer.py`):
   - Optical flow motion timeline analysis (2 fps) detecting visual transitions and camera motion.
   - Scene-cut boundary detection & anchoring.
   - Audio dynamic RMS contrast and spike detection (captures laughter, gasps, music swells).
   - Generates 4-frame visual hook storyboard proofs (`+0.0s`, `+1.0s`, `+2.0s`, `+3.0s`) for each clip.
   - Non-linear retention score calibration (top clips achieve 88%–96% predicted retention).

2. **Studio Audio Transcription with Silero VAD** (`pipeline/transcriber.py`):
   - 5-path beam search (`beam_size=5`) for accurate proper noun recognition.
   - Silero Voice Activity Detection filters out background music, preventing hallucinations.

3. **In-Browser Reference Voice Recorder** (`routers/settings.py`):
   - Direct mic recording via MediaRecorder with guided script cards.
   - Instant conversion to 24kHz reference WAV with speaker embedding generation for instant voice cloning.

4. **Multi-Framing 9:16 Layout Engine & Fast FFmpeg Slicing** (`pipeline/assembler.py`):
   - `presentation_fit`: 16:9 frame centered with blurred background fill (0% slide cut off).
   - `split_screen`: Stacked 2-tier (speaker face top, slides/video bottom).
   - `face_focus`: Kinetic 9:16 smart crop tracked by YOLOv8n-face.
   - Byte-range video streaming support (`Accept-Ranges: bytes`, `GET` & `HEAD` methods).

---

## Quickstart

### 1. Run the Backend Daemon
The backend serves both the API and the compiled frontend directly:

```bash
cd backend
.venv/bin/python main.py
```

- **Alfred Studio UI**: [http://127.0.0.1:8741](http://127.0.0.1:8741)
- **API Documentation (Swagger UI)**: [http://127.0.0.1:8741/docs](http://127.0.0.1:8741/docs)

### 2. Frontend Development Server (Optional)
For live UI development with Hot Module Replacement:

```bash
cd frontend
npm run dev
```

To re-build the production distribution:

```bash
cd frontend
npm run build
```

---

## REST & WebSocket API Surface

- `POST /api/jobs/upload`: Ingest video file and initiate transcription & multimodal analysis.
- `GET /api/jobs/{id}`: Detailed job progress, status, and candidate clip list.
- `GET /api/clips/job/{job_id}`: All clips with retention scores, hook scores, rationales, and storyboard paths.
- `PATCH /api/clips/{id}`: Update clip status (approve/reject), edit hook text, or adjust trim window.
- `POST /api/clips/{id}/rerender`: Re-render clip with adjusted trim timing, framing mode, or audio ducking.
- `POST /api/clips/{id}/synthesize-voice`: Synthesize custom speech or user-cloned voice for the hook.
- `GET /api/settings/models`: Live local readiness status of all 5 local AI models.
- `GET /api/settings/voice-samples` / `POST /api/settings/voice-sample`: List and upload/record voice cloning reference samples.
- `GET /api/media?path=...`: Byte-range video and storyboard frame streaming endpoint.
- `WS /ws`: Real-time pipeline telemetry, progress percentages, and status notifications.

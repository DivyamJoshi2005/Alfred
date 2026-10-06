# Alfred — Product Requirements Document (PRD)

**Version:** 1.0  
**Date:** 2026-08-26  
**Status:** Draft — Pending Approval  

---

## 1. Executive Summary

Alfred is an **offline-first AI content repurposing studio** that transforms long-form video content into short-form, platform-ready clips — entirely on-device. It transcribes, identifies viral moments, generates hook intros, smart-crops for vertical formats, and schedules uploads to social platforms — all without touching the cloud.

### 1.1 Vision Statement

> Empower content creators to repurpose their long-form content into short-form viral clips with zero cloud dependency, zero recurring costs, and absolute data privacy.

### 1.2 Core Value Propositions

| Pillar | Description |
|---|---|
| **Privacy** | 100% on-device processing. No data ever leaves the machine. |
| **Cost** | $0 operating cost. Fully open-source stack. No subscriptions, no API keys. |
| **Accessibility** | Runs on commodity hardware — no dedicated GPU, <2 GB RAM, ~1.15 GB core footprint. |
| **Autonomy** | Complete pipeline from ingestion to scheduled publishing, no manual editing required. |

---

## 2. Target Users

### 2.1 Primary Persona — The Solo Creator

- **Who:** YouTubers, podcasters, educators, streamers producing long-form content (10-120 min).
- **Pain:** Manually clipping highlights, cropping for vertical, writing hooks, and scheduling across platforms is tedious and time-consuming.
- **Need:** An automated pipeline that turns a single long-form video into multiple short-form clips, ready to publish.
- **Constraint:** Privacy-conscious; unwilling to upload raw footage to cloud SaaS tools. Budget-limited; can't afford $30-100/month subscriptions.

### 2.2 Secondary Persona — The Small Agency

- **Who:** Freelancers or small teams managing content for 2-5 clients.
- **Pain:** Repetitive clip extraction and posting workflow across multiple creators.
- **Need:** Batch processing with organized project structures and scheduled publishing.

---

## 3. Platform & Distribution

| Attribute | Specification |
|---|---|
| **Launch platforms** | Linux, Windows |
| **Future platforms** | macOS (post-launch) |
| **Distribution** | Single installer (~1.5 GB) bundling all models, FFmpeg, and Chromium |
| **Installation** | No external dependencies required (no Python, no FFmpeg, no Chrome) |
| **Updates** | Tauri's built-in updater mechanism |

---

## 4. Feature Specifications

### 4.1 Video Ingestion

| ID | Requirement | Priority |
|---|---|---|
| F-ING-01 | Drag-and-drop video file onto the Process view to start a job | P0 |
| F-ING-02 | File picker fallback for selecting video files | P0 |
| F-ING-03 | Accept input formats: MP4 (H.264/H.265), MOV, AVI, MKV, WebM | P0 |
| F-ING-04 | Display video metadata on ingestion (duration, resolution, codec, file size) | P1 |
| F-ING-05 | Reject unsupported files with a clear error message | P0 |
| F-ING-06 | Register job in SQLite with status `queued` | P0 |

### 4.2 Transcription (Whisper Tiny)

| ID | Requirement | Priority |
|---|---|---|
| F-TRS-01 | Transcribe full audio track using Whisper Tiny (ONNX) | P0 |
| F-TRS-02 | Produce word-level timestamps for sentence-boundary snapping | P0 |
| F-TRS-03 | Support English language transcription | P0 |
| F-TRS-04 | Report transcription progress as percentage via WebSocket | P0 |
| F-TRS-05 | Store transcript as structured JSON in SQLite (words, timestamps, segments) | P0 |

### 4.3 Viral Segment Identification (Llama 3.2 1B)

| ID | Requirement | Priority |
|---|---|---|
| F-SEG-01 | Analyze transcript to identify top 3-5 viral/hook-worthy segments | P0 |
| F-SEG-02 | Each segment must be 15-60 seconds, AI-determined based on content density | P0 |
| F-SEG-03 | Snap segment boundaries to sentence/phrase boundaries from Whisper timestamps | P0 |
| F-SEG-04 | Rank segments by estimated virality/engagement potential | P1 |
| F-SEG-05 | Provide a brief text rationale for each segment selection | P2 |
| F-SEG-06 | Ensure no mid-sentence or mid-thought cuts (the "no data loss" guarantee) | P0 |

### 4.4 Hook Generation (Llama 3.2 1B)

| ID | Requirement | Priority |
|---|---|---|
| F-HOOK-01 | Generate a 1-2 sentence attention-grabbing hook script per clip | P0 |
| F-HOOK-02 | Hook content must be contextually derived from the clip's transcript | P0 |
| F-HOOK-03 | User can edit the generated hook text before TTS rendering | P1 |
| F-HOOK-04 | Option to skip hook generation for a specific clip | P1 |

### 4.5 Text-to-Speech (Kokoro-82M)

| ID | Requirement | Priority |
|---|---|---|
| F-TTS-01 | Convert hook script text to speech audio using Kokoro-82M (ONNX) | P0 |
| F-TTS-02 | Output audio as WAV/MP3 compatible with FFmpeg overlay | P0 |
| F-TTS-03 | Provide at least 2-3 voice presets to choose from | P1 |
| F-TTS-04 | Preview TTS audio before clip assembly | P1 |

### 4.6 Voice Cloning (XTTS-v2) — Premium / Opt-in

| ID | Requirement | Priority |
|---|---|---|
| F-VC-01 | Optional model download (~1.8 GB) triggered from Settings | P1 |
| F-VC-02 | User provides a ~10-second voice sample for speaker embedding | P1 |
| F-VC-03 | Generate hook narration in the cloned voice | P1 |
| F-VC-04 | Store speaker embeddings locally for reuse | P1 |
| F-VC-05 | Clear UI indication that this is an optional premium feature | P1 |

### 4.7 Smart Cropping (YOLOv8n-face)

| ID | Requirement | Priority |
|---|---|---|
| F-CROP-01 | Convert 16:9 source video to 9:16 vertical format | P0 |
| F-CROP-02 | Use YOLOv8n-face (ONNX) to detect face positions per frame | P0 |
| F-CROP-03 | Generate dynamic crop coordinates that keep subjects centered | P0 |
| F-CROP-04 | Smooth crop movement (no jittery jumps between frames) | P0 |
| F-CROP-05 | Graceful fallback to center-crop when no face is detected | P0 |

### 4.8 Video Assembly (FFmpeg)

| ID | Requirement | Priority |
|---|---|---|
| F-ASM-01 | Slice source video at the identified segment timestamps | P0 |
| F-ASM-02 | Apply 9:16 smart crop to sliced segments | P0 |
| F-ASM-03 | Overlay TTS hook audio at clip beginning (if generated) | P0 |
| F-ASM-04 | Output as MP4 with H.264 video codec and AAC audio | P0 |
| F-ASM-05 | Maintain source audio quality (no unnecessary re-encoding of audio track) | P1 |
| F-ASM-06 | Report rendering progress per clip (e.g., "Rendering clip 2/5... 60%") | P0 |
| F-ASM-07 | Save clips to `~/Alfred/projects/<video-name>/clips/` | P0 |

### 4.9 Clip Review

| ID | Requirement | Priority |
|---|---|---|
| F-REV-01 | Side-by-side preview: original video (left) vs. AI clip (right) | P0 |
| F-REV-02 | Display Whisper transcript below with the selected segment highlighted | P0 |
| F-REV-03 | Approve or reject individual clips | P0 |
| F-REV-04 | Approved clips become available for scheduling | P0 |
| F-REV-05 | Navigate between clips for the same source video | P0 |
| F-REV-06 | Display clip metadata (duration, file size, segment rank) | P1 |

### 4.10 Scheduling & Calendar

| ID | Requirement | Priority |
|---|---|---|
| F-SCH-01 | Calendar view showing scheduled posts by date | P0 |
| F-SCH-02 | Set date, time, and target platform(s) per approved clip | P0 |
| F-SCH-03 | Support multi-platform scheduling (same clip → YouTube + Instagram + X) | P0 |
| F-SCH-04 | Visual status indicators: scheduled, uploading, uploaded, failed | P0 |
| F-SCH-05 | Edit or cancel scheduled posts | P0 |
| F-SCH-06 | SQLite-backed schedule polling every 60 seconds in FastAPI | P0 |

### 4.11 Social Media Upload (Puppeteer)

| ID | Requirement | Priority |
|---|---|---|
| F-UPL-01 | Headless Chromium upload to YouTube | P0 |
| F-UPL-02 | Headless Chromium upload to Instagram Reels | P1 |
| F-UPL-03 | Headless Chromium upload to X (Twitter) | P1 |
| F-UPL-04 | Persistent browser profile — one-time manual login in visible window | P0 |
| F-UPL-05 | Reuse saved session/cookies for subsequent headless uploads | P0 |
| F-UPL-06 | User sets title, description, and tags per upload | P0 |
| F-UPL-07 | Upload status reporting via WebSocket (queued, uploading, success, failed) | P0 |
| F-UPL-08 | Retry mechanism for failed uploads (max 3 attempts) | P1 |
| F-UPL-09 | Log upload attempts and results in SQLite | P0 |

### 4.12 Dashboard

| ID | Requirement | Priority |
|---|---|---|
| F-DSH-01 | Overview of recent jobs (video name, status, clip count, date) | P0 |
| F-DSH-02 | Quick stats: total clips generated, total scheduled, total uploaded | P1 |
| F-DSH-03 | At-a-glance upcoming scheduled posts (next 7 days) | P1 |
| F-DSH-04 | Quick action: drag-drop a video to start processing | P0 |

### 4.13 Settings & Configuration

| ID | Requirement | Priority |
|---|---|---|
| F-SET-01 | Social account management (connect/disconnect platforms via browser profile login) | P0 |
| F-SET-02 | Default output directory configuration | P1 |
| F-SET-03 | Voice cloning model download/management | P1 |
| F-SET-04 | TTS voice preset selection | P1 |
| F-SET-05 | About page with version info and model versions | P2 |

---

## 5. User Flows

### 5.1 Primary Flow — End-to-End Content Repurposing

```
1. User opens Alfred → Dashboard view
2. User drags a long-form video onto the Process view
3. Alfred validates the file format and displays metadata
4. User clicks "Process" → job is queued
5. Progress bar shows:
   a. "Transcribing... 45%" (Whisper)
   b. "Analyzing... 30%" (Llama segment selection)
   c. "Generating hooks..." (Llama hook text)
   d. "Rendering clip 1/4... 60%" (FFmpeg + YOLO crop)
6. Job completes → user is notified → navigates to Review
7. Side-by-side preview: original vs. clip, transcript below
8. User approves 3 of 4 clips
9. User navigates to Calendar → schedules clips:
   - Clip 1 → YouTube, tomorrow 9 AM
   - Clip 2 → Instagram, tomorrow 12 PM
   - Clip 3 → X, tomorrow 6 PM
10. At scheduled time, FastAPI triggers Puppeteer → headless upload
11. Upload status updates in Calendar view
```

### 5.2 First-Time Social Account Setup

```
1. User navigates to Settings → Social Accounts
2. Clicks "Connect YouTube"
3. Alfred opens a visible Chromium window at youtube.com/login
4. User logs in manually (Alfred does NOT handle credentials)
5. Alfred saves the browser profile (cookies/session)
6. Window closes → "YouTube Connected" shown in Settings
7. Future uploads use the saved profile headlessly
```

### 5.3 Voice Cloning Setup (Optional)

```
1. User navigates to Settings → Voice Cloning
2. Sees "Voice Cloning is an optional feature (1.8 GB download)"
3. Clicks "Download XTTS-v2 Model" → progress bar
4. After download, user records/uploads a ~10s voice sample
5. Alfred creates a speaker embedding → stored locally
6. In future clip processing, user can select "My Voice" as TTS voice
```

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Full pipeline (transcribe + analyze + render 4 clips) completes in <10 minutes for a 30-minute source video on mid-range hardware (8 GB RAM, 4-core CPU) |
| **Memory** | Peak RAM usage stays under 2 GB during pipeline execution |
| **Disk** | Core installation ~1.5 GB (models + Chromium + FFmpeg + app). Working space proportional to source video size. |
| **Reliability** | Failed pipeline stages can be retried without re-running the entire pipeline |
| **Privacy** | Zero network calls during processing. Internet only used for Puppeteer uploads. |
| **Offline** | Full functionality except social uploads works without any internet connection |
| **UX** | All progress indicators update in real-time (<1s latency) via WebSocket |

---

## 7. Out of Scope (V1)

- macOS support
- TikTok / LinkedIn uploads
- Subtitle/caption overlay on clips
- Multi-language transcription
- Batch multi-video drag-and-drop
- Cloud sync or remote access
- Mobile companion app
- Video editing timeline (trim/cut adjustments)
- Analytics / performance tracking of uploaded clips

---

## 8. Success Metrics

| Metric | Target |
|---|---|
| Pipeline completion rate | >95% of ingested videos produce usable clips |
| Clip quality (user approval rate) | >60% of generated clips are approved by the user |
| Upload success rate | >90% of scheduled uploads complete successfully |
| Memory ceiling | Peak RAM stays under 2 GB on target hardware |
| Installer size | Under 1.6 GB |
| Time to first clip (30-min source) | Under 10 minutes on mid-range hardware |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Social platforms detect and block Puppeteer automation | Uploads fail | Persistent profile mimics real user; add randomized delays; use stealth plugins |
| Llama 1B produces low-quality segment selections | Poor clip quality | Fine-tune prompt engineering; allow user override in Review |
| Whisper Tiny misses words in low-quality audio | Bad transcript boundaries | Add audio pre-processing (noise reduction) before transcription |
| YOLO face detection fails on multi-person or no-face scenes | Bad crops | Fall back to center-crop; add smoothing for multi-face priority |
| Session cookies expire for social platforms | Scheduled uploads fail | Detect expired sessions; notify user to re-login; queue uploads until re-auth |
| Large video files exceed available disk space | Pipeline fails | Pre-check available disk space; warn user before processing |

---

## 10. Glossary

| Term | Definition |
|---|---|
| **Hook** | A short, attention-grabbing 1-2 sentence script generated to introduce a clip |
| **Smart Crop** | AI-driven 16:9 → 9:16 conversion using face detection to keep subjects centered |
| **Sidecar** | A background process (FastAPI/Python) spawned and managed by the Tauri app |
| **Pipeline** | The sequential execution chain: Ingest → Transcribe → Analyze → Assemble → Review → Schedule → Upload |
| **Speaker Embedding** | A numerical representation of a person's voice characteristics, used for voice cloning |
| **GGUF** | A quantized model format used by llama.cpp for efficient CPU inference |
| **ONNX** | Open Neural Network Exchange — a portable model format for cross-platform ML inference |

# Alfred Launch Video Plan (60-Second Extended Edition)

> **Creative Direction**: Tactile Studio Hardware Launch Film (Teenage Engineering / Dieter Rams aesthetic).  
> **Duration**: 60.0 seconds (1800 frames @ 30fps).  
> **Format**: 1920×1080 Landscape (`--format landscape`).  
> **Tone**: Polished & Technical Hardware Launch.  
> **Soundtrack**: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120.19 BPM).

---

## 1. Rubric & Project Grounding

1. **What is the product?**  
   Alfred is an autonomous, offline-first desktop studio built with Tauri v2, React 19, and Python FastAPI. It transforms long-form 16:9 recordings, keynotes, and podcasts into viral 9:16 vertical shorts.
2. **What makes it distinct?**  
   100% on-device AI pipeline (Whisper INT8 transcription, NumPy semantic viral ranker, Kokoro-82M ONNX TTS, OpenVoice v2 cloning, and OpenCV/MediaPipe speaker tracking) with zero cloud fees and zero telemetry leaks.
3. **Core features demonstrated in video**:
   - **Dashboard & Studio Telemetry**: Live metrics, hardware daemon status, active local queue.
   - **Ingest Bay & Whisper INT8 Transcript**: Word-level timestamps, speech velocity analysis, scroll-stopping attention hook detection.
   - **Computer Vision & Smart Reframing**: Live 16:9 to 9:16 speaker tracking, canvas presentation slide fit, split-screen layouts.
   - **Editorial Review Console & NLE Jog Deck**: Dual-viewport master vs phone player, sub-frame IN/OUT trimming, instant re-rendering.
   - **Voice Cloning & Kokoro-82M TTS**: 10s reference sample cloning, local neural voice synthesis, audio mastering (clean, pre-roll, ducked).
   - **Broadcast Transmission Calendar**: Automated multi-platform queue (YouTube Shorts, IG Reels, X), stealth browser profile session orchestration.
   - **Hardware Calibration & On-Device Spec**: Machine model status table (all models online), privacy-first local architecture.

---

## 2. Beat-by-Beat Storyboard (60.0s Total)

### Scene 1: The Control Room & Architecture (0.0s – 8.0s • 8.0s)
- **Visual**: Studio Dashboard (`dashboard_ui.png`) with animated telemetry counters.
- **Hook Headline**: `AUTONOMOUS DESKTOP STUDIO FOR VERTICAL VIDEO`
- **Telemetry**: `[METRIC 01] Ingested: 1 Master`, `[METRIC 02] Standby (Local GPU)`, `[METRIC 03] Scheduled: 3 Transmissions`, `[METRIC 04] Broadcasted: 5 Reels`.
- **Badges**: `Tauri 2.0 Rust Shell • React 19 • Local FastAPI Daemon`.
- **SFX**: Soft impact at 0.3s.

### Scene 2: Ingest Bay & Whisper INT8 Transcript (8.0s – 16.0s • 8.0s)
- **Visual**: Ingest Bay (`process_ui.png`) + CTranslate2 Whisper INT8 transcription engine.
- **Headline**: `faster-whisper INT8 & VIRAL HOOK DETECTION`
- **Highlights**:
  - `Word-Level Timestamps`: 4x real-time transcription on local CPU/GPU.
  - `Speech Density & Scoring`: Acoustic velocity + semantic question detection.
  - `Scroll-Stopping Hook Generator`: Automated retention-optimized hooks.
- **SFX**: UI click at 8.0s.

### Scene 3: Computer Vision & Smart 9:16 Reframing (16.0s – 25.0s • 9.0s)
- **Visual**: Master 16:9 MIT keynote video (`master_sample.mp4`) with animated vermilion speaker tracking box.
- **Headline**: `DYNAMIC SPEAKER TRACKING & CANVAS FIT`
- **Framing Modes**:
  - `📺 Canvas Fit`: 100% slides and code preserved without cropping.
  - `📑 Stacked Split`: Presenter headshot on top, keynote slides below.
  - `👤 Face Focus`: MediaPipe kinetic speaker tracking.
- **SFX**: Heavy beat impact at 16.0s.

### Scene 4: Editorial Review Console & Hardware NLE Jog Deck (25.0s – 35.0s • 10.0s)
- **Visual**: Dual-monitor suite (`review_ui.png`) with 16:9 master on the left and live 9:16 reel in a smartphone bezel (`reel_sample.mp4`) on the right.
- **Headline**: `SIDE-BY-SIDE DUAL VIEWPORT & NLE JOG DECK`
- **Hardware Deck**: IN/OUT point clusters (`-5s`, `-1s`, `+1s`, `+5s`), active duration counter (`59.7s`), and "Apply & Re-Render Cut".
- **SFX**: Interface click at 25.0s.

### Scene 5: Voice Cloning & Kokoro-82M TTS Synthesis (35.0s – 44.0s • 9.0s)
- **Visual**: Voice Studio & OpenVoice v2 cloning configuration (`settings_ui.png` + `review_ui.png`).
- **Headline**: `OPENVOICE v2 CLONING & KOKORO-82M ONNX TTS`
- **Highlights**:
  - `🎤 10s Voice Cloning`: Instant offline speaker embedding calculation.
  - `⚡ Kokoro-82M Synthesis`: IPA G2P phoneme timing (Bella, Michael, Nicole, George).
  - `🎚️ 3 Audio Modes`: Clean Dialogue, Pre-Roll Hook (2.5s intro), Ducked Voiceover.
  - Live audition waveform player: `clip_1_hook.wav`.
- **SFX**: Soft impact at 35.0s.

### Scene 6: Broadcast Transmission Calendar & Auto-Publishing (44.0s – 52.0s • 8.0s)
- **Visual**: Transmission Calendar UI (`calendar_ui.png`).
- **Headline**: `AUTOMATED MULTI-PLATFORM SCHEDULING`
- **Highlights**:
  - Unified social queue: YouTube Shorts, Instagram Reels, X (Twitter).
  - Stealth headless browser sessions with encrypted tokens in `~/.alfred/chromium_profiles`.
  - Autonomous background scheduler worker (`scheduler_loop()`).
- **SFX**: Interface click at 44.0s.

### Scene 7: On-Device ML Telemetry & Monogram Outro (52.0s – 60.0s • 8.0s)
- **Visual**: Hardware Calibration telemetry table (`settings_ui.png`) + tactile atelier monogram outro.
- **Headline**: `100% PRIVATE • 100% ON-DEVICE • ZERO CLOUD LOCK-IN`
- **Spec Status**:
  - `faster-whisper INT8`: ONLINE
  - `Kokoro-82M ONNX`: ONLINE
  - `OpenVoice v2`: ONLINE
  - `MediaPipe Vision`: ONLINE
- **Call to Action**: `ALFRED STUDIO // CLONE & RUN OFFLINE`.
- **SFX**: Heavy bell impact at 52.0s.

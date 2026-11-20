# Hyperframes Composition Brief: Alfred

## Objective
Create a polished launch-style brag showcase video for Alfred, the offline-first AI content repurposing & distribution engine.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20.0 seconds

## Source Material
- Project root: `/home/Divyam/Desktop/Skills/Projects/Alfred`
- Primary files read: `README.md`, `package.json`, `src/index.css`, `src/views/Review.tsx`, `src/views/Process.tsx`, `src/views/Dashboard.tsx`, `backend/main.py`
- Product name: Alfred
- Tagline / strongest claim: "Transform 60-minute long-form horizontal videos into high-retention 9:16 vertical shorts — 100% locally, zero cloud fees, zero slide cutoff."
- Key UI or visual moment to recreate:
  - Dual synchronized 16:9 master vs 9:16 vertical smartphone cutdown with live video sample and kinetic captions
  - Hardware NLE jog trimmer bar (-5s, -1s, 482, +1s, +5s)
  - Framing switcher pill matrix: Canvas Fit (100% Slides Preserved), Stacked Split, Face Focus
  - Ingestion Bay with 6-stage AI telemetry badges
- Copy that must appear verbatim:
  - "Transform 60-minute long-form horizontal videos into broadcast-ready 9:16 vertical shorts"
  - "100% locally, zero cloud fees, zero slide cutoff"
  - "Editorial Review Console"
  - "Hardware NLE Jog Deck"
  - "Canvas Fit · 100% Slides Preserved"
  - "faster-whisper INT8 · Kokoro-82M ONNX · OpenCV Smart Crop"

## Creative Direction
- Tone preset: `polished`
- Creative direction: "tactile studio hardware launch film"
- Interpretation: Restrained, elegant, tactile hardware DAW aesthetic. Deep obsidian canvas contrasted with Frans Hals museum vermilion (`#f05537`) and precision monospace data tags. Fast, snappy entrances with generous settled holds so every word and UI control is fully legible.
- Angle: Modern creators and engineers shouldn't have to pay monthly cloud fees or sacrifice slide visibility when cutting vertical shorts. Alfred runs on your local machine with native desktop speed.
- Hook: 16:9 widescreen master lecture transforms into a 9:16 vertical smartphone reel in the first 3 seconds.
- Outro: Alfred monogram and title card lock with crisp capability pills.
- Avoid:
  - Generic SaaS buzzwords
  - Abstract floating blobs or filler shapes
  - Inauthentic UI mockups (use actual screenshots and actual video clips from the project!)

## Visual Identity
- Canvas background: `#08090b`
- Sidebar/Surface: `#0c0e12` / `#111318`
- Elevated surface: `#161922`
- Accent primary: `#f05537` (Frans Hals vermilion terracotta)
- Accent amber: `#e5a93c` (Studio calibration amber)
- Accent mint: `#2cd483` (Broadcast live green)
- Accent sky: `#38bdf8` (Metric info cyan)
- Text primary: `#f5f3ee` (Warm Dutch linen off-white)
- Text secondary: `#9ea3b0` (Neutral graphite)
- Display font: `Space Grotesk`, sans-serif
- Body font: `Plus Jakarta Sans`, sans-serif
- Monospace font: `JetBrains Mono`, monospace
- Visual references from the project:
  - Editorial Review Console UI (`review_highres.png`)
  - Ingestion Bay with 1-click stage footage (`process_highres.png`)
  - Real 9:16 vertical video cutdown (`reel_sample.mp4`)
  - Real 16:9 master video lecture (`master_sample.mp4`)

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Scene 1: The Transformation Hook — 4.5s (0.0s – 4.5s) — 16:9 widescreen master transforms to 9:16 vertical with bold hook typography: "60-MINUTE KEYNOTE ➔ 9:16 VERTICAL REEL. 100% LOCAL."
2. Scene 2: Ingestion & 6-Stage AI Engine — 5.0s (4.5s – 9.5s) — Real Ingest Bay UI with TEDx MIT talk staged, 4 local AI telemetry cards arrive on the beat grid: Whisper INT8, Viral Hook Scorer, Kokoro-82M TTS, Zero Slide Cutoff.
3. Scene 3: The Editorial Review Console & Hardware NLE — 6.0s (9.5s – 15.5s) — Centerpiece working app! Dual viewports (16:9 master + 9:16 smartphone reel playing actual video with kinetic captions), tactile hardware jog deck nudging timecodes, Canvas Fit framing matrix.
4. Scene 4: Studio Brand Payoff — 4.5s (15.5s – 20.0s) — Monogram, "ALFRED — Studio Edition", "Offline-First AI Content Repurposing Engine", feature capability badges, clean resolution.

## Audio
- Audio role: Upbeat electronic groove bed with tactile hardware DAW clicks and accents
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`
- Music treatment: Starts at 0.0s, steady bed level (volume: 0.65), ducking slightly during dense UI interaction, subtle fade over final logo
- Music cue guidance: 120.19 BPM. Strong cues at 3.02s, 6.03s, 9.52s, 14.02s, 17.02s. Beat grid: ~0.50s spacing for sequential items.
- Audio-reactive treatment: Subtle RMS/bass energy breathing into ambient glow and console borders.
- Audio-coupled moments:
  - 0.5s: Aspect ratio transform lock (`assets/sfx/impact/impactSoft_medium_001.ogg`)
  - 4.5s: Stage reveal (`assets/sfx/impact/impactSoft_medium_002.ogg`)
  - 9.5s: Editorial jog deck timecode lock (`assets/sfx/interface/click_002.ogg`)
  - 14.02s: Apply cut button click (`assets/sfx/interface/click_003.ogg`)
  - 17.02s: Final logo landing (`assets/sfx/impact/impactBell_heavy_000.ogg`)
- Audio files: Copied into `brag-output/composition/assets/`

## Hyperframes Instructions
Build a standalone Hyperframes HTML composition in `brag-output/composition/index.html`.
- Run `npx hyperframes check` to ensure zero lint, layout, motion, or contrast errors.
- Ensure all text holds long enough to be effortlessly read.
- Ground all facts in the actual Alfred repository.

"""FFmpeg Video Assembly — Slice, crop, overlay TTS, and render final clips."""

import asyncio
import json
from pathlib import Path
from typing import Any

from config import (
    FFMPEG_PATH,
    OUTPUT_VIDEO_CODEC, OUTPUT_VIDEO_PRESET, OUTPUT_VIDEO_CRF,
    OUTPUT_AUDIO_CODEC, OUTPUT_AUDIO_BITRATE,
)
from routers.ws import manager


async def assemble_clips(
    video_path: Path,
    segments: list[dict[str, Any]],
    output_dir: Path,
    job_id: str,
) -> list[dict[str, Any]]:
    """Assemble final clips: slice video, apply smart crop, overlay TTS hook.

    For each segment:
    1. Slice source at segment timestamps
    2. Apply 9:16 smart crop (face-tracked or center)
    3. Overlay TTS hook audio at the beginning (if available)
    4. Encode as MP4 H.264 + AAC

    Returns segments with 'output_path' added.
    """
    total = len(segments)
    output_dir.mkdir(parents=True, exist_ok=True)

    for i, seg in enumerate(segments):
        progress = int((i / total) * 100) if total > 0 else 0
        rank = seg.get("rank", i + 1)

        await manager.send_progress(
            job_id, "rendering", progress,
            f"Rendering clip {i+1}/{total}...",
            clip_index=i + 1,
            clip_total=total,
        )

        output_path = output_dir / f"clip_{rank}.mp4"
        hook_audio = seg.get("hook_audio_path")
        crop_coords = seg.get("crop_coords")
        hook_text = seg.get("hook_text")

        try:
            await _render_clip(
                video_path=video_path,
                start_time=seg["start_time"],
                end_time=seg["end_time"],
                output_path=output_path,
                crop_coords=crop_coords,
                hook_audio_path=hook_audio,
                hook_text=hook_text,
            )
            seg["output_path"] = str(output_path)
        except Exception as e:
            print(f"[Assembler] Failed to render clip {rank}: {e}")
            # Try again with simpler settings
            try:
                await _render_clip_simple(
                    video_path=video_path,
                    start_time=seg["start_time"],
                    end_time=seg["end_time"],
                    output_path=output_path,
                )
                seg["output_path"] = str(output_path)
            except Exception as e2:
                print(f"[Assembler] Simple render also failed for clip {rank}: {e2}")
                seg["output_path"] = None

    await manager.send_progress(job_id, "rendering", 100, f"All {total} clips rendered")
    return segments


def _format_visual_hook_text(text: str) -> str:
    """Format a punchy 3-7 word scroll-stopping headline for the on-screen visual badge."""
    import re
    if not text:
        return ""

    clean = re.sub(r'[\r\n\t]+', ' ', text).strip().strip('"\'')

    # Strip conversational spoken fillers that shouldn't appear on a visual title sticker
    fillers = [
        r"^(ever wondered this\??\s*)",
        r"^(here is the truth:?\s*)",
        r"^(wait until you hear this:?\s*)",
        r"^(did you know that\??\s*)",
        r"^(stop scrolling and listen:?\s*)",
        r"^(listen up:?\s*)",
    ]
    candidate = clean
    for f in fillers:
        candidate = re.sub(f, '', candidate, flags=re.IGNORECASE).strip()

    if not candidate:
        candidate = clean

    # Pick the most provocative clause
    sentences = [s.strip() for s in re.split(r'[.!?]+', candidate) if s.strip()]
    target = sentences[0] if sentences else candidate

    # Keep between 3 and 7 words
    words = target.split()
    if len(words) > 7:
        target = " ".join(words[:6])
    else:
        target = " ".join(words)

    if len(target) > 38:
        trimmed = target[:36]
        last_space = trimmed.rfind(' ')
        if last_space > 15:
            target = trimmed[:last_space]
        else:
            target = trimmed

    # Ensure question-like hooks retain punctuation
    if any(q in clean.lower() for q in ["why", "how", "what", "who", "when", "?"]) and not target.endswith("?"):
        if not target.endswith((".", "!", "?")):
            target += "?"

    # Escape for FFmpeg drawtext: ' -> '', : -> ' - ', % -> %%
    escaped = target.replace("'", "").replace(":", " - ").replace("%", "%%")
    return escaped.upper().strip()


async def render_single_clip(
    video_path: Path,
    start_time: float,
    end_time: float,
    output_path: Path,
    crop_coords: list[dict] | None = None,
    hook_audio_path: str | None = None,
    hook_text: str | None = None,
    framing_mode: str = "presentation_fit",
    audio_mode: str = "original",
):
    """Render a single clip with specified framing mode, visual hook, and audio mode.

    Framing Modes:
    - 'presentation_fit': Full 16:9 frame centered with blurred background fill (100% of slides/text preserved!)
    - 'split_screen': Stacked 2-tier (Presenter face top half, Presentation slides bottom half)
    - 'face_focus': Kinetic 9:16 smart crop with 1.15x punch-in zoom

    Audio Modes:
    - 'original': Clean unmixed speaker dialogue from the video (No voiceover overlap!)
    - 'preroll': Hook audio plays as pre-roll buffer, followed by clip dialogue
    - 'voiceover': Ducks video audio during hook speech
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Video Filter Construction
    if framing_mode == "presentation_fit":
        # Full 16:9 frame centered on 1080x1920 with blurred backdrop — zero text/slide cutoff!
        drawtext_part = ""
        if hook_text:
            visual_headline = _format_visual_hook_text(hook_text)
            if visual_headline:
                drawtext_part = (
                    f",drawtext=text='{visual_headline}':enable='between(t,0,2.8)':"
                    f"fontsize=48:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=16:"
                    f"x=(w-text_w)/2:y=h*0.12"
                )
        v_filter = (
            f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=22:22,eq=brightness=-0.14[bg];"
            f"[0:v]scale=1080:-1:flags=lanczos[fg];"
            f"[bg][fg]overlay=0:(H-h)/2{drawtext_part},format=yuv420p[v]"
        )

    elif framing_mode == "split_screen":
        # Stacked Presenter top (1080x800) + Presentation slides bottom (1080x1120)
        if crop_coords and len(crop_coords) > 0:
            avg_x = sum(c["x_center"] for c in crop_coords if c.get("x_center")) / max(
                len([c for c in crop_coords if c.get("x_center")]), 1
            )
            crop_x = f"min(max(0,(iw*{avg_x:.4f})-(ow)/2),iw-ow)"
        else:
            crop_x = "(iw-ow)/2"

        drawtext_part = ""
        if hook_text:
            visual_headline = _format_visual_hook_text(hook_text)
            if visual_headline:
                drawtext_part = (
                    f",drawtext=text='{visual_headline}':enable='between(t,0,2.8)':"
                    f"fontsize=44:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=16:"
                    f"x=(w-text_w)/2:y=24"
                )
        v_filter = (
            f"[0:v]crop=w=ih*9/16:h=ih*0.75:x='{crop_x}':y=0,scale=1080:800:flags=lanczos[top];"
            f"[0:v]scale=1080:1120:force_original_aspect_ratio=decrease,pad=1080:1120:(ow-iw)/2:(oh-ih)/2:black[bot];"
            f"[top][bot]vstack{drawtext_part},format=yuv420p[v]"
        )

    else:  # 'face_focus'
        crop_w = "if(lt(t,2.5),(ih*9/16)/1.15,ih*9/16)"
        crop_h = "if(lt(t,2.5),ih/1.15,ih)"
        if crop_coords and len(crop_coords) > 0:
            avg_x = sum(c["x_center"] for c in crop_coords if c.get("x_center")) / max(
                len([c for c in crop_coords if c.get("x_center")]), 1
            )
            crop_x = f"min(max(0,(iw*{avg_x:.4f})-(ow)/2),iw-ow)"
        else:
            crop_x = "(iw-ow)/2"
        crop_y = "(ih-oh)/2"

        drawtext_part = ""
        if hook_text:
            visual_headline = _format_visual_hook_text(hook_text)
            if visual_headline:
                drawtext_part = (
                    f",drawtext=text='{visual_headline}':enable='between(t,0,2.8)':"
                    f"fontsize=50:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=18:"
                    f"x=(w-text_w)/2:y=h*0.22"
                )
        v_filter = (
            f"[0:v]crop=w='{crop_w}':h='{crop_h}':x='{crop_x}':y='{crop_y}',"
            f"scale=1080:1920:flags=lanczos{drawtext_part},format=yuv420p[v]"
        )

    # 2. Audio & FFmpeg Command Assembly
    cmd = [
        FFMPEG_PATH,
        "-ss", str(start_time),
        "-to", str(end_time),
        "-i", str(video_path),
    ]

    has_hook = bool(hook_audio_path and Path(hook_audio_path).exists())

    if audio_mode == "preroll" and has_hook:
        cmd.extend(["-i", str(hook_audio_path)])
        cmd.extend([
            "-filter_complex",
            f"{v_filter};[1:a][0:a]concat=n=2:v=0:a=1[a]",
            "-map", "[v]",
            "-map", "[a]",
        ])
    elif audio_mode == "voiceover" and has_hook:
        cmd.extend(["-i", str(hook_audio_path)])
        cmd.extend([
            "-filter_complex",
            f"{v_filter};[0:a]volume='if(lt(t,3.0),0.15,1.0)':eval=frame[ducked];[1:a]apad=pad_len=0[hk];[ducked][hk]amix=inputs=2:duration=first:dropout_transition=2[a]",
            "-map", "[v]",
            "-map", "[a]",
        ])
    else:
        # Default: Clean original dialogue (zero voice overlap!)
        cmd.extend([
            "-filter_complex", v_filter,
            "-map", "[v]",
            "-map", "0:a?",
        ])

    cmd.extend([
        "-c:v", OUTPUT_VIDEO_CODEC,
        "-preset", OUTPUT_VIDEO_PRESET,
        "-crf", OUTPUT_VIDEO_CRF,
        "-c:a", OUTPUT_AUDIO_CODEC,
        "-b:a", OUTPUT_AUDIO_BITRATE,
        "-movflags", "+faststart",
        "-y",
        str(output_path),
    ])

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()

    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {stderr.decode()[:500]}")


# Backward-compatible alias
_render_clip = render_single_clip


async def _render_clip_simple(
    video_path: Path,
    start_time: float,
    end_time: float,
    output_path: Path,
):
    """Simple fallback render — center crop to 9:16, no TTS overlay."""
    cmd = [
        FFMPEG_PATH,
        "-ss", str(start_time),
        "-to", str(end_time),
        "-i", str(video_path),
        "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920:flags=lanczos",
        "-c:v", OUTPUT_VIDEO_CODEC,
        "-preset", "fast",
        "-crf", "25",
        "-c:a", OUTPUT_AUDIO_CODEC,
        "-b:a", OUTPUT_AUDIO_BITRATE,
        "-movflags", "+faststart",
        "-y",
        str(output_path),
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()

    if process.returncode != 0:
        raise RuntimeError(f"FFmpeg simple render failed: {stderr.decode()[:500]}")

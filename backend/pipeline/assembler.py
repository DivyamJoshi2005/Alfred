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
    framing_mode: str = "presentation_fit",
    audio_mode: str | None = None,
) -> list[dict[str, Any]]:
    """Assemble final clips: slice video, apply smart crop, overlay TTS hook.

    For each segment:
    1. Slice source at segment timestamps
    2. Apply 9:16 smart crop (presentation_fit, split_screen, or face_focus)
    3. Overlay TTS hook audio if available (voiceover ducking or preroll)
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

        # Default to voiceover mode when hook audio is available
        chosen_audio_mode = audio_mode
        if chosen_audio_mode is None:
            chosen_audio_mode = "voiceover" if (hook_audio and Path(hook_audio).exists()) else "original"

        try:
            await _render_clip(
                video_path=video_path,
                start_time=seg["start_time"],
                end_time=seg["end_time"],
                output_path=output_path,
                crop_coords=crop_coords,
                hook_audio_path=hook_audio,
                hook_text=hook_text,
                framing_mode=framing_mode,
                audio_mode=chosen_audio_mode,
                ducking_volume=float(seg.get("ducking_volume", 0.15)),
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

    # Escape and sanitize characters that break FFmpeg drawtext or filter syntax
    # Replace % with PERCENT so drawtext doesn't crash with "Stray %"
    target = target.replace("%", " PERCENT")
    target = target.replace(":", " - ").replace(";", " - ")
    target = target.replace("'", "").replace('"', '').replace("\\", " ")
    target = target.replace("[", "(").replace("]", ")")
    target = " ".join(target.split())
    return target.upper().strip()


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
    hook_offset_sec: float = 0.0,
    ducking_volume: float = 0.15,
):
    """Render a single clip with specified framing mode, visual hook, and audio mode.

    Framing Modes:
    - 'presentation_fit': Full 16:9 frame centered with blurred background fill (100% of slides/text preserved!)
    - 'split_screen': Stacked 2-tier (Presenter face top half, Presentation slides bottom half)
    - 'face_focus': Kinetic 9:16 smart crop with 1.15x punch-in zoom

    Audio Modes:
    - 'original': Pure video sound. Zero voiceovers, overlays, or ducking.
    - 'intro_hook': Spoken hook voiceover plays at clip start (t=0.0s) with background ducking.
    - 'custom_voiceover': Custom timeline placement. Hook voiceover starts at hook_offset_sec.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mode = (audio_mode or "original").lower().strip()
    offset = max(0.0, float(hook_offset_sec or 0.0))
    duck_vol = max(0.0, min(1.0, float(ducking_volume if ducking_volume is not None else 0.15)))
    badge_start = offset if mode in ("custom_voiceover", "voiceover", "full_voiceover") else 0.0
    badge_end = badge_start + 2.8

    # 1. Video Filter Construction
    if framing_mode == "presentation_fit":
        # Full 16:9 frame centered on 1080x1920 with blurred backdrop — zero text/slide cutoff!
        drawtext_part = ""
        if hook_text:
            visual_headline = _format_visual_hook_text(hook_text)
            if visual_headline:
                drawtext_part = (
                    f",drawtext=text='{visual_headline}':enable='between(t,{badge_start:.2f},{badge_end:.2f})':"
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
                    f",drawtext=text='{visual_headline}':enable='between(t,{badge_start:.2f},{badge_end:.2f})':"
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
                    f",drawtext=text='{visual_headline}':enable='between(t,{badge_start:.2f},{badge_end:.2f})':"
                    f"fontsize=50:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=18:"
                    f"x=(w-text_w)/2:y=h*0.22"
                )
        v_filter = (
            f"[0:v]crop=w='{crop_w}':h='{crop_h}':x='{crop_x}':y='{crop_y}',"
            f"scale=1080:1920:flags=lanczos{drawtext_part},format=yuv420p[v]"
        )

    # 2. Audio & FFmpeg Command Assembly
    clip_dur = max(1.0, round(end_time - start_time, 3))
    cmd = [
        FFMPEG_PATH,
        "-ss", str(start_time),
        "-t", str(clip_dur),
        "-i", str(video_path),
    ]

    has_hook = bool(hook_audio_path and Path(hook_audio_path).exists())

    # Dynamically measure hook duration to calibrate audio ducking
    hook_duck_sec = 3.0
    if has_hook:
        try:
            import soundfile as sf
            _info = sf.info(str(hook_audio_path))
            hook_duck_sec = max(1.0, round(_info.duration + 0.35, 2))
        except Exception:
            pass

    if mode == "original" or not has_hook:
        # Original sound: absolutely NO voiceovers, no ducking, pure original video sound
        cmd.extend([
            "-filter_complex", v_filter,
            "-map", "[v]",
            "-map", "0:a?",
        ])
    elif mode in ("intro_hook", "preroll"):
        # Intro hook: hook voiceover plays at start (t=0s), original sound ducked during hook
        cmd.extend(["-i", str(hook_audio_path)])
        cmd.extend([
            "-filter_complex",
            f"{v_filter};[0:a]volume='if(lt(t,{hook_duck_sec:.2f}),{duck_vol:.2f},1.0)':eval=frame[ducked];[1:a]apad=pad_len=0[hk];[ducked][hk]amix=inputs=2:duration=first:dropout_transition=2[a]",
            "-map", "[v]",
            "-map", "[a]",
        ])
    else:
        # Custom timeline voiceover / full voiceover: user decides placement offset via slider
        delay_ms = int(round(offset * 1000))
        duck_start = offset
        duck_end = offset + hook_duck_sec

        cmd.extend(["-i", str(hook_audio_path)])
        if delay_ms > 0:
            hk_filter = f"[1:a]adelay={delay_ms}|{delay_ms},apad=pad_len=0[hk]"
        else:
            hk_filter = "[1:a]apad=pad_len=0[hk]"

        duck_filter = f"[0:a]volume='if(between(t,{duck_start:.2f},{duck_end:.2f}),{duck_vol:.2f},1.0)':eval=frame[ducked]"
        cmd.extend([
            "-filter_complex",
            f"{v_filter};{duck_filter};{hk_filter};[ducked][hk]amix=inputs=2:duration=first:dropout_transition=2[a]",
            "-map", "[v]",
            "-map", "[a]",
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
        err_text = stderr.decode(errors="replace")
        tail = err_text[-1500:] if len(err_text) > 1500 else err_text
        raise RuntimeError(f"FFmpeg failed (exit code {process.returncode}):\n{tail.strip()}")


# Backward-compatible alias
_render_clip = render_single_clip


async def _render_clip_simple(
    video_path: Path,
    start_time: float,
    end_time: float,
    output_path: Path,
):
    """Simple fallback render — center crop to 9:16, no TTS overlay."""
    clip_dur = max(1.0, round(end_time - start_time, 3))
    cmd = [
        FFMPEG_PATH,
        "-ss", str(start_time),
        "-t", str(clip_dur),
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

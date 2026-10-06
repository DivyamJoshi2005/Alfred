"""YOLOv8n-face smart cropping — detect faces for 16:9 → 9:16 conversion."""

import asyncio
from pathlib import Path
from typing import Any

from config import YOLO_MODEL_PATH, YOLO_SAMPLE_FPS, CROP_SMOOTHING_WINDOW, FFMPEG_PATH
from routers.ws import manager


async def detect_faces_for_segments(
    video_path: Path,
    segments: list[dict[str, Any]],
    job_id: str,
) -> list[dict[str, Any]]:
    """Run face detection on each clip segment to generate crop coordinates.

    Samples frames at YOLO_SAMPLE_FPS and generates dynamic crop coordinates
    that keep the primary face centered when converting 16:9 to 9:16.

    Returns segments with 'crop_coords' added — a list of (frame_time, x_center) pairs.
    """
    if not YOLO_MODEL_PATH.exists():
        # No YOLO model — fall back to center crop for all segments
        await manager.send_progress(job_id, "cropping", 100, "No YOLO model — using center crop")
        for seg in segments:
            seg["crop_coords"] = None  # Will trigger center-crop in assembler
        return segments

    await manager.send_progress(job_id, "cropping", 5, "Loading face detection model...")

    import onnxruntime as ort
    import numpy as np

    session = ort.InferenceSession(
        str(YOLO_MODEL_PATH),
        providers=["CPUExecutionProvider"],
    )

    total = len(segments)
    for i, seg in enumerate(segments):
        progress = 10 + int((i / total) * 85)
        await manager.send_progress(
            job_id, "cropping", progress,
            f"Detecting faces in clip {i+1}/{total}..."
        )

        start_time = seg["start_time"]
        end_time = seg["end_time"]
        duration = end_time - start_time

        # Extract frames at sample rate
        frames = await _extract_frames(video_path, start_time, end_time, YOLO_SAMPLE_FPS)

        if not frames:
            seg["crop_coords"] = None
            continue

        # Run face detection on each frame
        detections = []
        for frame_idx, (frame_time, frame_data) in enumerate(frames):
            face_x = _detect_face_center(session, frame_data, np)
            detections.append({
                "time": frame_time,
                "x_center": face_x,  # None if no face detected
            })

        # Smooth the x coordinates with a moving average
        x_values = [d["x_center"] for d in detections]
        smoothed = _smooth_coordinates(x_values, CROP_SMOOTHING_WINDOW)

        crop_coords = [
            {"time": d["time"], "x_center": s}
            for d, s in zip(detections, smoothed)
        ]

        seg["crop_coords"] = crop_coords

    # Cleanup
    del session

    await manager.send_progress(job_id, "cropping", 100, "Face detection complete")
    return segments


async def _extract_frames(
    video_path: Path,
    start_time: float,
    end_time: float,
    fps: int,
) -> list[tuple[float, bytes]]:
    """Extract frames from video segment using FFmpeg at given FPS."""
    import tempfile
    import os
    import struct

    duration = end_time - start_time
    frame_count = int(duration * fps)

    frames = []
    for i in range(frame_count):
        t = start_time + (i / fps)
        # Extract a single frame as raw RGB
        cmd = [
            FFMPEG_PATH,
            "-ss", str(t),
            "-i", str(video_path),
            "-vframes", "1",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-s", "640x640",  # YOLO input size
            "-y",
            "pipe:1",
        ]
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        if stdout and len(stdout) == 640 * 640 * 3:
            frames.append((t, stdout))

    return frames


def _detect_face_center(session, frame_data: bytes, np) -> float | None:
    """Run YOLOv8n-face on a frame and return the x-center of the largest face.

    Returns x_center as a ratio (0.0 to 1.0), or None if no face detected.
    """
    # Convert raw bytes to numpy array
    img = np.frombuffer(frame_data, dtype=np.uint8).reshape(640, 640, 3)

    # Preprocess: normalize to [0, 1], add batch dim, transpose to NCHW
    input_tensor = img.astype(np.float32) / 255.0
    input_tensor = np.transpose(input_tensor, (2, 0, 1))  # HWC -> CHW
    input_tensor = np.expand_dims(input_tensor, axis=0)    # Add batch

    # Get model input name
    input_name = session.get_inputs()[0].name

    # Run inference
    try:
        outputs = session.run(None, {input_name: input_tensor})
        predictions = outputs[0]  # Shape: [1, num_detections, 5+] for YOLOv8

        if predictions.shape[-1] < 5:
            return None

        # Filter by confidence (5th column)
        if len(predictions.shape) == 3:
            preds = predictions[0]  # Remove batch dim
        else:
            preds = predictions

        # Find the detection with highest confidence
        if preds.shape[0] == 0:
            return None

        # YOLOv8 output format: [x_center, y_center, width, height, confidence, ...]
        confidences = preds[:, 4]
        best_idx = np.argmax(confidences)

        if confidences[best_idx] < 0.3:  # Confidence threshold
            return None

        x_center = float(preds[best_idx, 0]) / 640.0  # Normalize to 0-1
        return x_center

    except Exception:
        return None


def _smooth_coordinates(values: list[float | None], window: int) -> list[float]:
    """Apply moving average smoothing to crop coordinates.

    None values (no face detected) are interpolated from neighbors.
    """
    import numpy as np

    # Fill None values with interpolation
    filled = []
    last_valid = 0.5  # Default to center
    for v in values:
        if v is not None:
            last_valid = v
            filled.append(v)
        else:
            filled.append(last_valid)

    # Apply moving average
    arr = np.array(filled)
    if len(arr) <= window:
        return filled

    kernel = np.ones(window) / window
    smoothed = np.convolve(arr, kernel, mode='same')

    # Fix edges
    half_w = window // 2
    smoothed[:half_w] = arr[:half_w]
    smoothed[-half_w:] = arr[-half_w:]

    return [round(float(x), 4) for x in smoothed]

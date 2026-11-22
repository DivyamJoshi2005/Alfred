"""Pydantic models for job-related requests and responses."""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class JobCreate(BaseModel):
    """Request to create a new processing job."""
    video_path: str = Field(..., description="Absolute path to the source video file")


class YouTubeIngestCreate(BaseModel):
    """Request to ingest and process a video directly from a YouTube URL."""
    url: str = Field(..., description="YouTube video or Shorts URL")


class JobResponse(BaseModel):
    """Job data returned from API."""
    id: str
    video_path: str
    video_name: str
    status: str
    created_at: str
    updated_at: str
    error_msg: Optional[str] = None


class JobDetailResponse(JobResponse):
    """Job with associated clips."""
    clips: list["ClipResponse"] = []


class ClipResponse(BaseModel):
    """Clip data returned from API."""
    id: str
    job_id: str
    rank: int
    start_time: float
    end_time: float
    duration: float
    transcript_text: str
    hook_text: Optional[str] = None
    hook_audio_path: Optional[str] = None
    output_path: Optional[str] = None
    status: str
    rationale: Optional[str] = None
    visual_score: Optional[float] = 0.0
    audio_score: Optional[float] = 0.0
    hook_score: Optional[float] = 0.0
    retention_score: Optional[float] = 0.0
    visual_hook_rationale: Optional[str] = None
    storyboard_paths: Optional[str] = None
    audio_mode: Optional[str] = "original"
    hook_offset_sec: Optional[float] = 0.0
    ducking_volume: Optional[float] = 0.15
    framing_mode: Optional[str] = "presentation_fit"
    crop_coords: Optional[str] = None
    tags: Optional[str] = None
    created_at: str


class ClipUpdate(BaseModel):
    """Request to update a clip (approve/reject, edit hook, adjust bounds)."""
    status: Optional[str] = None
    hook_text: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    framing_mode: Optional[str] = None
    audio_mode: Optional[str] = None
    hook_offset_sec: Optional[float] = None
    ducking_volume: Optional[float] = None
    tags: Optional[str] = None


class ClipRerenderRequest(BaseModel):
    """Request to adjust cut length, framing mode, audio track mode, and timing."""
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    framing_mode: Optional[str] = "presentation_fit"  # "presentation_fit" | "split_screen" | "face_focus"
    audio_mode: Optional[str] = "original"            # "original" | "intro_hook" | "custom_voiceover" | "preroll" | "voiceover"
    hook_text: Optional[str] = None
    hook_offset_sec: Optional[float] = 0.0            # Offset in seconds from clip start to trigger hook voiceover
    ducking_volume: Optional[float] = 0.15            # Original sound volume attenuation level during voiceover (0.0 to 1.0)
    tags: Optional[str] = None
    voice_preset: Optional[str] = None                # If omitted, uses active sound profile from Settings
    use_cloned_voice: Optional[bool] = None           # If omitted, uses active sound profile from Settings
    reference_sample_name: Optional[str] = None


class ClipSynthesizeRequest(BaseModel):
    """Request to synthesize a new voiceover / cloned audio hook."""
    script_text: str
    voice_preset: Optional[str] = None               # If omitted, uses active sound profile from Settings
    use_cloned_voice: Optional[bool] = None          # If omitted, uses active sound profile from Settings
    reference_sample_name: Optional[str] = None


class TranscriptResponse(BaseModel):
    """Transcript data."""
    id: str
    job_id: str
    full_text: str
    segments: str   # JSON string
    words: str      # JSON string
    created_at: str

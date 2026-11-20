"""Pydantic models for scheduling and social accounts."""

from pydantic import BaseModel, Field
from typing import Optional


class ScheduleCreate(BaseModel):
    """Request to schedule a clip for upload."""
    clip_id: str
    platform: str = Field(..., pattern="^(youtube|instagram|twitter)$")
    scheduled_at: str  # ISO datetime string
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None


class PublishNowRequest(BaseModel):
    """Request to immediately upload a clip right now."""
    clip_id: str
    platform: str = Field(..., pattern="^(youtube|instagram|twitter)$")
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None


class ScheduleUpdate(BaseModel):
    """Request to update a scheduled post."""
    scheduled_at: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    status: Optional[str] = None


class ScheduleResponse(BaseModel):
    """Scheduled post data returned from API."""
    id: str
    clip_id: str
    platform: str
    scheduled_at: str
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    status: str
    attempts: int
    last_error: Optional[str] = None
    created_at: str
    updated_at: str


class SocialAccountResponse(BaseModel):
    """Social account connection data."""
    id: str
    platform: str
    profile_path: str
    display_name: Optional[str] = None
    connected_at: str
    last_used_at: Optional[str] = None
    is_authenticated: Optional[bool] = None

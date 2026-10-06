"""Alfred Backend — Uploaders registry and platform dispatch."""

from uploaders.base import BaseUploader
from uploaders.youtube import YouTubeUploader
from uploaders.instagram import InstagramUploader
from uploaders.twitter import TwitterUploader

_UPLOADERS: dict[str, BaseUploader] = {
    "youtube": YouTubeUploader(),
    "instagram": InstagramUploader(),
    "twitter": TwitterUploader(),
}


def get_uploader(platform: str) -> BaseUploader:
    """Retrieve uploader instance for requested platform."""
    platform_key = platform.lower().strip()
    if platform_key in _UPLOADERS:
        return _UPLOADERS[platform_key]
    raise ValueError(f"Unsupported platform: {platform}. Supported: {list(_UPLOADERS.keys())}")


__all__ = [
    "BaseUploader",
    "YouTubeUploader",
    "InstagramUploader",
    "TwitterUploader",
    "get_uploader",
]

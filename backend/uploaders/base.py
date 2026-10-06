"""Alfred Backend — Base uploader interface for social platforms."""

from abc import ABC, abstractmethod
from typing import Any


class BaseUploader(ABC):
    """Abstract base class for platform video uploaders."""

    def __init__(self, platform: str):
        self.platform = platform

    @abstractmethod
    async def upload(
        self,
        clip_path: str,
        title: str,
        description: str = "",
        tags: str | None = None,
    ) -> dict[str, Any]:
        """Upload video to platform.

        Args:
            clip_path: Absolute path to rendered MP4 video
            title: Title of the video / post
            description: Description or caption
            tags: Comma-separated tags or hashtags

        Returns:
            dict containing:
                "success": bool
                "url": Optional[str] (e.g. https://youtu.be/xyz)
                "error": Optional[str] (error message if failed)
        """
        pass

    @abstractmethod
    async def check_login(self) -> bool:
        """Check if persistent browser session has a valid login for this platform."""
        pass

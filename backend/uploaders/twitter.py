"""Alfred Backend — X (Twitter) video post uploader using Playwright with stealth."""

from pathlib import Path
from typing import Any

from uploaders.base import BaseUploader
from uploaders.stealth import get_stealth_context, human_click, human_type, random_delay


class TwitterUploader(BaseUploader):
    """Automates video posting to X (Twitter) via web interface."""

    def __init__(self):
        super().__init__("twitter")

    async def check_login(self) -> bool:
        """Check if saved session is logged into X."""
        try:
            async with get_stealth_context("twitter", headless=True) as (_, page):
                await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=30000)
                await random_delay(1.5, 3.0)
                if "login" in page.url or "i/flow/login" in page.url:
                    return False
                post_box = await page.query_selector("[data-testid='tweetTextarea_0'], [aria-label*='Post text']")
                return post_box is not None
        except Exception as e:
            print(f"[TwitterUploader] Login check failed: {e}")
            return False

    async def upload(
        self,
        clip_path: str,
        title: str,
        description: str = "",
        tags: str | None = None,
    ) -> dict[str, Any]:
        """Post video to X (Twitter)."""
        video_file = Path(clip_path)
        if not video_file.exists():
            return {"success": False, "error": f"Video file not found: {clip_path}"}

        text = title
        if tags:
            text += f" {tags}"
        text = text[:280]

        async with get_stealth_context("twitter", headless=True) as (_, page):
            try:
                await page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=45000)
                await random_delay(2.0, 4.0)

                if "login" in page.url:
                    return {
                        "success": False,
                        "error": "SESSION_EXPIRED: X account not authenticated. Please connect account in Settings.",
                    }

                # Upload media
                file_input = page.locator("input[data-testid='fileInput']").first
                await file_input.wait_for(state="attached", timeout=20000)
                await file_input.set_input_files(str(video_file))
                await random_delay(3.0, 6.0)

                # Type post text
                textbox = page.locator("[data-testid='tweetTextarea_0']").first
                if await textbox.count() > 0:
                    await human_type(page, "[data-testid='tweetTextarea_0']", text)

                # Click Post button
                post_button = page.locator("[data-testid='tweetButtonInline']").first
                if await post_button.count() > 0:
                    await human_click(page, "[data-testid='tweetButtonInline']")
                    await random_delay(4.0, 8.0)

                return {
                    "success": True,
                    "url": "https://x.com",
                    "title": title,
                }
            except Exception as e:
                return {"success": False, "error": f"X post failed: {str(e)}"}

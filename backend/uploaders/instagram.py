"""Alfred Backend — Instagram Reels uploader using Playwright with stealth."""

from pathlib import Path
from typing import Any

from uploaders.base import BaseUploader
from uploaders.stealth import get_stealth_context, human_click, human_type, random_delay


class InstagramUploader(BaseUploader):
    """Automates Reels upload to Instagram via web interface."""

    def __init__(self):
        super().__init__("instagram")

    async def check_login(self) -> bool:
        """Check if saved session is logged into Instagram."""
        try:
            async with get_stealth_context("instagram", headless=True) as (_, page):
                await page.goto("https://www.instagram.com", wait_until="domcontentloaded", timeout=30000)
                await random_delay(1.5, 3.0)
                if "accounts/login" in page.url:
                    return False
                feed = await page.query_selector("svg[aria-label='Home'], svg[aria-label='New post']")
                return feed is not None
        except Exception as e:
            print(f"[InstagramUploader] Login check failed: {e}")
            return False

    async def upload(
        self,
        clip_path: str,
        title: str,
        description: str = "",
        tags: str | None = None,
    ) -> dict[str, Any]:
        """Upload reel to Instagram."""
        video_file = Path(clip_path)
        if not video_file.exists():
            return {"success": False, "error": f"Video file not found: {clip_path}"}

        caption = f"{title}\n\n{description}"
        if tags:
            caption += f"\n\n{tags}"

        async with get_stealth_context("instagram", headless=True) as (_, page):
            try:
                await page.goto("https://www.instagram.com", wait_until="domcontentloaded", timeout=45000)
                await random_delay(2.0, 4.0)

                if "accounts/login" in page.url:
                    return {
                        "success": False,
                        "error": "SESSION_EXPIRED: Instagram not authenticated. Please connect account in Settings.",
                    }

                # Click Create / New post
                new_post_btn = page.locator("svg[aria-label='New post'], [aria-label='New post']").first
                if await new_post_btn.count() > 0:
                    await new_post_btn.click()
                    await random_delay(1.5, 2.5)

                # Set file
                file_input = page.locator("input[type='file']").first
                await file_input.wait_for(state="attached", timeout=20000)
                await file_input.set_input_files(str(video_file))
                await random_delay(3.0, 5.0)

                # Step through Next buttons
                for _ in range(2):
                    next_btn = page.locator("div[role='button']:has-text('Next')").first
                    if await next_btn.count() > 0:
                        await human_click(page, "div[role='button']:has-text('Next')")
                        await random_delay(1.5, 3.0)

                # Add caption
                caption_area = page.locator("div[aria-label*='Write a caption']").first
                if await caption_area.count() > 0:
                    await human_type(page, "div[aria-label*='Write a caption']", caption)

                # Share
                share_btn = page.locator("div[role='button']:has-text('Share')").first
                if await share_btn.count() > 0:
                    await human_click(page, "div[role='button']:has-text('Share')")
                    await random_delay(4.0, 8.0)

                return {
                    "success": True,
                    "url": "https://www.instagram.com",
                    "title": title,
                }
            except Exception as e:
                return {"success": False, "error": f"Instagram upload failed: {str(e)}"}

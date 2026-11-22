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
                feed = await page.query_selector(
                    "svg[aria-label='Home'], svg[aria-label='New post'], svg[aria-label='Create'], a[href*='/direct/'], span:has-text('Create')"
                )
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
                new_post_selector = "svg[aria-label='New post'], [aria-label='New post'], svg[aria-label='Create'], span:has-text('Create')"
                new_post_btn = page.locator(new_post_selector).first
                if await new_post_btn.count() > 0:
                    await human_click(page, new_post_selector)
                    await random_delay(1.5, 2.5)

                # Set file
                file_input = page.locator("input[type='file']").first
                await file_input.wait_for(state="attached", timeout=20000)
                await file_input.set_input_files(str(video_file))
                await random_delay(3.0, 5.0)

                # Dismiss any initial modal notice (e.g. "Video posts are now shared as reels")
                for _ in range(3):
                    try:
                        ok_btn = page.locator("button:has-text('OK'), div[role='button']:has-text('OK'), button:has-text('Got it')").first
                        if await ok_btn.count() > 0 and await ok_btn.is_visible():
                            await ok_btn.click(force=True)
                            await random_delay(1.0, 2.0)
                    except Exception:
                        pass

                # Step through Next buttons (1: Crop/Ratio, 2: Filter/Edit)
                for step in range(2):
                    # Check for overlay notices before proceeding
                    try:
                        ok_btn = page.locator("button:has-text('OK'), div[role='button']:has-text('OK'), button:has-text('Got it')").first
                        if await ok_btn.count() > 0 and await ok_btn.is_visible():
                            await ok_btn.click(force=True)
                            await random_delay(1.0, 2.0)
                    except Exception:
                        pass

                    next_selector = "div[role='button']:has-text('Next'), button:has-text('Next')"
                    next_btn = page.locator(next_selector).first
                    await next_btn.wait_for(state="visible", timeout=20000)
                    if await next_btn.count() > 0:
                        await human_click(page, next_selector)
                        await random_delay(2.0, 3.5)

                # Add caption
                caption_selector = "div[aria-label*='Write a caption'], div[role='textbox']"
                caption_area = page.locator(caption_selector).first
                if await caption_area.count() > 0:
                    await human_type(page, caption_selector, caption)
                    await random_delay(1.0, 2.0)

                # Share
                share_selector = "div[role='button']:has-text('Share'), button:has-text('Share')"
                share_btn = page.locator(share_selector).first
                await share_btn.wait_for(state="visible", timeout=20000)
                if await share_btn.count() > 0:
                    await human_click(page, share_selector)

                    # Wait for share confirmation or modal close
                    try:
                        await page.wait_for_selector(
                            "text='Your reel has been shared', text='Your post has been shared', text='Reel shared', text='Post shared'",
                            timeout=45000,
                        )
                    except Exception:
                        await random_delay(5.0, 8.0)

                return {
                    "success": True,
                    "url": "https://www.instagram.com",
                    "title": title,
                }
            except Exception as e:
                return {"success": False, "error": f"Instagram upload failed: {str(e)}"}

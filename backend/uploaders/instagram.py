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

                dialog = page.get_by_role("dialog")
                await dialog.wait_for(state="visible", timeout=25000)

                # Dismiss any initial modal notice (e.g. "Video posts are now shared as reels")
                for _ in range(3):
                    try:
                        ok_btn = dialog.locator("button:has-text('OK'), div[role='button']:has-text('OK'), button:has-text('Got it')").first
                        if await ok_btn.count() > 0 and await ok_btn.is_visible():
                            await ok_btn.click(force=True)
                            await random_delay(1.0, 2.0)
                    except Exception:
                        pass

                # Step through Next buttons (1: Crop/Ratio, 2: Filter/Edit)
                for step in range(2):
                    # Check for overlay notices before proceeding
                    try:
                        ok_btn = dialog.locator("button:has-text('OK'), div[role='button']:has-text('OK'), button:has-text('Got it')").first
                        if await ok_btn.count() > 0 and await ok_btn.is_visible():
                            await ok_btn.click(force=True)
                            await random_delay(1.0, 2.0)
                    except Exception:
                        pass

                    next_btn = dialog.get_by_role("button", name="Next", exact=True)
                    await next_btn.wait_for(state="visible", timeout=20000)
                    await next_btn.click(force=True)
                    await random_delay(2.0, 3.5)

                # Add caption
                caption_area = dialog.locator("div[aria-label*='Write a caption'], div[role='textbox']").first
                if await caption_area.count() > 0:
                    try:
                        await caption_area.fill(caption)
                    except Exception:
                        await human_type(page, "div[aria-label*='Write a caption'], div[role='textbox']", caption)
                    await random_delay(1.0, 2.0)

                # Click the real Share button inside dialog
                share_btn = dialog.get_by_role("button", name="Share", exact=True)
                await share_btn.wait_for(state="visible", timeout=20000)
                await share_btn.click(force=True)
                print("[InstagramUploader] Clicked Share button inside dialog, awaiting upload confirmation...")

                # Wait for Instagram to finish uploading and show confirmation
                shared_confirmed = False
                for _ in range(18):  # Poll up to 90 seconds (18 * 5s)
                    await asyncio.sleep(5.0)
                    try:
                        body_text = await page.evaluate("() => document.body.innerText")
                        if any(phrase in body_text for phrase in [
                            "Your reel has been shared",
                            "Your post has been shared",
                            "Reel shared",
                            "Post shared",
                            "Shared reel"
                        ]):
                            shared_confirmed = True
                            print("[InstagramUploader] Confirmed reel shared on Instagram!")
                            break
                        if await dialog.count() == 0:
                            shared_confirmed = True
                            print("[InstagramUploader] Dialog closed, upload complete.")
                            break
                    except Exception:
                        pass

                if not shared_confirmed:
                    raise RuntimeError("Instagram upload timed out waiting for 'Your reel has been shared' confirmation.")

                return {
                    "success": True,
                    "url": "https://www.instagram.com",
                    "title": title,
                }
            except Exception as e:
                return {"success": False, "error": f"Instagram upload failed: {str(e)}"}

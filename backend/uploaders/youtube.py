"""Alfred Backend — YouTube Shorts and video uploader using Playwright with stealth."""

import asyncio
from pathlib import Path
from typing import Any

from uploaders.base import BaseUploader
from uploaders.stealth import (
    get_stealth_context,
    human_click,
    human_type,
    random_delay,
)


class YouTubeUploader(BaseUploader):
    """Automates video / Shorts upload to YouTube Studio using persistent browser profile."""

    def __init__(self):
        super().__init__("youtube")

    async def check_login(self) -> bool:
        """Check if saved session is currently logged into YouTube Studio."""
        try:
            async with get_stealth_context("youtube", headless=True) as (_, page):
                await page.goto("https://studio.youtube.com", wait_until="networkidle", timeout=30000)
                await random_delay(1.5, 3.0)

                # If redirected to Google login, not authenticated
                if "accounts.google.com" in page.url or "signin" in page.url:
                    return False

                # Check for channel avatar or studio dashboard
                channel_indicator = await page.query_selector(
                    "ytcp-app, #avatar-btn, [aria-label*='Channel'], #channel-title"
                )
                return channel_indicator is not None
        except Exception as e:
            print(f"[YouTubeUploader] Login check failed: {e}")
            return False

    async def upload(
        self,
        clip_path: str,
        title: str,
        description: str = "",
        tags: str | None = None,
    ) -> dict[str, Any]:
        """Upload video to YouTube Studio."""
        video_file = Path(clip_path)
        if not video_file.exists():
            return {"success": False, "error": f"Video file not found at: {clip_path}"}

        # Truncate title to YouTube 100 char limit; append #Shorts if not present
        clean_title = title.strip()
        if "#Shorts" not in clean_title and "#shorts" not in clean_title:
            if len(clean_title) <= 90:
                clean_title = f"{clean_title} #Shorts"
            else:
                clean_title = f"{clean_title[:89]}… #Shorts"
        else:
            clean_title = clean_title[:100]

        async with get_stealth_context("youtube", headless=True) as (_, page):
            try:
                print("[YouTubeUploader] Navigating to YouTube Studio...")
                await page.goto("https://studio.youtube.com", wait_until="domcontentloaded", timeout=45000)
                await random_delay(2.0, 4.0)

                # Check authentication
                if "accounts.google.com" in page.url or "signin" in page.url:
                    return {
                        "success": False,
                        "error": "SESSION_EXPIRED: Please connect your YouTube account in Settings first.",
                    }

                # 1. Open upload dialog
                print("[YouTubeUploader] Triggering upload dialog...")
                create_button = page.locator("#create-icon, button[aria-label='Create'], ytcp-button#create-icon").first
                if await create_button.count() > 0:
                    await create_button.click()
                    await random_delay(1.0, 2.0)
                    upload_option = page.locator("tp-yt-paper-item:has-text('Upload videos'), #text-item-0").first
                    if await upload_option.count() > 0:
                        await upload_option.click()
                else:
                    # Fallback to direct upload URL
                    await page.goto("https://studio.youtube.com/channel/upload", wait_until="networkidle")

                # 2. Upload video file via file chooser or input
                print(f"[YouTubeUploader] Selecting video file: {video_file.name}")
                file_input = page.locator("input[type='file']").first
                await file_input.wait_for(state="attached", timeout=30000)
                await file_input.set_input_files(str(video_file))

                # 3. Wait for details dialog to appear
                print("[YouTubeUploader] Waiting for upload metadata dialog...")
                await page.wait_for_selector(
                    "ytcp-uploads-dialog, #textbox[aria-label*='Add a title']",
                    timeout=60000,
                )
                await random_delay(2.0, 4.0)

                # 4. Fill Title
                print(f"[YouTubeUploader] Setting title: {clean_title}")
                title_box = page.locator("#textbox[aria-label*='Add a title'], #title-textarea #textbox").first
                if await title_box.count() > 0:
                    await title_box.click()
                    await page.keyboard.press("Control+A")
                    await page.keyboard.press("Backspace")
                    await human_type(page, "#textbox[aria-label*='Add a title'], #title-textarea #textbox", clean_title)

                # 5. Fill Description
                if description:
                    print("[YouTubeUploader] Setting description...")
                    desc_box = page.locator("#textbox[aria-label*='Tell viewers'], #description-textarea #textbox").first
                    if await desc_box.count() > 0:
                        await human_type(
                            page,
                            "#textbox[aria-label*='Tell viewers'], #description-textarea #textbox",
                            description,
                        )

                # 6. Audience selection: "Not made for kids" (required)
                print("[YouTubeUploader] Setting audience (Not made for kids)...")
                not_for_kids_radio = page.locator(
                    "tp-yt-paper-radio-button[name='VIDEO_MADE_FOR_KIDS_NOT_MFK'], "
                    "[name='VIDEO_MADE_FOR_KIDS_NOT_MFK']"
                ).first
                if await not_for_kids_radio.count() > 0:
                    await not_for_kids_radio.click()
                    await random_delay(0.5, 1.5)

                # 7. Advance wizard (Details -> Video elements -> Checks -> Visibility)
                next_btn = page.locator("#next-button").first
                for step in range(3):
                    if await next_btn.count() > 0 and await next_btn.is_enabled():
                        await human_click(page, "#next-button")
                        await random_delay(1.5, 2.5)

                # 8. Visibility step: Select "Public"
                print("[YouTubeUploader] Setting visibility to Public...")
                public_radio = page.locator(
                    "tp-yt-paper-radio-button[name='PUBLIC'], [name='PUBLIC']"
                ).first
                if await public_radio.count() > 0:
                    await public_radio.click()
                    await random_delay(1.0, 2.0)

                # 9. Extract video link if visible before/after publishing
                video_url = None
                link_elem = page.locator("a.ytcp-video-info, a.ytcp-uploads-review").first
                if await link_elem.count() > 0:
                    video_url = await link_elem.get_attribute("href")

                # 10. Click Publish / Done
                print("[YouTubeUploader] Clicking Publish...")
                done_btn = page.locator("#done-button, #publish-button").first
                if await done_btn.count() > 0:
                    await human_click(page, "#done-button, #publish-button")
                    await random_delay(3.0, 5.0)

                # Try to capture confirmation link if not already found
                if not video_url:
                    conf_link = page.locator("a[href*='youtu.be']").first
                    if await conf_link.count() > 0:
                        video_url = await conf_link.get_attribute("href")

                return {
                    "success": True,
                    "url": video_url or "https://youtube.com",
                    "title": clean_title,
                }

            except Exception as e:
                err_msg = f"YouTube upload failed: {type(e).__name__}: {str(e)}"
                print(f"[YouTubeUploader] Error: {err_msg}")
                return {"success": False, "error": err_msg}

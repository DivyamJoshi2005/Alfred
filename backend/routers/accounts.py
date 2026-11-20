"""Alfred Backend — Social Accounts API router with interactive browser login."""

import asyncio
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from models import SocialAccountResponse
from database import get_db
from config import CHROMIUM_PROFILES_DIR
from uploaders.stealth import get_stealth_context, random_delay
from uploaders import get_uploader

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

LOGIN_URLS = {
    "youtube": "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fstudio.youtube.com",
    "instagram": "https://www.instagram.com/accounts/login/",
    "twitter": "https://x.com/i/flow/login",
}


@router.get("", response_model=list[SocialAccountResponse])
async def list_accounts():
    """List all connected social accounts."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM social_accounts ORDER BY connected_at DESC")
        rows = await cursor.fetchall()
        return [
            SocialAccountResponse(
                id=row["id"],
                platform=row["platform"],
                profile_path=row["profile_path"],
                display_name=row["display_name"],
                connected_at=row["connected_at"],
                last_used_at=row["last_used_at"],
            )
            for row in rows
        ]
    finally:
        await db.close()


@router.get("/{platform}/status")
async def check_account_status(platform: str):
    """Check active login status for platform session."""
    valid_platforms = {"youtube", "instagram", "twitter"}
    if platform not in valid_platforms:
        raise HTTPException(status_code=400, detail="Invalid platform")

    try:
        uploader = get_uploader(platform)
        is_logged_in = await uploader.check_login()
        return {"platform": platform, "authenticated": is_logged_in}
    except Exception as e:
        return {"platform": platform, "authenticated": False, "error": str(e)}


@router.post("/{platform}/connect", response_model=SocialAccountResponse)
async def connect_account(platform: str, interactive: bool = True):
    """Launch visible browser window for manual login, and save profile session."""
    valid_platforms = {"youtube", "instagram", "twitter"}
    if platform not in valid_platforms:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid platform. Must be one of: {', '.join(valid_platforms)}",
        )

    profile_path = str(CHROMIUM_PROFILES_DIR / platform)
    Path(profile_path).mkdir(parents=True, exist_ok=True)

    account_id = str(uuid.uuid4())

    if interactive:
        # Launch visible browser window for manual login
        login_url = LOGIN_URLS.get(platform, "https://google.com")
        print(f"[Accounts] Launching interactive browser for {platform} at {login_url}")

        try:
            async with get_stealth_context(platform, headless=False) as (context, page):
                try:
                    await page.goto(login_url, wait_until="domcontentloaded", timeout=45000)
                except Exception as nav_err:
                    print(f"[Accounts] Initial navigation warning: {nav_err}")

                # Wait for user to complete login (poll for max 5 minutes or window close)
                for _ in range(100):
                    await asyncio.sleep(3)
                    active_pages = [p for p in context.pages if not p.is_closed()]
                    if not active_pages:
                        break

                    login_detected = False
                    for p in active_pages:
                        current_url = p.url
                        if platform == "youtube" and "studio.youtube.com" in current_url and "signin" not in current_url:
                            print("[Accounts] YouTube login detected successfully!")
                            login_detected = True
                            break
                        elif platform == "instagram" and "accounts/login" not in current_url and "instagram.com" in current_url and len(current_url) > 28:
                            print("[Accounts] Instagram login detected!")
                            login_detected = True
                            break
                        elif platform == "twitter" and ("home" in current_url or ("x.com" in current_url and "login" not in current_url and "flow" not in current_url)):
                            print("[Accounts] Twitter login detected!")
                            login_detected = True
                            break

                    if login_detected:
                        # Give session extra time to persist cookies
                        await asyncio.sleep(3.0)
                        break
        except Exception as e:
            print(f"[Accounts] Interactive browser closed or timed out: {e}")

    # Verify actual login status with uploader
    uploader = get_uploader(platform)
    is_authenticated = await uploader.check_login()

    if not is_authenticated:
        # Clean up any stale unauthenticated DB row for platform
        db = await get_db()
        try:
            await db.execute("DELETE FROM social_accounts WHERE platform = ?", (platform,))
            await db.commit()
        finally:
            await db.close()

        raise HTTPException(
            status_code=401,
            detail=(
                f"Authentication was not completed for {platform.title()}. "
                f"Please log in completely in the browser window and reach your account dashboard before closing it."
            ),
        )

    db = await get_db()
    try:
        # Upsert record
        await db.execute("DELETE FROM social_accounts WHERE platform = ?", (platform,))
        await db.execute(
            """INSERT INTO social_accounts (id, platform, profile_path, display_name, connected_at)
               VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (account_id, platform, profile_path, f"{platform.title()} Account"),
        )
        await db.commit()

        cursor = await db.execute("SELECT * FROM social_accounts WHERE id = ?", (account_id,))
        row = await cursor.fetchone()
        return SocialAccountResponse(
            id=row["id"],
            platform=row["platform"],
            profile_path=row["profile_path"],
            display_name=row["display_name"],
            connected_at=row["connected_at"],
            last_used_at=row["last_used_at"],
            is_authenticated=True,
        )
    finally:
        await db.close()


@router.delete("/{platform}")
async def disconnect_account(platform: str, clear_cookies: bool = False):
    """Disconnect a social account and optionally wipe browser cookies."""
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id FROM social_accounts WHERE platform = ?", (platform,)
        )
        if not await cursor.fetchone():
            raise HTTPException(status_code=404, detail="Account not connected")

        await db.execute("DELETE FROM social_accounts WHERE platform = ?", (platform,))
        await db.commit()

        if clear_cookies:
            import shutil
            profile_dir = CHROMIUM_PROFILES_DIR / platform
            if profile_dir.exists():
                shutil.rmtree(profile_dir, ignore_errors=True)

        return {"success": True}
    finally:
        await db.close()

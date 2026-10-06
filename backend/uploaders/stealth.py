"""Alfred Backend — Anti-detection and stealth automation utilities for Playwright.

Implements human-like interactions, randomized delays, and browser fingerprint
hardening to minimize bot-detection risk during social media uploads.
"""

import asyncio
import random
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from playwright.async_api import BrowserContext, Page, async_playwright

from config import CHROMIUM_PROFILES_DIR

# Realistic Chrome user agent
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)

# Common Chromium launch arguments for anti-detection
STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-infobars",
    "--no-default-browser-check",
    "--no-first-run",
    "--password-store=basic",
]

# Client-side JavaScript to mask automation footprints
STEALTH_INIT_SCRIPT = """
(() => {
    // 1. Hide navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
    });

    // 2. Mock chrome object
    window.chrome = {
        app: { isInstalled: false },
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
    };

    // 3. Mock languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
    });

    // 4. Mock plugins length
    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
    });

    // 5. Mock permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );
})();
"""


async def random_delay(min_sec: float = 1.0, max_sec: float = 3.0):
    """Wait for a randomized duration mimicking human pauses."""
    jitter = random.uniform(min_sec, max_sec)
    await asyncio.sleep(jitter)


async def human_type(page: Page, selector: str, text: str, min_delay_ms: int = 40, max_delay_ms: int = 120):
    """Type text character-by-character with variable cadence."""
    element = page.locator(selector).first
    await element.click()
    await random_delay(0.2, 0.5)

    for char in text:
        await element.type(char, delay=random.randint(min_delay_ms, max_delay_ms))
        # Occasional micro-pause between words
        if char == " " and random.random() < 0.3:
            await random_delay(0.15, 0.35)


async def human_click(page: Page, selector: str):
    """Simulate hovering and clicking an element with human-like delay."""
    element = page.locator(selector).first
    await element.hover()
    await random_delay(0.1, 0.3)
    await element.click()
    await random_delay(0.4, 0.9)


@asynccontextmanager
async def get_stealth_context(
    platform: str,
    headless: bool = True,
) -> AsyncGenerator[tuple[BrowserContext, Page], None]:
    """Launch or connect to a persistent browser context with stealth properties.

    Args:
        platform: Platform name ("youtube", "instagram", "twitter")
        headless: False for visible login, True for background upload
    """
    profile_dir = CHROMIUM_PROFILES_DIR / platform
    profile_dir.mkdir(parents=True, exist_ok=True)

    viewport_width = random.choice([1280, 1366, 1440, 1920])
    viewport_height = random.choice([720, 800, 900, 1080])

    async with async_playwright() as p:
        launch_kwargs = {
            "user_data_dir": str(profile_dir),
            "headless": headless,
            "args": STEALTH_ARGS,
            "user_agent": DEFAULT_USER_AGENT,
            "viewport": {"width": viewport_width, "height": viewport_height},
            "locale": "en-US",
            "timezone_id": "America/New_York",
            "ignore_https_errors": True,
        }

        try:
            context = await p.chromium.launch_persistent_context(
                channel="chrome",
                **launch_kwargs,
            )
        except Exception:
            # Fall back to standard chromium or playwright default
            context = await p.chromium.launch_persistent_context(
                **launch_kwargs,
            )

        # Inject stealth evasions into all pages
        await context.add_init_script(STEALTH_INIT_SCRIPT)

        page = context.pages[0] if context.pages else await context.new_page()

        try:
            yield context, page
        finally:
            await context.close()

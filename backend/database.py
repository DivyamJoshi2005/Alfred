"""Alfred Backend — SQLite database schema and connection management."""

import aiosqlite
from pathlib import Path
from config import DB_PATH

SCHEMA_SQL = """
-- Core job tracking
CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    video_path  TEXT NOT NULL,
    video_name  TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    error_msg   TEXT
);

-- Whisper transcription output
CREATE TABLE IF NOT EXISTS transcripts (
    id          TEXT PRIMARY KEY,
    job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    full_text   TEXT NOT NULL,
    segments    TEXT NOT NULL,
    words       TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- AI-identified clip segments
CREATE TABLE IF NOT EXISTS clips (
    id              TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    rank            INTEGER NOT NULL,
    start_time      REAL NOT NULL,
    end_time        REAL NOT NULL,
    duration        REAL NOT NULL,
    transcript_text TEXT NOT NULL,
    hook_text       TEXT,
    hook_audio_path TEXT,
    output_path     TEXT,
    status          TEXT DEFAULT 'pending',
    rationale       TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled social media posts
CREATE TABLE IF NOT EXISTS scheduled_posts (
    id              TEXT PRIMARY KEY,
    clip_id         TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
    platform        TEXT NOT NULL,
    scheduled_at    DATETIME NOT NULL,
    title           TEXT,
    description     TEXT,
    tags            TEXT,
    status          TEXT DEFAULT 'scheduled',
    attempts        INTEGER DEFAULT 0,
    last_error      TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Social account browser profiles
CREATE TABLE IF NOT EXISTS social_accounts (
    id              TEXT PRIMARY KEY,
    platform        TEXT NOT NULL UNIQUE,
    profile_path    TEXT NOT NULL,
    display_name    TEXT,
    connected_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at    DATETIME
);

-- Application settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_clips_job_id ON clips(job_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_status ON scheduled_posts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_scheduled_at ON scheduled_posts(scheduled_at);
"""


async def get_db() -> aiosqlite.Connection:
    """Create and return an async SQLite connection with WAL mode."""
    db = await aiosqlite.connect(str(DB_PATH))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    """Initialize the database schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = await get_db()
    try:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
    finally:
        await db.close()

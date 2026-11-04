from __future__ import annotations
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from .config import settings

# --- SQLite helpers (dev mode) ---

def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

DB_PATH = settings.db_path

def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT NOT NULL,
    visual_description TEXT DEFAULT '',
    invariant_traits TEXT DEFAULT '[]',
    notes TEXT DEFAULT '',
    archived INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_images (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    source_note TEXT NOT NULL,
    rights_confirmed INTEGER NOT NULL DEFAULT 0,
    origin_artifact_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    negative_prompt TEXT DEFAULT '',
    seed INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    priority TEXT NOT NULL DEFAULT 'balanced',
    destination_requested TEXT NOT NULL DEFAULT 'auto',
    destination_used TEXT,
    engine TEXT NOT NULL DEFAULT 'mock',
    model TEXT NOT NULL DEFAULT 'simulado-v1',
    workflow_version TEXT NOT NULL DEFAULT '1',
    status TEXT NOT NULL DEFAULT 'pending',
    error_code TEXT,
    error_message TEXT,
    attempts INTEGER NOT NULL DEFAULT 1,
    retry_of TEXT,
    provider_job_id TEXT,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS generation_artifacts (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    thumbnail_path TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    selected INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
"""

async def init_db() -> None:
    if settings.use_supabase:
        # Supabase: tablas se crean via SQL editor o migraciones; aquí solo verificamos conexión
        try:
            from supabase import create_client
            client = create_client(settings.supabase_url, settings.supabase_service_role_key)
            # Test connection
            client.table("characters").select("id").limit(1).execute()
        except Exception as e:
            import logging
            logging.warning("Supabase connection test failed: %s", e)
        return
    # SQLite: crear tablas
    conn = get_db()
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def new_id() -> str:
    return str(uuid.uuid4())


def row_to_dict(row: Any) -> dict[str, Any]:
    if row is None:
        return None
    if isinstance(row, sqlite3.Row):
        return dict(row)
    return dict(row)

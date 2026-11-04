from __future__ import annotations
import json
import sqlite3
from pathlib import Path
from typing import Any
from ..core.database import get_db, new_id, _now
from ..core.config import settings
from ..core.auth import sign_file_url


class ReferenceRepository:
    def __init__(self, user_id: str | None = None):
        self.user_id = user_id

    def list_by_character(self, character_id: str, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        conn = get_db()
        try:
            total = conn.execute("SELECT COUNT(*) FROM reference_images WHERE character_id = ?", (character_id,)).fetchone()[0]
            rows = conn.execute(
                "SELECT * FROM reference_images WHERE character_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (character_id, limit, offset),
            ).fetchall()
            items = []
            for r in rows:
                d = dict(r)
                d["url"] = sign_file_url(f"/api/files/references/{d['id']}.png" if False else f"/api/files/references/{Path(d['storage_path']).name}")
                # Actually, use the stored filename
                d["url"] = sign_file_url(f"/api/files/references/{d['storage_path'].split('/')[-1].split(chr(92))[-1]}")
                d["thumbnail_url"] = sign_file_url(f"/api/files/thumbnails/{d['thumbnail_path'].split('/')[-1].split(chr(92))[-1]}")
                d["rights_confirmed"] = bool(d["rights_confirmed"])
                items.append(d)
            return items, total
        finally:
            conn.close()

    def get(self, ref_id: str) -> dict[str, Any] | None:
        conn = get_db()
        try:
            row = conn.execute("SELECT * FROM reference_images WHERE id = ?", (ref_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            d["url"] = sign_file_url(f"/api/files/references/{d['storage_path'].split('/')[-1].split(chr(92))[-1]}")
            d["thumbnail_url"] = sign_file_url(f"/api/files/thumbnails/{d['thumbnail_path'].split('/')[-1].split(chr(92))[-1]}")
            d["rights_confirmed"] = bool(d["rights_confirmed"])
            return d
        finally:
            conn.close()

    def create(self, character_id: str, storage_path: str, thumbnail_path: str, width: int, height: int, source_note: str, rights_confirmed: bool, origin_artifact_id: str | None = None) -> dict[str, Any]:
        conn = get_db()
        try:
            rid = new_id()
            now = _now()
            conn.execute(
                """INSERT INTO reference_images (id, character_id, storage_path, thumbnail_path, width, height, source_note, rights_confirmed, origin_artifact_id, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (rid, character_id, storage_path, thumbnail_path, width, height, source_note, 1 if rights_confirmed else 0, origin_artifact_id, now),
            )
            conn.commit()
            return self.get(rid)
        finally:
            conn.close()

    def delete(self, ref_id: str) -> tuple[bool, str | None, str | None]:
        conn = get_db()
        try:
            row = conn.execute("SELECT storage_path, thumbnail_path FROM reference_images WHERE id = ?", (ref_id,)).fetchone()
            if not row:
                return False, None, None
            storage_path, thumbnail_path = row["storage_path"], row["thumbnail_path"]
            conn.execute("DELETE FROM reference_images WHERE id = ?", (ref_id,))
            conn.commit()
            return True, storage_path, thumbnail_path
        finally:
            conn.close()

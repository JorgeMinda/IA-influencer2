from __future__ import annotations
import json
import sqlite3
from typing import Any
from ..core.database import get_db, new_id, _now
from ..core.config import settings
from ..models.schemas import CharacterCreate, CharacterPatch


def _row_to_char(row) -> dict[str, Any]:
    d = dict(row)
    d["invariant_traits"] = json.loads(d.get("invariant_traits", "[]"))
    d["archived"] = bool(d.get("archived", 0))
    # reference_count: computed separately
    return d


class CharacterRepository:
    def __init__(self, user_id: str | None = None):
        self.user_id = user_id

    def _filter_user(self, query: str, params: list) -> tuple[str, list]:
        if self.user_id and settings.use_supabase:
            query += " AND user_id = ?"
            params.append(self.user_id)
        return query, params

    def list(self, q: str | None = None, include_archived: bool = False, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        conn = get_db()
        try:
            conditions = []
            params: list[Any] = []
            if not include_archived:
                conditions.append("archived = 0")
            if q:
                conditions.append("name LIKE ?")
                params.append(f"%{q}%")
            if self.user_id and settings.use_supabase:
                conditions.append("user_id = ?")
                params.append(self.user_id)
            where = " AND ".join(conditions) if conditions else "1=1"
            # total
            total = conn.execute(f"SELECT COUNT(*) FROM characters WHERE {where}", params).fetchone()[0]
            # items
            rows = conn.execute(
                f"SELECT * FROM characters WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
            items = []
            for r in rows:
                d = _row_to_char(r)
                # reference_count
                rc = conn.execute("SELECT COUNT(*) FROM reference_images WHERE character_id = ?", (d["id"],)).fetchone()[0]
                d["reference_count"] = rc
                items.append(d)
            return items, total
        finally:
            conn.close()

    def get(self, char_id: str) -> dict[str, Any] | None:
        conn = get_db()
        try:
            row = conn.execute("SELECT * FROM characters WHERE id = ?", (char_id,)).fetchone()
            if not row:
                return None
            d = _row_to_char(row)
            rc = conn.execute("SELECT COUNT(*) FROM reference_images WHERE character_id = ?", (char_id,)).fetchone()[0]
            d["reference_count"] = rc
            return d
        finally:
            conn.close()

    def create(self, data: CharacterCreate) -> dict[str, Any]:
        conn = get_db()
        try:
            cid = new_id()
            now = _now()
            conn.execute(
                """INSERT INTO characters (id, user_id, name, visual_description, invariant_traits, notes, archived, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (cid, self.user_id, data.name, data.visual_description, json.dumps(data.invariant_traits), data.notes, 0, now, now),
            )
            conn.commit()
            return self.get(cid)
        finally:
            conn.close()

    def update(self, char_id: str, data: CharacterPatch) -> dict[str, Any] | None:
        conn = get_db()
        try:
            existing = self.get(char_id)
            if not existing:
                return None
            fields = []
            params = []
            if data.name is not None:
                fields.append("name = ?")
                params.append(data.name)
            if data.visual_description is not None:
                fields.append("visual_description = ?")
                params.append(data.visual_description)
            if data.invariant_traits is not None:
                fields.append("invariant_traits = ?")
                params.append(json.dumps(data.invariant_traits))
            if data.notes is not None:
                fields.append("notes = ?")
                params.append(data.notes)
            if data.archived is not None:
                fields.append("archived = ?")
                params.append(1 if data.archived else 0)
            if fields:
                fields.append("updated_at = ?")
                params.append(_now())
                params.append(char_id)
                conn.execute(f"UPDATE characters SET {', '.join(fields)} WHERE id = ?", params)
                conn.commit()
            return self.get(char_id)
        finally:
            conn.close()

    def delete(self, char_id: str) -> bool:
        conn = get_db()
        try:
            # Delete references, artifacts, jobs, then character
            conn.execute("DELETE FROM generation_artifacts WHERE character_id = ?", (char_id,))
            conn.execute("DELETE FROM generation_jobs WHERE character_id = ?", (char_id,))
            conn.execute("DELETE FROM reference_images WHERE character_id = ?", (char_id,))
            cur = conn.execute("DELETE FROM characters WHERE id = ?", (char_id,))
            conn.commit()
            return cur.rowcount > 0
        finally:
            conn.close()

    def duplicate(self, char_id: str) -> dict[str, Any] | None:
        existing = self.get(char_id)
        if not existing:
            return None
        conn = get_db()
        try:
            cid = new_id()
            now = _now()
            conn.execute(
                """INSERT INTO characters (id, user_id, name, visual_description, invariant_traits, notes, archived, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (cid, self.user_id, f"{existing['name']} (copia)", existing["visual_description"],
                 json.dumps(existing["invariant_traits"]), existing["notes"], 0, now, now),
            )
            conn.commit()
            return self.get(cid)
        finally:
            conn.close()

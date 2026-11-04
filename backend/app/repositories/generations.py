from __future__ import annotations
import json
import sqlite3
from pathlib import Path
from typing import Any
from ..core.database import get_db, new_id, _now
from ..core.config import settings
from ..core.auth import sign_file_url


class GenerationRepository:
    def __init__(self, user_id: str | None = None):
        self.user_id = user_id

    def create_job(self, character_id: str, prompt: str, negative_prompt: str, seed: int,
                   width: int, height: int, priority: str, destination_requested: str,
                   destination_used: str, engine: str, model: str, workflow_version: str = "1",
                   retry_of: str | None = None) -> dict[str, Any]:
        conn = get_db()
        try:
            jid = new_id()
            now = _now()
            conn.execute(
                """INSERT INTO generation_jobs
                   (id, user_id, character_id, prompt, negative_prompt, seed, width, height, priority,
                    destination_requested, destination_used, engine, model, workflow_version, status,
                    attempts, retry_of, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (jid, self.user_id, character_id, prompt, negative_prompt, seed, width, height,
                 priority, destination_requested, destination_used, engine, model, workflow_version,
                 "pending", 1, retry_of, now),
            )
            conn.commit()
            return self.get_job(jid)
        finally:
            conn.close()

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        conn = get_db()
        try:
            row = conn.execute("SELECT * FROM generation_jobs WHERE id = ?", (job_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            # Load artifacts
            art_rows = conn.execute(
                "SELECT * FROM generation_artifacts WHERE job_id = ? ORDER BY created_at", (job_id,)
            ).fetchall()
            d["artifacts"] = [self._artifact_dict(r) for r in art_rows]
            return d
        finally:
            conn.close()

    def _artifact_dict(self, row) -> dict[str, Any]:
        d = dict(row)
        d["image_url"] = sign_file_url(f"/api/files/outputs/{Path(d['image_path']).name}")
        d["thumbnail_url"] = sign_file_url(f"/api/files/thumbnails/{Path(d['thumbnail_path']).name}")
        d["selected"] = bool(d["selected"])
        d["metadata"] = json.loads(d.get("metadata_json", "{}"))
        return d

    def list_jobs(self, character_id: str | None = None, status: str | None = None,
                  limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        conn = get_db()
        try:
            conditions = []
            params: list[Any] = []
            if character_id:
                conditions.append("character_id = ?")
                params.append(character_id)
            if status:
                conditions.append("status = ?")
                params.append(status)
            if self.user_id and settings.use_supabase:
                conditions.append("user_id = ?")
                params.append(self.user_id)
            where = " AND ".join(conditions) if conditions else "1=1"
            total = conn.execute(f"SELECT COUNT(*) FROM generation_jobs WHERE {where}", params).fetchone()[0]
            rows = conn.execute(
                f"SELECT * FROM generation_jobs WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
            items = []
            for r in rows:
                d = dict(r)
                art_rows = conn.execute(
                    "SELECT * FROM generation_artifacts WHERE job_id = ? ORDER BY created_at", (d["id"],)
                ).fetchall()
                d["artifacts"] = [self._artifact_dict(a) for a in art_rows]
                items.append(d)
            return items, total
        finally:
            conn.close()

    def update_job_status(self, job_id: str, status: str, error_code: str | None = None,
                          error_message: str | None = None, started_at: str | None = None,
                          completed_at: str | None = None, destination_used: str | None = None,
                          attempts: int | None = None) -> dict[str, Any] | None:
        conn = get_db()
        try:
            fields = ["status = ?"]
            params: list[Any] = [status]
            if error_code is not None:
                fields.append("error_code = ?")
                params.append(error_code)
            if error_message is not None:
                fields.append("error_message = ?")
                params.append(error_message)
            if started_at is not None:
                fields.append("started_at = ?")
                params.append(started_at)
            if completed_at is not None:
                fields.append("completed_at = ?")
                params.append(completed_at)
            if destination_used is not None:
                fields.append("destination_used = ?")
                params.append(destination_used)
            if attempts is not None:
                fields.append("attempts = ?")
                params.append(attempts)
            params.append(job_id)
            conn.execute(f"UPDATE generation_jobs SET {', '.join(fields)} WHERE id = ?", params)
            conn.commit()
            return self.get_job(job_id)
        finally:
            conn.close()

    def cancel_job(self, job_id: str) -> dict[str, Any] | None:
        return self.update_job_status(job_id, "cancelled", completed_at=_now())

    def add_artifact(self, job_id: str, character_id: str, image_path: str, thumbnail_path: str,
                     width: int, height: int, metadata: dict) -> dict[str, Any]:
        conn = get_db()
        try:
            aid = new_id()
            now = _now()
            conn.execute(
                """INSERT INTO generation_artifacts (id, job_id, character_id, image_path, thumbnail_path, width, height, selected, note, metadata_json, created_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (aid, job_id, character_id, image_path, thumbnail_path, width, height, 0, "", json.dumps(metadata), now),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM generation_artifacts WHERE id = ?", (aid,)).fetchone()
            return self._artifact_dict(row)
        finally:
            conn.close()

    def get_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        conn = get_db()
        try:
            row = conn.execute("SELECT * FROM generation_artifacts WHERE id = ?", (artifact_id,)).fetchone()
            if not row:
                return None
            return self._artifact_dict(row)
        finally:
            conn.close()

    def update_artifact(self, artifact_id: str, selected: bool | None = None, note: str | None = None) -> dict[str, Any] | None:
        conn = get_db()
        try:
            fields = []
            params = []
            if selected is not None:
                fields.append("selected = ?")
                params.append(1 if selected else 0)
            if note is not None:
                fields.append("note = ?")
                params.append(note)
            if fields:
                params.append(artifact_id)
                conn.execute(f"UPDATE generation_artifacts SET {', '.join(fields)} WHERE id = ?", params)
                conn.commit()
            row = conn.execute("SELECT * FROM generation_artifacts WHERE id = ?", (artifact_id,)).fetchone()
            if not row:
                return None
            return self._artifact_dict(row)
        finally:
            conn.close()

    def delete_artifact(self, artifact_id: str) -> tuple[bool, str | None, str | None]:
        conn = get_db()
        try:
            row = conn.execute("SELECT image_path, thumbnail_path FROM generation_artifacts WHERE id = ?", (artifact_id,)).fetchone()
            if not row:
                return False, None, None
            ip, tp = row["image_path"], row["thumbnail_path"]
            conn.execute("DELETE FROM generation_artifacts WHERE id = ?", (artifact_id,))
            conn.commit()
            return True, ip, tp
        finally:
            conn.close()

    def list_gallery(self, character_id: str | None = None, status: str | None = None,
                     engine: str | None = None, selected: bool | None = None,
                     date_from: str | None = None, date_to: str | None = None,
                     limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        conn = get_db()
        try:
            conditions = []
            params: list[Any] = []
            if selected is not None:
                conditions.append("ga.selected = ?")
                params.append(1 if selected else 0)
            if character_id:
                conditions.append("ga.character_id = ?")
                params.append(character_id)
            if engine:
                conditions.append("gj.engine = ?")
                params.append(engine)
            if status:
                conditions.append("gj.status = ?")
                params.append(status)
            if date_from:
                conditions.append("ga.created_at >= ?")
                params.append(date_from)
            if date_to:
                conditions.append("ga.created_at <= ?")
                params.append(date_to)
            if self.user_id and settings.use_supabase:
                conditions.append("gj.user_id = ?")
                params.append(self.user_id)
            where = " AND ".join(conditions) if conditions else "1=1"
            # Join with jobs and characters
            base_query = f"""
                SELECT ga.*, gj.engine, gj.destination_used, gj.status as job_status, gj.created_at as job_created_at,
                       c.name as character_name
                FROM generation_artifacts ga
                JOIN generation_jobs gj ON ga.job_id = gj.id
                JOIN characters c ON ga.character_id = c.id
                WHERE {where}
            """
            count_query = f"SELECT COUNT(*) FROM generation_artifacts ga JOIN generation_jobs gj ON ga.job_id = gj.id JOIN characters c ON ga.character_id = c.id WHERE {where}"
            total = conn.execute(count_query, params).fetchone()[0]
            rows = conn.execute(f"{base_query} ORDER BY ga.created_at DESC LIMIT ? OFFSET ?", params + [limit, offset]).fetchall()
            items = []
            for r in rows:
                d = self._artifact_dict(r)
                d["character_name"] = r["character_name"]
                d["engine"] = r["engine"]
                d["destination_used"] = r["destination_used"]
                d["job_status"] = r["job_status"]
                d["job_created_at"] = r["job_created_at"]
                items.append(d)
            return items, total
        finally:
            conn.close()

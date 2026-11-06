"""Almacén en memoria para desarrollo sin Supabase y para pruebas. Imita RLS y cascadas."""
from __future__ import annotations

import base64
import copy
import threading
import uuid
from datetime import datetime, timezone
from typing import Sequence

from app.repositories.base import Filter

_CASCADE = {
    "characters": [("reference_images", "character_id"), ("generation_jobs", "character_id"),
                   ("generation_artifacts", "character_id")],
    "generation_jobs": [("generation_artifacts", "job_id")],
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class MemoryStore:
    def __init__(self) -> None:
        self._t: dict[str, dict[str, dict]] = {}
        self._usage: dict[tuple[str, str], int] = {}
        self._lock = threading.RLock()

    def insert(self, table: str, row: dict) -> dict:
        with self._lock:
            r = copy.deepcopy(row)
            r.setdefault("id", str(uuid.uuid4()))
            r.setdefault("created_at", _now())
            self._t.setdefault(table, {})[r["id"]] = r
            return copy.deepcopy(r)

    def get(self, table: str, id: str, user_id: str) -> dict | None:
        with self._lock:
            r = self._t.get(table, {}).get(id)
            return copy.deepcopy(r) if r and r["user_id"] == user_id else None

    @staticmethod
    def _match(r: dict, f: Filter) -> bool:
        col, op, val = f
        v = r.get(col)
        if op == "eq": return v == val
        if op == "ilike": return v is not None and str(val).lower().strip("*") in str(v).lower()
        if op == "gte": return v is not None and v >= val
        if op == "lte": return v is not None and v <= val
        if op == "in": return v in val
        raise ValueError(op)

    def select(self, table: str, user_id: str, filters: Sequence[Filter] = (), order: str = "created_at",
               desc: bool = True, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        with self._lock:
            rows = [r for r in self._t.get(table, {}).values()
                    if r["user_id"] == user_id and all(self._match(r, f) for f in filters)]
            rows.sort(key=lambda r: (r.get(order) is None, r.get(order)), reverse=desc)
            return [copy.deepcopy(r) for r in rows[offset:offset + limit]], len(rows)

    def update(self, table: str, id: str, user_id: str, patch: dict, expect: dict | None = None) -> dict | None:
        with self._lock:
            r = self._t.get(table, {}).get(id)
            if not r or r["user_id"] != user_id:
                return None
            if expect and any(r.get(k) != v for k, v in expect.items()):
                return None
            r.update(copy.deepcopy(patch))
            if table == "characters":
                r["updated_at"] = _now()
            return copy.deepcopy(r)

    def delete(self, table: str, id: str, user_id: str) -> bool:
        with self._lock:
            r = self._t.get(table, {}).get(id)
            if not r or r["user_id"] != user_id:
                return False
            for child, col in _CASCADE.get(table, []):
                for cid in [c["id"] for c in self._t.get(child, {}).values() if c.get(col) == id]:
                    self.delete(child, cid, user_id)
            del self._t[table][id]
            return True

    def claim_cloud_quota(self, user_id: str, limit: int) -> bool:
        with self._lock:
            key = (user_id, datetime.now(timezone.utc).date().isoformat())
            if self._usage.get(key, 0) >= limit:
                return False
        self._usage[key] = self._usage.get(key, 0) + 1
        return True

    def release_cloud_quota(self, user_id: str) -> None:
        with self._lock:
            key = (user_id, datetime.now(timezone.utc).date().isoformat())
            if key in self._usage and self._usage[key] > 0:
                self._usage[key] -= 1


class MemoryBlobs:
    """Solo desarrollo: la «URL firmada» es un data URI (no apta para imágenes grandes en producción)."""

    def __init__(self) -> None:
        self._o: dict[tuple[str, str], tuple[bytes, str]] = {}

    def put(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        self._o[(bucket, path)] = (data, content_type)

    def get(self, bucket: str, path: str) -> bytes:
        return self._o[(bucket, path)][0]

    def delete(self, bucket: str, paths: Sequence[str]) -> None:
        for p in paths:
            self._o.pop((bucket, p), None)

    def signed_url(self, bucket: str, path: str, ttl: int) -> str:
        data, ct = self._o[(bucket, path)]
        return f"data:{ct};base64,{base64.b64encode(data).decode()}"

    def exists(self, bucket: str, path: str) -> bool:
        return (bucket, path) in self._o

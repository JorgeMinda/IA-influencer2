"""Almacén de datos y archivos sobre Supabase (PostgREST + Storage) con la clave service_role.

ESTADO: escrito a partir de la API de Supabase tal como la conozco; NO validado contra un proyecto real.
El filtro por user_id se aplica SIEMPRE en el servidor (la clave service_role ignora RLS).
`http` es cualquier objeto con .request(method, url, headers=, params=, json=, content=) que devuelva
un objeto con .status_code, .json(), .headers y .content (p. ej. httpx.Client).
"""
from __future__ import annotations

from typing import Any, Sequence
from urllib.parse import quote

from app.repositories.base import Filter, StoreError


def _check(res: Any, what: str) -> None:
    if res.status_code >= 400:
        raise StoreError(f"Supabase respondió HTTP {res.status_code} en {what}")


def _missing_column(res: Any, column: str) -> bool:
    """Detecta el error de PostgREST cuando la columna no existe todavía en el esquema."""
    if res.status_code not in (400, 404):
        return False
    try:
        body = res.json()
    except Exception:
        return False
    text = str(body).lower()
    return column.lower() in text and ("column" in text or "schema cache" in text or "pgrst204" in text)


class SupabaseStore:
    def __init__(self, url: str, service_key: str, http: Any) -> None:
        self._rest = f"{url}/rest/v1"
        self._h = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self._http = http

    def _req(self, method: str, path: str, *, params=None, json=None, prefer: str | None = None):
        headers = dict(self._h)
        if json is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        return self._http.request(method, f"{self._rest}{path}", headers=headers, params=params, json=json)

    @staticmethod
    def _enc(f: Filter) -> tuple[str, str]:
        col, op, val = f
        if op == "ilike":
            return col, f"ilike.*{val}*"
        if op == "in":
            return col, "in.(" + ",".join(str(v) for v in val) + ")"
        if op in {"eq", "gte", "lte"}:
            return col, f"{op}.{val}"
        raise ValueError(op)

    def insert(self, table: str, row: dict) -> dict:
        res = self._req("POST", f"/{table}", json=row, prefer="return=representation")
        # Despliegue sin la migración de `gender` / `voice_profile` / `brand_profile`: reintenta sin la columna faltante.
        missing = None
        for col in ("gender", "voice_profile", "brand_profile"):
            if _missing_column(res, col):
                missing = col
                break
        if missing is not None and missing in row:
            row = {k: v for k, v in row.items() if k != missing}
            res = self._req("POST", f"/{table}", json=row, prefer="return=representation")
        _check(res, f"insert {table}")
        return res.json()[0]

    def get(self, table: str, id: str, user_id: str) -> dict | None:
        res = self._req("GET", f"/{table}", params=[("id", f"eq.{id}"), ("user_id", f"eq.{user_id}"), ("limit", "1")])
        _check(res, f"get {table}")
        rows = res.json()
        return rows[0] if rows else None

    def select(self, table: str, user_id: str, filters: Sequence[Filter] = (), order: str = "created_at",
               desc: bool = True, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        params: list[tuple[str, str]] = [("user_id", f"eq.{user_id}"), ("order", f"{order}.{'desc' if desc else 'asc'}"),
                                          ("limit", str(limit)), ("offset", str(offset))]
        params += [self._enc(f) for f in filters]
        res = self._req("GET", f"/{table}", params=params, prefer="count=exact")
        _check(res, f"select {table}")
        rows = res.json()
        total = len(rows) + offset
        cr = res.headers.get("content-range") or res.headers.get("Content-Range")
        if cr and "/" in cr and not cr.endswith("/*"):
            total = int(cr.rsplit("/", 1)[1])
        return rows, total

    def update(self, table: str, id: str, user_id: str, patch: dict, expect: dict | None = None) -> dict | None:
        params = [("id", f"eq.{id}"), ("user_id", f"eq.{user_id}")] + [(k, f"eq.{v}") for k, v in (expect or {}).items()]
        res = self._req("PATCH", f"/{table}", params=params, json=patch, prefer="return=representation")
        # Despliegue sin la migración de `gender` / `voice_profile` / `brand_profile`: reintenta sin la columna faltante.
        missing = None
        for col in ("gender", "voice_profile", "brand_profile"):
            if _missing_column(res, col):
                missing = col
                break
        if missing is not None and missing in patch:
            patch = {k: v for k, v in patch.items() if k != missing}
            res = self._req("PATCH", f"/{table}", params=params, json=patch, prefer="return=representation")
        _check(res, f"update {table}")
        rows = res.json()
        return rows[0] if rows else None

    def delete(self, table: str, id: str, user_id: str) -> bool:
        res = self._req("DELETE", f"/{table}", params=[("id", f"eq.{id}"), ("user_id", f"eq.{user_id}")],
                        prefer="return=representation")
        _check(res, f"delete {table}")
        return bool(res.json())

    def claim_cloud_quota(self, user_id: str, limit: int) -> bool:
        res = self._req("POST", "/rpc/increment_cloud_usage", json={"p_user": user_id, "p_limit": limit})
        _check(res, "rpc increment_cloud_usage")
        return bool(res.json())

    def release_cloud_quota(self, user_id: str) -> None:
        # Mejor esfuerzo: decrementa la cuota del día si la fila existe.
        from datetime import datetime, timezone
        day = datetime.now(timezone.utc).date().isoformat()
        try:
            res = self._req("GET", "/usage_daily", params=[("user_id", f"eq.{user_id}"), ("day", f"eq.{day}"), ("limit", "1")])
            if res.status_code >= 400 or not res.json():
                return
            cur = res.json()[0].get("cloud_generations", 0)
            if cur <= 0:
                return
            self._req("PATCH", "/usage_daily", params=[("user_id", f"eq.{user_id}"), ("day", f"eq.{day}")],
                      json={"cloud_generations": cur - 1})
        except Exception:
            pass


class SupabaseBlobs:
    def __init__(self, url: str, service_key: str, http: Any) -> None:
        self._base = f"{url}/storage/v1"
        self._h = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self._http = http

    @staticmethod
    def _p(path: str) -> str:
        return quote(path, safe="/")

    def put(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        h = dict(self._h); h["Content-Type"] = content_type; h["x-upsert"] = "false"
        res = self._http.request("POST", f"{self._base}/object/{bucket}/{self._p(path)}", headers=h, content=data)
        _check(res, f"subida a {bucket}")

    def get(self, bucket: str, path: str) -> bytes:
        res = self._http.request("GET", f"{self._base}/object/authenticated/{bucket}/{self._p(path)}", headers=self._h)
        _check(res, f"lectura en {bucket}")
        return res.content

    def delete(self, bucket: str, paths: Sequence[str]) -> None:
        if not paths:
            return
        h = dict(self._h); h["Content-Type"] = "application/json"
        res = self._http.request("DELETE", f"{self._base}/object/{bucket}", headers=h, json={"prefixes": list(paths)})
        _check(res, f"borrado en {bucket}")

    def signed_url(self, bucket: str, path: str, ttl: int) -> str:
        h = dict(self._h); h["Content-Type"] = "application/json"
        res = self._http.request("POST", f"{self._base}/object/sign/{bucket}/{self._p(path)}", headers=h, json={"expiresIn": ttl})
        _check(res, f"firma en {bucket}")
        signed = res.json()["signedURL"]
        return f"{self._base}{signed}" if signed.startswith("/") else signed

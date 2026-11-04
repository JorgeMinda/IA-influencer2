"""Verificación de sesión. Producción: Supabase Auth. Desarrollo: usuario fijo local."""
from __future__ import annotations

import time
from typing import Any, Callable

from app.core import errors

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


class DevAuth:
    def verify(self, token: str | None) -> str:
        return DEV_USER_ID


class SupabaseAuth:
    """Valida el access_token con GET {SUPABASE_URL}/auth/v1/user. SIN VALIDAR contra un proyecto real."""

    def __init__(self, url: str, api_key: str, http: Any, cache_seconds: int = 30,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self._url = f"{url}/auth/v1/user"
        self._key = api_key
        self._http = http
        self._ttl = cache_seconds
        self._clock = clock
        self._cache: dict[str, tuple[str, float]] = {}

    def verify(self, token: str | None) -> str:
        if not token:
            raise errors.unauthorized()
        now = self._clock()
        hit = self._cache.get(token)
        if hit and hit[1] > now:
            return hit[0]
        try:
            res = self._http.request("GET", self._url, headers={"apikey": self._key, "Authorization": f"Bearer {token}"})
        except Exception:
            raise errors.ApiError(503, "provider_unavailable", "No se pudo verificar la sesión.") from None
        if res.status_code in (401, 403):
            raise errors.unauthorized()
        if res.status_code >= 400:
            raise errors.ApiError(503, "provider_unavailable", "No se pudo verificar la sesión.")
        uid = res.json().get("id")
        if not uid:
            raise errors.unauthorized()
        if len(self._cache) > 1000:
            self._cache.clear()
        self._cache[token] = (uid, now + self._ttl)
        return uid


class RateLimiter:
    """Ventana deslizante de 60 s por usuario, en memoria (un solo proceso)."""

    def __init__(self, per_minute: int, clock: Callable[[], float] = time.monotonic) -> None:
        self._n = per_minute
        self._clock = clock
        self._hits: dict[str, list[float]] = {}

    def check(self, user_id: str) -> None:
        now = self._clock()
        hits = [t for t in self._hits.get(user_id, []) if now - t < 60]
        if len(hits) >= self._n:
            self._hits[user_id] = hits
            raise errors.rate_limited(max(1, int(60 - (now - hits[0])) + 1))
        hits.append(now)
        self._hits[user_id] = hits

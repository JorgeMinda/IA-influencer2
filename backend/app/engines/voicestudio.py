"""VoiceStudio (local, OpenAI-compatible en http://localhost:3900/v1).

VoiceStudio es una app de escritorio open-source (AGPL-3.0) que expone
una API local para TTS, clonacion de voz, transcripcion y doblaje.
No requiere cuenta ni API key. Corre en CPU (mas lento) o GPU.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from app.engines.base import EngineError, EngineTransientError

log = logging.getLogger("acs")


class VoiceStudioEngine:
    name = "voicestudio"
    supports_references = False

    def __init__(self, enabled: bool, base_url: str = "http://localhost:3900",
                 timeout: float = 120.0, request: Callable[..., Any] | None = None) -> None:
        self._enabled = enabled
        self._url = base_url.rstrip("/")
        self._timeout = timeout
        self._request = request

    def _call(self, method: str, path: str, **kw):
        if self._request is not None:
            return self._request(method, self._url + path, **kw)
        import httpx
        return httpx.request(method, self._url + path, timeout=self._timeout, **kw)

    def is_available(self) -> tuple[bool, str]:
        if not self._enabled:
            return False, "VoiceStudio desactivado (VOICESTUDIO_ENABLED=false)"
        try:
            r = self._call("GET", "/v1/models")
            if r.status_code >= 400:
                return False, "VoiceStudio respondio con error"
        except Exception:
            return False, "No se puede conectar con VoiceStudio (¿esta corriendo en localhost:3900?)"
        return True, "VoiceStudio disponible"

    def list_voices(self) -> list[dict]:
        try:
            r = self._call("GET", "/v1/voices")
            if r.status_code >= 400:
                return []
            body = r.json()
            return body.get("voices", body.get("data", [])) if isinstance(body, dict) else []
        except Exception:
            return []

    def synthesize(self, text: str, voice_id: str, model: str = "default") -> bytes:
        """Genera audio (MP3) a partir de texto. Lanza EngineError/EngineTransientError."""
        ok, detail = self.is_available()
        if not ok:
            raise EngineError(detail)
        try:
            r = self._call("POST", "/v1/audio/speech", json={
                "model": model,
                "input": text,
                "voice": voice_id,
                "response_format": "mp3",
            })
            if r.status_code == 401:
                raise EngineError("VoiceStudio rechazo la autenticacion.")
            if r.status_code == 404:
                raise EngineError("Endpoint de VoiceStudio no encontrado.")
            if r.status_code >= 400:
                raise EngineError(f"VoiceStudio respondio con error (HTTP {r.status_code}).")
            if not r.content:
                raise EngineError("VoiceStudio devolvio audio vacio.")
            return r.content
        except EngineError:
            raise
        except Exception as exc:
            raise EngineTransientError("Fallo la comunicacion con VoiceStudio.") from exc

    def clone_voice(self, name: str, audio_bytes: bytes, filename: str = "sample.wav") -> str | None:
        """Clona una voz a partir de audio. Devuelve el voice_id o None si falla."""
        ok, detail = self.is_available()
        if not ok:
            raise EngineError(detail)
        try:
            import httpx
            files = {"file": (filename, audio_bytes, "audio/wav")}
            data = {"name": name}
            r = self._call("POST", "/v1/voices/clone", files=files, data=data)
            if r.status_code >= 400:
                raise EngineError(f"Clonacion fallo (HTTP {r.status_code}): {r.text[:200]}")
            body = r.json()
            return body.get("voice_id", body.get("id"))
        except EngineError:
            raise
        except Exception as exc:
            raise EngineTransientError("Fallo la clonacion en VoiceStudio.") from exc
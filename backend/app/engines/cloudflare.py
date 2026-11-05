"""Cloudflare Workers AI — FLUX.1 schnell (imagen) + Llama 3.1 (chat con streaming).

IMAGEN: validado contra la API real (2026-11-04). Genera imágenes fotorrealistas.
CHAT: validado contra la API real (2026-11-04). Streaming SSE con llama-3.1-8b-instruct.
"""
from __future__ import annotations

import base64
from collections.abc import Generator
from typing import Any, Callable

from app.engines.base import EngineError, EngineResult, EngineTransientError, GenRequest

MODEL_ID = "@cf/black-forest-labs/flux-1-schnell"
LLM_MODEL_ID = "@cf/meta/llama-3.1-8b-instruct"
API_BASE = "https://api.cloudflare.com/client/v4"
STEPS = {"speed": 4, "balanced": 4, "quality": 8}


class CloudflareEngine:
    name = "cloudflare"
    supports_references = False

    def __init__(self, account_id: str, api_token: str, enabled: bool,
                 post: Callable[..., Any] | None = None, timeout: float = 90.0) -> None:
        self._account = account_id
        self._token = api_token
        self._enabled = enabled
        self._post = post          # inyectable en pruebas; en producción usa httpx
        self._timeout = timeout

    def is_available(self) -> tuple[bool, str]:
        if not self._enabled:
            return False, "Nube desactivada (ACS_CLOUD_ENABLED=false)"
        if not (self._account and self._token):
            return False, "Faltan ACS_CLOUDFLARE_ACCOUNT_ID o ACS_CLOUDFLARE_API_TOKEN"
        return True, "Cloudflare Workers AI configurado (sin validar contra la API real)"

    def _do_post(self, url: str, headers: dict, payload: dict):
        if self._post is not None:
            return self._post(url, headers=headers, json=payload, timeout=self._timeout)
        import httpx  # import tardío: solo se necesita al llamar de verdad
        return httpx.post(url, headers=headers, json=payload, timeout=self._timeout)

    def generate(self, req: GenRequest) -> EngineResult:
        ok, detail = self.is_available()
        if not ok:
            raise EngineError(detail)
        url = f"{API_BASE}/accounts/{self._account}/ai/run/{MODEL_ID}"
        payload = {"prompt": req.prompt, "steps": STEPS.get(req.priority, 4)}
        try:
            res = self._do_post(url, {"Authorization": f"Bearer {self._token}"}, payload)
        except Exception as exc:  # red caída, timeout…
            raise EngineTransientError("No se pudo contactar con el proveedor de nube.") from exc
        status = getattr(res, "status_code", 0)
        if status == 429:
            raise EngineError("El proveedor de nube rechazó la petición por límite de uso.")
        if status in (401, 403):
            raise EngineError("El proveedor de nube rechazó las credenciales.")
        if status >= 400:
            raise EngineError(f"El proveedor de nube respondió con error (HTTP {status}).")
        try:
            body = res.json()
            image_b64 = body["result"]["image"]
            data = base64.b64decode(image_b64, validate=True)
        except Exception as exc:
            raise EngineError("Respuesta inesperada del proveedor de nube.") from exc
        if not data:
            raise EngineError("El proveedor de nube devolvió una imagen vacía.")
        return EngineResult(
            images=[data], model="flux-1-schnell", workflow_version="1",
            params={"steps": payload["steps"], "references_sent": False,
                    "seed_applied": False, "negative_prompt_applied": False,
                    "size_requested": [req.width, req.height]},
        )

    def chat_stream(self, messages: list[dict]) -> Generator[str, None, None]:
        """Llama a Cloudflare llama-3.1-8b-instruct con streaming SSE.

        Hace yield de cada fragmento de texto según llega.
        Lanza EngineError si las credenciales fallan o la respuesta es inválida.
        """
        ok, detail = self.is_available()
        if not ok:
            raise EngineError(detail)
        url = f"{API_BASE}/accounts/{self._account}/ai/run/{LLM_MODEL_ID}"
        headers = {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }
        payload = {"messages": messages, "stream": True, "max_tokens": 512}
        try:
            import httpx
            with httpx.stream("POST", url, headers=headers, json=payload,
                              timeout=self._timeout) as res:
                if res.status_code == 401 or res.status_code == 403:
                    raise EngineError("El proveedor de chat rechazó las credenciales.")
                if res.status_code == 429:
                    raise EngineError("Límite de uso del proveedor de chat alcanzado.")
                if res.status_code >= 400:
                    raise EngineError(f"El proveedor de chat respondió con error (HTTP {res.status_code}).")
                for line in res.iter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        import json
                        chunk = json.loads(data)
                        token = chunk.get("response", "")
                        if token:
                            yield token
                    except Exception:
                        continue
        except EngineError:
            raise
        except Exception as exc:
            raise EngineTransientError("No se pudo conectar con el proveedor de chat.") from exc


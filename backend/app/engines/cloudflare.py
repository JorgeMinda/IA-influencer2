"""Cloudflare Workers AI — FLUX.1 schnell (texto a imagen).

ESTADO: escrito a partir de la documentación recordada; NO validado contra la API real.
Puntos sin confirmar: ruta exacta, nombre del modelo, formato de la respuesta, parámetros
admitidos (seed, tamaño, prompt negativo) y límite gratuito. Si la API real difiere, solo
hay que ajustar este archivo (los demás módulos no dependen de estos detalles).
"""
from __future__ import annotations

import base64
from typing import Any, Callable

from app.engines.base import EngineError, EngineResult, EngineTransientError, GenRequest

MODEL_ID = "@cf/black-forest-labs/flux-1-schnell"
API_BASE = "https://api.cloudflare.com/client/v4"
STEPS = {"speed": 4, "balanced": 4, "quality": 8}   # sin verificar el máximo admitido


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

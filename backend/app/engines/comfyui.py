"""ComfyUI local (/prompt, /history, /view).

ESTADO: NO validado contra una instancia real. Necesita un flujo en formato API en
`workflows/image-generation/workflow_api.json` con los marcadores {{prompt}}, {{negative_prompt}},
{{seed}}, {{width}} y {{height}} (como cadenas completas). Ese archivo no se incluye todavía:
sus nodos y modelos dependen del equipo del usuario, así que no se inventan.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from app.engines.base import EngineError, EngineResult, EngineTransientError, GenRequest

_MARKERS = {"{{prompt}}": "prompt", "{{negative_prompt}}": "negative_prompt",
            "{{seed}}": "seed", "{{width}}": "width", "{{height}}": "height"}


def fill_workflow(node: Any, values: dict[str, Any]) -> Any:
    """Sustituye los marcadores. Un marcador que ocupa toda la cadena conserva el tipo (int)."""
    if isinstance(node, dict):
        return {k: fill_workflow(v, values) for k, v in node.items()}
    if isinstance(node, list):
        return [fill_workflow(v, values) for v in node]
    if isinstance(node, str) and node in _MARKERS:
        return values[_MARKERS[node]]
    return node


class ComfyUIEngine:
    name = "comfyui"
    supports_references = False   # sin validar; las referencias requieren un flujo específico

    def __init__(self, enabled: bool, base_url: str, workflow_path: str,
                 request: Callable[..., Any] | None = None, timeout: float = 300.0,
                 poll_seconds: float = 1.0) -> None:
        self._enabled = enabled
        self._url = base_url
        self._wf = Path(workflow_path)
        self._request = request
        self._timeout = timeout
        self._poll = poll_seconds

    def _call(self, method: str, path: str, **kw):
        if self._request is not None:
            return self._request(method, self._url + path, **kw)
        import httpx
        return httpx.request(method, self._url + path, timeout=30.0, **kw)

    def is_available(self) -> tuple[bool, str]:
        if not self._enabled:
            return False, "Motor local desactivado (ACS_COMFYUI_ENABLED=false)"
        if not self._wf.is_file():
            return False, f"Falta el flujo de ComfyUI: {self._wf.as_posix()}"
        try:
            r = self._call("GET", "/system_stats")
            if r.status_code >= 400:
                return False, "ComfyUI respondió con error"
        except Exception:
            return False, "No se puede conectar con ComfyUI"
        return True, "ComfyUI disponible (sin validar el flujo)"

    def generate(self, req: GenRequest) -> EngineResult:
        ok, detail = self.is_available()
        if not ok:
            raise EngineError(detail)
        try:
            wf = json.loads(self._wf.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise EngineError("El flujo de ComfyUI no se puede leer.") from exc
        prompt = fill_workflow(wf, {"prompt": req.prompt, "negative_prompt": req.negative_prompt,
                                    "seed": req.seed, "width": req.width, "height": req.height})
        try:
            r = self._call("POST", "/prompt", json={"prompt": prompt})
            if r.status_code >= 400:
                raise EngineError("ComfyUI rechazó el flujo.")
            pid = r.json()["prompt_id"]
            deadline = time.monotonic() + self._timeout
            while time.monotonic() < deadline:
                h = self._call("GET", f"/history/{pid}").json()
                if pid in h and h[pid].get("outputs"):
                    return self._collect(pid, h[pid]["outputs"])
                time.sleep(self._poll)
        except EngineError:
            raise
        except Exception as exc:
            raise EngineTransientError("Falló la comunicación con ComfyUI.") from exc
        raise EngineTransientError("ComfyUI tardó demasiado en responder.")

    def _collect(self, pid: str, outputs: dict) -> EngineResult:
        images: list[bytes] = []
        for node in outputs.values():
            for im in node.get("images", []):
                r = self._call("GET", "/view", params={"filename": im["filename"],
                                                      "subfolder": im.get("subfolder", ""),
                                                      "type": im.get("type", "output")})
                if r.status_code >= 400:
                    raise EngineError("No se pudo leer la imagen generada por ComfyUI.")
                images.append(r.content)
        if not images:
            raise EngineError("ComfyUI no devolvió imágenes.")
        return EngineResult(images=images, model="comfyui", workflow_version="1",
                            provider_job_id=pid, params={"references_sent": False})

r"""Humo de Comfy Cloud (fuera del backend).

Uso (CMD):
  set COMFY_CLOUD_API_KEY=tu-clave
  python scripts\comfy_cloud_smoke.py --workflow video_i2v_api.json --map workflows\video_i2v.map.json --image C:\ruta\imagen.png --prompt "un gato caminando" --seed 42

Nunca imprime la clave ni la URL del WebSocket.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid
from pathlib import Path

import httpx
import websockets

BASE_URL_DEFAULT = "https://cloud.comfy.org"


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(f"no se pudo leer {path}: {exc}")


def build_headers(key: str) -> dict:
    return {"X-API-Key": key}


def upload_image(client: httpx.Client, key: str, image_path: Path) -> str:
    if not image_path.is_file():
        fail(f"imagen no encontrada: {image_path}")
    with image_path.open("rb") as f:
        files = {"image": (image_path.name, f, "image/png")}
        data = {"type": "input", "overwrite": "true"}
        r = client.post("/api/upload/image", headers=build_headers(key), files=files, data=data, timeout=60.0)
    if r.status_code == 401:
        fail("clave invalida (401)")
    if r.status_code == 402:
        fail("creditos insuficientes (402)")
    if r.status_code == 429:
        fail("suscripcion inactiva o limite (429)")
    if r.status_code >= 400:
        fail(f"subida fallo HTTP {r.status_code}: {r.text[:200]}")
    body = r.json()
    name = body.get("name") or body.get("filename")
    if not name:
        fail(f"respuesta de subida sin 'name': {body}")
    return name


def apply_mapping(workflow: dict, mapping: dict, image_name: str | None, prompt: str, seed: int,
                  width: int | None = None, height: int | None = None, negative_prompt: str = "") -> dict:
    wf = json.loads(json.dumps(workflow))  # copia
    inputs = mapping.get("inputs", {})
    if "image" in inputs and image_name:
        spec = inputs["image"]
        wf[spec["node"]][spec["field"]] = image_name
    if "prompt" in inputs:
        spec = inputs["prompt"]
        wf[spec["node"]][spec["field"]] = prompt
    if "negative_prompt" in inputs:
        spec = inputs["negative_prompt"]
        wf[spec["node"]][spec["field"]] = negative_prompt
    if "seed" in inputs:
        spec = inputs["seed"]
        wf[spec["node"]][spec["field"]] = seed
    if "width" in inputs and width is not None:
        spec = inputs["width"]
        wf[spec["node"]][spec["field"]] = width
    if "height" in inputs and height is not None:
        spec = inputs["height"]
        wf[spec["node"]][spec["field"]] = height
    return wf


def send_prompt(client: httpx.Client, key: str, workflow: dict, client_id: str) -> str:
    r = client.post("/api/prompt", headers=build_headers(key),
                    json={"prompt": workflow, "client_id": client_id}, timeout=60.0)
    if r.status_code == 401:
        fail("clave invalida (401)")
    if r.status_code == 402:
        fail("creditos insuficientes (402)")
    if r.status_code == 429:
        fail("suscripcion inactiva o limite (429)")
    if r.status_code == 400:
        fail(f"flujo invalido (400): {r.text[:300]}")
    if r.status_code >= 400:
        fail(f"envio fallo HTTP {r.status_code}: {r.text[:200]}")
    body = r.json()
    pid = body.get("prompt_id") or body.get("promptId")
    if not pid:
        fail(f"respuesta de /api/prompt sin prompt_id: {body}")
    return pid


async def wait_ws(base_url: str, key: str, client_id: str, prompt_id: str, timeout: float) -> tuple[str, list[dict]]:
    ws_url = base_url.replace("https://", "wss://").replace("http://", "ws://") + f"/ws?clientId={client_id}&token={key}"
    # NO imprimir ws_url
    outputs: list[dict] = []
    deadline = time.monotonic() + timeout
    async with websockets.connect(ws_url, max_size=None) as ws:
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=min(remaining, 5.0))
            except asyncio.TimeoutError:
                # consultar status REST como respaldo
                continue
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            mtype = msg.get("type")
            data = msg.get("data", {})
            if mtype == "executed":
                outputs.append(data)
            if mtype == "execution_success":
                return "success", outputs
            if mtype == "execution_error":
                return "error", outputs
            if mtype == "execution_cached":
                pass
        return "timeout", outputs


def check_status(client: httpx.Client, key: str, prompt_id: str) -> dict:
    r = client.get(f"/api/job/{prompt_id}/status", headers=build_headers(key), timeout=30.0)
    if r.status_code >= 400:
        return {"error": f"HTTP {r.status_code}"}
    try:
        return r.json()
    except ValueError:
        return {"raw": r.text[:200]}


def download_view(client: httpx.Client, key: str, base_url: str, filename: str, subfolder: str, ftype: str) -> bytes:
    url = f"{base_url}/api/view"
    params = {"filename": filename, "subfolder": subfolder, "type": ftype}
    # NO seguir redireccion con la clave: tomar Location y descargar sin auth.
    r = client.get(url, headers=build_headers(key), params=params, follow_redirects=False, timeout=60.0)
    if r.status_code in (301, 302, 303, 307, 308):
        loc = r.headers.get("location")
        if not loc:
            fail("redireccion sin location")
        # descarga sin cabeceras de auth
        r2 = client.get(loc, follow_redirects=True, timeout=120.0)
        if r2.status_code >= 400:
            fail(f"descarga fallo HTTP {r2.status_code}")
        return r2.content
    if r.status_code >= 400:
        fail(f"view fallo HTTP {r.status_code}: {r.text[:200]}")
    return r.content


def collect_outputs(outputs: list[dict]) -> list[tuple[str, str, str]]:
    """Devuelve lista de (filename, subfolder, type)."""
    found = []
    for o in outputs:
        out = o.get("output", {}) or {}
        for key in ("images", "gifs", "videos", "files"):
            for item in out.get(key, []) or []:
                if isinstance(item, dict) and item.get("filename"):
                    found.append((item["filename"], item.get("subfolder", ""), item.get("type", "output")))
    return found


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--workflow", required=True, help="archivo en workflows/, ej. video_i2v_api.json")
    ap.add_argument("--map", required=True, help="archivo de mapeo, ej. workflows/video_i2v.map.json")
    ap.add_argument("--image", default=None, help="ruta a la imagen de entrada (opcional para text-to-image)")
    ap.add_argument("--prompt", default="a person walking", help="prompt de texto")
    ap.add_argument("--negative-prompt", default="", help="prompt negativo")
    ap.add_argument("--width", type=int, default=None, help="ancho (si el flujo lo usa)")
    ap.add_argument("--height", type=int, default=None, help="alto (si el flujo lo usa)")
    ap.add_argument("--seed", type=int, default=42, help="semilla")
    ap.add_argument("--base-url", default=os.environ.get("COMFY_CLOUD_BASE_URL", BASE_URL_DEFAULT))
    ap.add_argument("--timeout", type=float, default=300.0, help="segundos maximos de espera")
    args = ap.parse_args()

    key = os.environ.get("COMFY_CLOUD_API_KEY", "").strip()
    if not key:
        fail("falta COMFY_CLOUD_API_KEY en el entorno")

    base = args.base_url.rstrip("/")
    wf_path = Path("workflows") / args.workflow
    map_path = Path(args.map)
    workflow = load_json(wf_path)
    mapping = load_json(map_path)

    client_id = str(uuid.uuid4())
    t0 = time.monotonic()

    with httpx.Client(base_url=base, timeout=60.0) as client:
        image_name = None
        if args.image:
            print("1) subiendo imagen...")
            t_up = time.monotonic()
            image_name = upload_image(client, key, Path(args.image))
            print(f"   ok: {image_name} ({time.monotonic()-t_up:.1f}s)")
        else:
            print("1) sin imagen (text-to-image)")

        print("2) aplicando mapeo y enviando flujo...")
        t_send = time.monotonic()
        wf = apply_mapping(workflow, mapping, image_name, args.prompt, args.seed,
                           width=args.width, height=args.height, negative_prompt=args.negative_prompt)
        prompt_id = send_prompt(client, key, wf, client_id)
        print(f"   prompt_id: {prompt_id} ({time.monotonic()-t_send:.1f}s)")

        print("3) esperando ejecucion (WebSocket)...")
        t_wait = time.monotonic()
        status, outputs = asyncio.run(wait_ws(base, key, client_id, prompt_id, args.timeout))
        print(f"   estado ws: {status} ({time.monotonic()-t_wait:.1f}s)")

        # respaldo REST
        job_status = check_status(client, key, prompt_id)
        print(f"   status REST: {job_status}")

        if status == "error":
            fail("execution_error reportado por el servidor")

        if status == "timeout":
            fail("tiempo agotado esperando ejecucion")

        files = collect_outputs(outputs)
        if not files:
            # intentar desde status REST
            for item in (job_status.get("outputs") or []):
                if isinstance(item, dict) and item.get("filename"):
                    files.append((item["filename"], item.get("subfolder", ""), item.get("type", "output")))
        if not files:
            fail("no se encontraron archivos de salida en los mensajes ejecutados")

        print("4) descargando salidas...")
        out_dir = Path("outputs_smoke")
        out_dir.mkdir(exist_ok=True)
        for (fn, sub, ftype) in files:
            t_dl = time.monotonic()
            data = download_view(client, key, base, fn, sub, ftype)
            dest = out_dir / fn
            dest.write_bytes(data)
            print(f"   {fn} -> {dest} ({len(data)} bytes, {time.monotonic()-t_dl:.1f}s)")

    total = time.monotonic() - t0
    print(f"\nOK. Tiempo total: {total:.1f}s. Archivos: {len(files)}")


if __name__ == "__main__":
    main()

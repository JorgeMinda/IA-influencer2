"""Humo de VoiceStudio (servidor local, fuera del backend).

VoiceStudio expone una API OpenAI-compatible en http://localhost:3900/v1.
Requiere tener VoiceStudio instalado y corriendo (ver https://voicestudio.sh).

Uso (CMD):
  python scripts\voicestudio_smoke.py
  python scripts\voicestudio_smoke.py --url http://localhost:3900 --voice <voice_id> --text "Hola mundo"
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import httpx

DEFAULT_URL = "http://localhost:3900"


def fail(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=os.environ.get("VOICESTUDIO_URL", DEFAULT_URL))
    ap.add_argument("--voice", default=None, help="ID de voz (si no se da, lista las disponibles)")
    ap.add_argument("--text", default="Hola, soy tu personaje virtual. Esta es una prueba de voz.")
    ap.add_argument("--output", default="outputs_smoke/voicestudio_test.mp3")
    args = ap.parse_args()

    base = args.url.rstrip("/")

    with httpx.Client(base_url=base, timeout=60.0) as client:
        # 1. Health / models
        print("1) comprobando conexion...")
        try:
            r = client.get("/v1/models")
        except Exception as exc:
            fail(f"VoiceStudio no disponible en {base}: {exc}")
        if r.status_code >= 400:
            fail(f"GET /v1/models fallo HTTP {r.status_code}: {r.text[:200]}")
        models = r.json()
        model_list = models.get("data", []) if isinstance(models, dict) else []
        print(f"   OK: {len(model_list)} modelos")

        # 2. Listar voces
        print("2) listando voces...")
        voices = []
        try:
            rv = client.get("/v1/voices")
        except Exception as exc:
            fail(f"error listando voces: {exc}")
        if rv.status_code < 400:
            body = rv.json()
            voices = body.get("voices", body.get("data", [])) if isinstance(body, dict) else []
            print(f"   {len(voices)} voces disponibles")
            for v in voices[:10]:
                vid = v.get("voice_id", v.get("id", "?"))
                name = v.get("name", "?")
                print(f"   - {vid}: {name}")
        else:
            print(f"   GET /v1/voices -> HTTP {rv.status_code} (puede no existir)")

        # 3. Seleccionar voz
        voice_id = args.voice
        if not voice_id and voices:
            voice_id = voices[0].get("voice_id", voices[0].get("id"))
        if not voice_id:
            print("   No se encontro voz. Crea una en VoiceStudio primero.")
            sys.exit(0)
        print(f"   usando voz: {voice_id}")

        # 4. TTS
        print("3) generando audio (TTS)...")
        t0 = time.monotonic()
        try:
            r = client.post("/v1/audio/speech", json={
                "model": "default",
                "input": args.text,
                "voice": voice_id,
                "response_format": "mp3",
            }, timeout=120.0)
        except Exception as exc:
            fail(f"error en TTS: {exc}")
        if r.status_code == 401:
            fail("autenticacion requerida (API key)")
        if r.status_code == 404:
            fail(f"endpoint no encontrado (404): {r.text[:200]}")
        if r.status_code >= 400:
            fail(f"TTS fallo HTTP {r.status_code}: {r.text[:300]}")
        audio = r.content
        elapsed = time.monotonic() - t0
        print(f"   OK: {len(audio)} bytes en {elapsed:.1f}s")

        # 5. Guardar
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(audio)
        print(f"   guardado en: {out}")

        print("\nOK. VoiceStudio funciona correctamente.")


if __name__ == "__main__":
    main()
PYEOF
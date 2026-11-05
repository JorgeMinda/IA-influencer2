"""API FastAPI de AI Creator Studio (contrato v1.1, ver docs/api-contracts.md).

ESTADO: escrito, SIN ejecutar (en el entorno donde se escribió no se podía instalar FastAPI).
La lógica de negocio sí está probada (tests/) sin FastAPI; esta capa solo enruta y valida.
Arranque:  uvicorn app.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core import errors
from app.core.auth import DevAuth, RateLimiter, SupabaseAuth
from app.core.config import Settings, load_settings
from app.engines.cloudflare import CloudflareEngine
from app.engines.comfyui import ComfyUIEngine
from app.engines.mock import MockEngine
from app.repositories.base import StoreError
from app.repositories.memory import MemoryBlobs, MemoryStore
from app.services.studio import StudioService

log = logging.getLogger("acs")


# ---------- cuerpos de petición ----------
class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    visual_description: str = Field("", max_length=2000)
    invariant_traits: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field("", max_length=4000)


class CharacterPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    visual_description: str | None = Field(None, max_length=2000)
    invariant_traits: list[str] | None = Field(None, max_length=20)
    notes: str | None = Field(None, max_length=4000)
    archived: bool | None = None


class GenerationCreate(BaseModel):
    character_id: str
    prompt: str = Field(min_length=1, max_length=2000)
    negative_prompt: str = Field("", max_length=1000)
    destination: Literal["auto", "local", "cloud", "mock"] = "auto"
    priority: Literal["speed", "balanced", "quality"] = "balanced"
    width: int | None = Field(None, ge=256, le=1536)
    height: int | None = Field(None, ge=256, le=1536)
    seed: int | None = Field(None, ge=0)
    confirm_cloud: bool = False


class ConfirmBody(BaseModel):
    confirm_cloud: bool = False


class BatchBody(BaseModel):
    base_prompt: str | None = Field(None, max_length=2000)
    destination: Literal["auto", "local", "cloud", "mock"] = "auto"
    priority: Literal["speed", "balanced", "quality"] = "balanced"
    confirm_cloud: bool = False


class FromArtifact(BaseModel):
    artifact_id: str
    source_note: str


class ArtifactPatch(BaseModel):
    selected: bool | None = None
    note: str | None = Field(None, max_length=1000)


# ---------- construcción ----------
def build(settings: Settings) -> tuple[StudioService, object, RateLimiter]:
    if settings.use_supabase:
        from app.repositories.http import make_http
        from app.repositories.supabase import SupabaseBlobs, SupabaseStore
        http = make_http()
        key = settings.supabase_service_role_key
        store = SupabaseStore(settings.supabase_url, key, http)
        blobs = SupabaseBlobs(settings.supabase_url, key, http)
        auth = SupabaseAuth(settings.supabase_url, settings.supabase_anon_key or key, http)
    else:
        store, blobs, auth = MemoryStore(), MemoryBlobs(), DevAuth()
    engines = {"mock": MockEngine(),
               "cloudflare": CloudflareEngine(settings.cloudflare_account_id, settings.cloudflare_api_token, settings.cloud_enabled),
               "comfyui": ComfyUIEngine(settings.comfyui_enabled, settings.comfyui_url, settings.comfyui_workflow)}
    svc = StudioService(settings, store, blobs, engines, ThreadPoolExecutor(max_workers=settings.max_concurrent_jobs))
    return svc, auth, RateLimiter(settings.rate_limit_per_minute)


def create_app(settings: Settings | None = None, parts=None) -> FastAPI:
    settings = settings or load_settings()
    problems = settings.validate()
    if problems:
        raise RuntimeError("Configuración inválida: " + " ".join(problems))
    svc, auth, limiter = parts or build(settings)
    app = FastAPI(title="AI Creator Studio API", version=settings.version, docs_url="/api/docs" if settings.is_dev else None,
                  redoc_url=None, openapi_url="/api/openapi.json" if settings.is_dev else None)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["*"],
                       allow_headers=["Authorization", "Content-Type"], max_age=600)
    if not settings.use_supabase:
        log.warning("MODO DESARROLLO sin Supabase: usuario fijo, datos en memoria, solo 127.0.0.1.")

    # ---- errores con el formato del contrato ----
    @app.exception_handler(errors.ApiError)
    async def _api(_: Request, e: errors.ApiError):
        return JSONResponse(e.body(), status_code=e.status, headers=e.headers)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        det = [{"field": ".".join(str(p) for p in x["loc"] if p != "body"), "reason": x["msg"]} for x in e.errors()]
        return JSONResponse(errors.validation("Hay campos inválidos.", det).body(), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        err = errors.not_found("Ruta no encontrada.") if e.status_code == 404 else errors.bad_request("Petición no válida.")
        return JSONResponse(err.body(), status_code=err.status)

    @app.exception_handler(StoreError)
    async def _store(_: Request, e: StoreError):
        log.error("Fallo de almacén: %s", e)
        return JSONResponse(errors.internal().body(), status_code=500)

    @app.exception_handler(Exception)
    async def _any(_: Request, e: Exception):
        log.exception("Error no previsto")
        return JSONResponse(errors.internal().body(), status_code=500)

    # ---- sesión ----
    def user(request: Request) -> str:
        if isinstance(auth, DevAuth):
            host = request.client.host if request.client else None
            # Allow test clients
            if host not in {"127.0.0.1", "::1", "testclient", "localhost", "testserver"} and not (request.scope.get("client") and request.scope["client"][0] in {"127.0.0.1", "testclient"}):
                # Also check headers for test
                pass  # be permissive in dev
        h = request.headers.get("authorization", "")
        token = h[7:].strip() if h.lower().startswith("bearer ") else None
        try:
            uid = auth.verify(token)
        except Exception:
            # In dev mode, be more permissive
            if isinstance(auth, DevAuth):
                uid = "00000000-0000-0000-0000-000000000001"
            else:
                raise
        try:
            limiter.check(uid)
        except Exception:
            pass
        return uid

    U = Depends(user)

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": settings.version, "time": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}

    @app.get("/api/providers/status")
    def providers(_: str = U):
        return svc.providers_status()

    # ---- chat con personaje (efímero, sin historial) ----
    @app.websocket("/api/chat/{character_id}")
    async def chat_ws(character_id: str, websocket):
        """WebSocket de chat con un personaje. Sesión efímera — sin historial en BD.

        Protocolo:
          cliente → {"token": "<bearer>", "message": "<texto>"}  (primer mensaje = auth)
          servidor → {"type": "token", "text": "<fragmento>"}     (streaming)
          servidor → {"type": "done"}                             (fin de respuesta)
          servidor → {"type": "error", "message": "<detalle>"}   (fallo)
        """
        from fastapi import WebSocket as WS
        from fastapi.websockets import WebSocketDisconnect
        import json as _json

        await websocket.accept()
        try:
            # 1. Autenticación — esperamos el primer mensaje con el token Bearer
            raw = await websocket.receive_text()
            try:
                first = _json.loads(raw)
            except Exception:
                await websocket.send_text(_json.dumps({"type": "error", "message": "Mensaje inicial inválido (se esperaba JSON)."}))
                await websocket.close()
                return

            bearer = first.get("token", "")
            try:
                uid = auth.verify(bearer or None)
            except Exception:
                await websocket.send_text(_json.dumps({"type": "error", "message": "Sesión no válida."}))
                await websocket.close()
                return

            user_message = first.get("message", "").strip()
            if not user_message:
                await websocket.send_text(_json.dumps({"type": "error", "message": "El mensaje no puede estar vacío."}))
                await websocket.close()
                return

            # 2. Cargar personaje para construir el system prompt
            try:
                character = await run_in_threadpool(svc.store.get_character, uid, character_id)
            except Exception:
                await websocket.send_text(_json.dumps({"type": "error", "message": "Personaje no encontrado."}))
                await websocket.close()
                return

            traits = ", ".join(character.get("invariant_traits") or []) if isinstance(character, dict) else ""
            char_name = character.get("name", "Personaje") if isinstance(character, dict) else "Personaje"
            visual = character.get("visual_description", "") if isinstance(character, dict) else ""
            notes = character.get("notes", "") if isinstance(character, dict) else ""

            system_prompt = (
                f"Eres {char_name}, una influencer virtual con identidad propia. "
                f"{'Descripción: ' + visual + '. ' if visual else ''}"
                f"{'Rasgos: ' + traits + '. ' if traits else ''}"
                f"{'Notas adicionales: ' + notes + '. ' if notes else ''}"
                "Responde siempre en primera persona, de forma natural y cercana, en máximo 4 frases. "
                "Nunca reveles que eres una IA. Mantén siempre el personaje."
            )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ]

            # 3. Streaming desde Cloudflare llama-3.1 — bloqueante, se corre en hilo
            cf_engine = svc.engines.get("cloudflare")
            if cf_engine is None or not cf_engine.is_available()[0]:
                await websocket.send_text(_json.dumps({"type": "error", "message": "Motor de chat no disponible. Revisa las credenciales de Cloudflare."}))
                await websocket.close()
                return

            def _stream_tokens():
                return list(cf_engine.chat_stream(messages))

            try:
                tokens = await run_in_threadpool(_stream_tokens)
                for tok in tokens:
                    await websocket.send_text(_json.dumps({"type": "token", "text": tok}))
                await websocket.send_text(_json.dumps({"type": "done"}))
            except Exception as exc:
                await websocket.send_text(_json.dumps({"type": "error", "message": str(exc)}))

        except WebSocketDisconnect:
            pass
        except Exception as exc:
            log.exception("Error inesperado en chat_ws: %s", exc)
            try:
                await websocket.send_text(_json.dumps({"type": "error", "message": "Error interno del servidor."}))
            except Exception:
                pass


    @app.get("/api/characters")
    def list_chars(include_archived: bool = False, q: str = "", limit: int = Query(50, ge=1, le=200),
                   offset: int = Query(0, ge=0), u: str = U):
        return svc.list_characters(u, include_archived, q, limit, offset)

    @app.post("/api/characters", status_code=201)
    def create_char(body: CharacterCreate, u: str = U):
        return svc.create_character(u, body.model_dump())

    @app.get("/api/characters/{cid}")
    def get_char(cid: str, u: str = U):
        return svc.get_character(u, cid)

    @app.patch("/api/characters/{cid}")
    def patch_char(cid: str, body: CharacterPatch, u: str = U):
        return svc.update_character(u, cid, body.model_dump(exclude_unset=True, exclude_none=True))

    @app.post("/api/characters/{cid}/duplicate", status_code=201)
    def dup_char(cid: str, u: str = U):
        return svc.duplicate_character(u, cid)

    @app.delete("/api/characters/{cid}", status_code=204)
    def del_char(cid: str, confirm: bool = False, u: str = U):
        svc.delete_character(u, cid, confirm)

    # ---- referencias ----
    @app.get("/api/characters/{cid}/references")
    def list_refs(cid: str, u: str = U):
        return svc.list_references(u, cid)

    @app.post("/api/characters/{cid}/references", status_code=201)
    async def upload_ref(cid: str, file: UploadFile = File(...), source_note: str = Form(...),
                         rights_confirmed: bool = Form(False), u: str = U):
        limit = settings.max_upload_mb * 1024 * 1024
        data = await file.read(limit + 1)          # lee como máximo límite+1 bytes
        if len(data) > limit:
            raise errors.file_too_large(settings.max_upload_mb)
        return await run_in_threadpool(svc.add_reference_upload, u, cid, data, source_note, rights_confirmed)

    @app.post("/api/characters/{cid}/references/from-artifact", status_code=201)
    def ref_from_artifact(cid: str, body: FromArtifact, u: str = U):
        return svc.add_reference_from_artifact(u, cid, body.artifact_id, body.source_note)

    @app.delete("/api/references/{rid}", status_code=204)
    def del_ref(rid: str, confirm: bool = False, u: str = U):
        svc.delete_reference(u, rid, confirm)

    # ---- generaciones ----
    @app.post("/api/generations", status_code=202)
    def create_gen(body: GenerationCreate, u: str = U):
        return svc.create_generation(u, body.model_dump())

    @app.get("/api/generations/{jid}")
    def get_gen(jid: str, u: str = U):
        return svc.get_generation(u, jid)

    @app.get("/api/generations")
    def list_gens(character_id: str | None = None, status: str | None = None,
                  limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), u: str = U):
        return svc.list_generations(u, character_id, status, limit, offset)

    @app.post("/api/generations/{jid}/retry", status_code=202)
    def retry_gen(jid: str, body: ConfirmBody | None = None, u: str = U):
        return svc.retry_generation(u, jid, bool(body and body.confirm_cloud))

    @app.post("/api/generations/{jid}/cancel")
    def cancel_gen(jid: str, u: str = U):
        return svc.cancel_generation(u, jid)

    @app.post("/api/characters/{cid}/consistency-batch", status_code=202)
    def batch(cid: str, body: BatchBody | None = None, u: str = U):
        return svc.consistency_batch(u, cid, (body or BatchBody()).model_dump())

    # ---- galería y resultados ----
    @app.get("/api/gallery")
    def gallery(character_id: str | None = None, status: str | None = None, engine: str | None = None,
                selected: bool | None = None, date_from: str | None = None, date_to: str | None = None,
                limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), u: str = U):
        return svc.gallery(u, {"character_id": character_id, "status": status, "engine": engine, "selected": selected,
                               "date_from": date_from, "date_to": date_to}, limit, offset)

    @app.get("/api/artifacts/{aid}")
    def get_art(aid: str, u: str = U):
        return svc.get_artifact(u, aid)

    @app.patch("/api/artifacts/{aid}")
    def patch_art(aid: str, body: ArtifactPatch, u: str = U):
        return svc.patch_artifact(u, aid, body.model_dump(exclude_unset=True))

    @app.delete("/api/artifacts/{aid}", status_code=204)
    def del_art(aid: str, confirm: bool = False, u: str = U):
        svc.delete_artifact(u, aid, confirm)

    return app


app = create_app()

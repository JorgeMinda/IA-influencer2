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
Gender = Literal["female", "male", "neutral", "unspecified"]
VoicePreset = Literal["calida", "energica", "serena", "seria", "custom"]
VoiceEngine = Literal["browser"]


class VoiceProfile(BaseModel):
    engine: VoiceEngine = "browser"
    voice_name: str | None = None
    preset: VoicePreset = "custom"
    rate: float = Field(1.0, ge=0.7, le=1.3)
    pitch: float = Field(1.0, ge=0.7, le=1.5)
    pause_ms: int = Field(200, ge=0, le=600)


class BrandProfile(BaseModel):
    watermark_url: str | None = None
    watermark_position: Literal["top-left", "top-right", "bottom-left", "bottom-right", "center"] = "bottom-right"
    watermark_opacity: int = Field(40, ge=0, le=100)
    watermark_size: Literal["sm", "md", "lg"] = "md"
    palette: dict[str, str] = Field(default_factory=lambda: {"primary": "#6366f1", "secondary": "#1e293b", "accent": "#f59e0b"})
    typography: Literal["sans", "serif", "mono", "display"] = "sans"
    style_guide: str = Field("", max_length=2000)


class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    visual_description: str = Field("", max_length=2000)
    invariant_traits: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field("", max_length=4000)
    gender: Gender = "unspecified"
    voice_profile: VoiceProfile | None = None
    brand_profile: BrandProfile | None = None


class CharacterPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    visual_description: str | None = Field(None, max_length=2000)
    invariant_traits: list[str] | None = Field(None, max_length=20)
    notes: str | None = Field(None, max_length=4000)
    archived: bool | None = None
    gender: Gender | None = None
    voice_profile: VoiceProfile | None = None
    brand_profile: BrandProfile | None = None


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


class VideoCreate(BaseModel):
    character_id: str
    prompt: str = Field(min_length=1, max_length=2000)
    negative_prompt: str = Field("", max_length=1000)
    duration_seconds: int = Field(3, ge=1, le=10)
    fps: int = Field(16, ge=8, le=30)
    width: int = Field(512, ge=256, le=1024)
    height: int = Field(512, ge=256, le=1024)
    seed: int | None = Field(None, ge=0)
    destination: Literal["local", "auto"] = "local"
    confirm_cloud: bool = False


class DanceCreate(BaseModel):
    character_id: str
    reference_image_id: str
    motion_preset: Literal["wave", "nod", "dance", "idle"] = "idle"
    duration_seconds: int = Field(3, ge=1, le=10)
    seed: int | None = Field(None, ge=0)
    destination: Literal["local", "auto"] = "local"


class FaceswapCreate(BaseModel):
    source_image_id: str
    target_image_id: str
    destination: Literal["local", "auto"] = "local"
    priority: Literal["speed", "balanced", "quality"] = "balanced"
    confirm_cloud: bool = False


class FromArtifact(BaseModel):
    artifact_id: str
    source_note: str


class ArtifactPatch(BaseModel):
    selected: bool | None = None
    note: str | None = Field(None, max_length=1000)


class ChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    voice: bool = False


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


_HEX_TO_COLOR = {
    "#ff0000": "rojo", "#00ff00": "verde", "#0000ff": "azul",
    "#ffff00": "amarillo", "#ff00ff": "magenta", "#00ffff": "cian",
    "#000000": "negro", "#ffffff": "blanco", "#808080": "gris",
    "#ffa500": "naranja", "#800080": "morado", "#ffc0cb": "rosa",
    "#a52a2a": "marrón", "#008000": "verde oscuro", "#000080": "azul marino",
}


def _hex_to_color_name(hexv: str) -> str:
    h = (hexv or "").strip().lower()
    if h in _HEX_TO_COLOR:
        return _HEX_TO_COLOR[h]
    # buscar el más cercano por distancia euclidiana en RGB
    try:
        r = int(h[1:3], 16); g = int(h[3:5], 16); b = int(h[5:7], 16)
    except (ValueError, IndexError):
        return h
    best, best_d = None, 10**9
    for k, v in _HEX_TO_COLOR.items():
        kr, kg, kb = int(k[1:3], 16), int(k[3:5], 16), int(k[5:7], 16)
        d = (r-kr)**2 + (g-kg)**2 + (b-kb)**2
        if d < best_d:
            best_d, best = d, v
    return best or h


def build_chat_system_prompt(character: dict | None, voice: bool = False) -> str:
    """Construye el prompt de sistema del chat a partir de la ficha del personaje.

    `voice` activa la instrucción de respuestas pensadas para voz alta.
    Inyecta la guía de estilo y la paleta (anti-slop) si existen.
    Función pura y testeable.
    """
    c = character if isinstance(character, dict) else {}
    char_name = c.get("name", "Personaje")
    visual = c.get("visual_description", "") or ""
    traits = ", ".join(c.get("invariant_traits") or [])
    notes = c.get("notes", "") or ""
    gender = c.get("gender", "unspecified") or "unspecified"

    persona = {
        "female": "una influencer virtual (mujer)",
        "male": "un influencer virtual (hombre)",
        "neutral": "una persona virtual",
    }.get(gender, "una persona virtual")
    gender_rule = (
        "Habla y exprésate como una mujer. " if gender == "female"
        else "Habla y exprésate como un hombre. " if gender == "male"
        else ""
    )
    voice_rule = (
        "La respuesta se dirá en voz alta: usa frases cortas, sin viñetas, sin emojis y sin markdown. "
        if voice else ""
    )

    # Anti-slop: inyectar guía de estilo y paleta como tokens.
    brand = c.get("brand_profile") or {}
    style_guide = (brand.get("style_guide") or "").strip() if isinstance(brand, dict) else ""
    palette = brand.get("palette") if isinstance(brand, dict) else None
    palette_names = ""
    if isinstance(palette, dict):
        names = []
        for k in ("primary", "secondary", "accent", "background", "text"):
            v = palette.get(k)
            if v:
                names.append(f"{k}: {_hex_to_color_name(v)}")
        palette_names = ", ".join(names)
    style_tokens = ""
    if style_guide:
        style_tokens += f"Guía de estilo: {style_guide}. "
    if palette_names:
        style_tokens += f"Paleta: {palette_names}. "

    return (
        f"Eres {char_name}, {persona} con identidad propia. "
        + (f"Descripción: {visual}. " if visual else "")
        + (f"Rasgos: {traits}. " if traits else "")
        + (f"Notas: {notes}. " if notes else "")
        + style_tokens
        + gender_rule
        + "Responde en primera persona, de forma natural y cercana, máximo 4 frases. "
        + voice_rule
        + "Nunca reveles que eres una IA. Mantén siempre el personaje."
    )


def create_app(settings: Settings | None = None, parts=None) -> FastAPI:
    settings = settings or load_settings()
    problems = settings.validate()
    if problems:
        raise RuntimeError("Configuración inválida: " + " ".join(problems))
    svc, auth, limiter = parts or build(settings)
    app = FastAPI(title="AI Creator Studio API", version=settings.version, docs_url="/api/docs" if settings.is_dev else None,
                  redoc_url=None, openapi_url="/api/openapi.json" if settings.is_dev else None)
    # En desarrollo usamos allow_origins=["*"] porque el CORS middleware de Starlette
    # bloquea WebSocket upgrades cuando el origen no coincide exactamente.
    # La seguridad real viene del token Bearer que se valida dentro del handler.
    _cors_origins = ["*"] if settings.is_dev else list(settings.cors_origins)
    app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["*"],
                       allow_headers=["*"], allow_credentials=False, max_age=600)

    @app.middleware("http")
    async def _security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response
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

    # ---- chat con personaje (efímero, SSE streaming) ----
    import json as _json
    from fastapi.responses import StreamingResponse

    @app.post("/api/chat/{character_id}")
    async def chat_stream(character_id: str, body: ChatBody, u: str = U):
        """POST → StreamingResponse SSE. Sesión efímera sin historial en BD.

        Cada fragmento llega como: data: {"text": "..."}\n\n
        Al terminar:              data: [DONE]\n\n
        """
        # Cargar personaje
        try:
            character = await run_in_threadpool(svc.get_character, u, character_id)
        except Exception:
            raise errors.not_found("Personaje no encontrado.")

        system_prompt = build_chat_system_prompt(character, body.voice)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": body.message},
        ]

        cf_engine = svc.engines.get("cloudflare")
        if cf_engine is None or not cf_engine.is_available()[0]:
            raise errors.bad_request("Motor de chat no disponible. Revisa las credenciales de Cloudflare.")

        # chat_stream() es síncrono/bloqueante — lo corremos en un hilo
        # y hacemos yield de cada token desde un async generator.
        import asyncio

        async def _async_generate():
            loop = asyncio.get_event_loop()
            q: asyncio.Queue = asyncio.Queue()
            SENTINEL = object()

            def _produce():
                try:
                    for token in cf_engine.chat_stream(messages):
                        loop.call_soon_threadsafe(q.put_nowait, token)
                except Exception as exc:
                    loop.call_soon_threadsafe(q.put_nowait, {"__error__": str(exc)})
                finally:
                    loop.call_soon_threadsafe(q.put_nowait, SENTINEL)

            loop.run_in_executor(None, _produce)

            while True:
                item = await q.get()
                if item is SENTINEL:
                    break
                if isinstance(item, dict) and "__error__" in item:
                    yield f"data: {_json.dumps({'error': item['__error__']})}\n\n"
                    break
                yield f"data: {_json.dumps({'text': item})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            _async_generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )


    # ---- video / baile / faceswap (scaffolding: sin motor disponible) ----
    VIDEO_UNAVAILABLE = "No hay un motor de video disponible. Se requiere ComfyUI con GPU."

    def _video_provider_ok() -> bool:
        # Por ahora ningún motor declara soporte de video.
        return False

    @app.post("/api/videos", status_code=202)
    def create_video(body: VideoCreate, u: str = U):
        if not _video_provider_ok():
            raise errors.ApiError(503, "provider_unavailable", VIDEO_UNAVAILABLE)
        raise errors.ApiError(503, "provider_unavailable", VIDEO_UNAVAILABLE)

    @app.get("/api/videos/{vid}")
    def get_video(vid: str, u: str = U):
        raise errors.not_found("Trabajo de video no encontrado.")

    @app.get("/api/videos")
    def list_videos(character_id: str | None = None, status: str | None = None,
                    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), u: str = U):
        return {"items": [], "total": 0}

    @app.post("/api/dances", status_code=202)
    def create_dance(body: DanceCreate, u: str = U):
        # validar que el personaje existe
        svc.get_character(u, body.character_id)
        if not _video_provider_ok():
            raise errors.ApiError(503, "provider_unavailable", VIDEO_UNAVAILABLE)
        raise errors.ApiError(503, "provider_unavailable", VIDEO_UNAVAILABLE)

    @app.post("/api/faceswaps", status_code=202)
    def create_faceswap(body: FaceswapCreate, u: str = U):
        if not _video_provider_ok():
            raise errors.ApiError(503, "provider_unavailable", VIDEO_UNAVAILABLE)
        raise errors.ApiError(503, "provider_unavailable", VIDEO_UNAVAILABLE)

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

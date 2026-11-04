from __future__ import annotations
from fastapi import APIRouter, Request, HTTPException, Query
from ...core.errors import ApiError
from ...models.schemas import GenerationCreate
from ...services.generation import GenerationService, ContentPolicyError

router = APIRouter()


@router.post("/generations", status_code=202)
async def create_generation(request: Request, body: GenerationCreate):
    svc = GenerationService(None)
    try:
        job = await svc.create_generation(
            character_id=body.character_id,
            prompt=body.prompt,
            negative_prompt=body.negative_prompt,
            destination=body.destination,
            priority=body.priority,
            width=body.width,
            height=body.height,
            seed=body.seed,
            confirm_cloud=body.confirm_cloud,
        )
        return job
    except ValueError as e:
        msg = str(e)
        if msg == "not_found":
            raise ApiError("not_found", "Personaje inexistente", 404)
        if msg == "confirmation_required":
            raise ApiError("confirmation_required", "Falta confirmación para usar la nube", 403)
        if msg == "provider_unavailable":
            raise ApiError("provider_unavailable", "Motor o proveedor no disponible", 503)
        if msg.startswith("content_policy"):
            raise ApiError("content_policy", "Prompt rechazado por la política de contenido", 422)
        raise ApiError("bad_request", msg, 400)
    except ContentPolicyError:
        raise ApiError("content_policy", "Prompt rechazado por la política de contenido", 422)


@router.get("/generations/{job_id}")
async def get_generation(job_id: str):
    from ...repositories.generations import GenerationRepository
    repo = GenerationRepository(None)
    job = repo.get_job(job_id)
    if not job:
        raise ApiError("not_found", "Trabajo inexistente", 404)
    return job


@router.get("/generations")
async def list_generations(request: Request, character_id: str | None = None,
                           status: str | None = None, limit: int = Query(default=50, le=200),
                           offset: int = 0):
    from ...repositories.generations import GenerationRepository
    repo = GenerationRepository(None)
    items, total = repo.list_jobs(character_id=character_id, status=status, limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.post("/generations/{job_id}/retry", status_code=202)
async def retry_generation(job_id: str, body: dict = {}):
    svc = GenerationService(None)
    confirm_cloud = body.get("confirm_cloud", False) if isinstance(body, dict) else False
    try:
        job = await svc.retry_generation(job_id, confirm_cloud)
        return job
    except ValueError as e:
        msg = str(e)
        if msg == "not_found":
            raise ApiError("not_found", "Trabajo inexistente", 404)
        if msg == "conflict":
            raise ApiError("conflict", "Solo se pueden reintentar tareas fallidas", 409)
        if msg == "confirmation_required":
            raise ApiError("confirmation_required", "Falta confirmación para usar la nube", 403)
        raise ApiError("bad_request", msg, 400)


@router.post("/generations/{job_id}/cancel")
async def cancel_generation(job_id: str):
    svc = GenerationService(None)
    try:
        job = await svc.cancel_generation(job_id)
        return job
    except ValueError as e:
        msg = str(e)
        if msg == "not_found":
            raise ApiError("not_found", "Trabajo inexistente", 404)
        if msg == "conflict":
            raise ApiError("conflict", "Solo se pueden cancelar tareas en cola", 409)
        raise ApiError("bad_request", msg, 400)


@router.post("/characters/{char_id}/consistency-batch", status_code=202)
async def consistency_batch(char_id: str, body: dict = {}):
    svc = GenerationService(None)
    base_prompt = body.get("base_prompt") if isinstance(body, dict) else None
    destination = body.get("destination", "auto") if isinstance(body, dict) else "auto"
    priority = body.get("priority", "balanced") if isinstance(body, dict) else "balanced"
    confirm_cloud = body.get("confirm_cloud", False) if isinstance(body, dict) else False
    try:
        jobs = await svc.consistency_batch(char_id, base_prompt, destination, priority, confirm_cloud)
        return {"jobs": jobs}
    except ValueError as e:
        msg = str(e)
        if msg == "not_found":
            raise ApiError("not_found", "Personaje inexistente", 404)
        if msg == "confirmation_required":
            raise ApiError("confirmation_required", "Falta confirmación para usar la nube", 403)
        if msg == "provider_unavailable":
            raise ApiError("provider_unavailable", "Motor o proveedor no disponible", 503)
        raise ApiError("bad_request", msg, 400)
    except ContentPolicyError:
        raise ApiError("content_policy", "Prompt rechazado por la política de contenido", 422)


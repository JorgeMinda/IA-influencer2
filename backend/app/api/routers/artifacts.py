from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from ...core.errors import ApiError
from ...repositories.generations import GenerationRepository
from ...core.config import settings
from pathlib import Path

router = APIRouter()


@router.get("/artifacts/{artifact_id}")
async def get_artifact(artifact_id: str):
    repo = GenerationRepository(None)
    art = repo.get_artifact(artifact_id)
    if not art:
        raise ApiError("not_found", "Artefacto inexistente", 404)
    return art


@router.patch("/artifacts/{artifact_id}")
async def update_artifact(artifact_id: str, body: dict):
    repo = GenerationRepository(None)
    selected = body.get("selected")
    note = body.get("note")
    art = repo.update_artifact(artifact_id, selected=selected, note=note)
    if not art:
        raise ApiError("not_found", "Artefacto inexistente", 404)
    return art


@router.delete("/artifacts/{artifact_id}", status_code=204)
async def delete_artifact(artifact_id: str, confirm: bool = False):
    if not confirm:
        raise ApiError("confirmation_required", "Falta confirmación", 403)
    repo = GenerationRepository(None)
    ok, img_path, thumb_path = repo.delete_artifact(artifact_id)
    if not ok:
        raise ApiError("not_found", "Artefacto inexistente", 404)
    for p in [img_path, thumb_path]:
        if p:
            full = Path(p)
            if full.exists():
                full.unlink()
    return None


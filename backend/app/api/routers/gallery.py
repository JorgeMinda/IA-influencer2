from __future__ import annotations
from fastapi import APIRouter, Query
from ...repositories.generations import GenerationRepository

router = APIRouter()


@router.get("/gallery")
async def list_gallery(character_id: str | None = None, status: str | None = None,
                       engine: str | None = None, selected: bool | None = None,
                       date_from: str | None = None, date_to: str | None = None,
                       limit: int = Query(default=50, le=200), offset: int = 0):
    repo = GenerationRepository(None)
    items, total = repo.list_gallery(
        character_id=character_id, status=status, engine=engine, selected=selected,
        date_from=date_from, date_to=date_to, limit=limit, offset=offset,
    )
    return {"items": items, "total": total}


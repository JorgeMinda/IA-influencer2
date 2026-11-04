from __future__ import annotations
from fastapi import APIRouter, Request, HTTPException, Query
from ...core.auth import get_current_user_id
from ...core.errors import ApiError
from ...models.schemas import CharacterCreate, CharacterPatch, CharacterOut
from ...repositories.characters import CharacterRepository

router = APIRouter()


def _char_repo(request: Request) -> CharacterRepository:
    import asyncio
    # sync wrapper
    return CharacterRepository(None)


@router.get("/characters")
async def list_characters(request: Request, q: str = "", include_archived: bool = False,
                          limit: int = Query(default=50, le=200), offset: int = 0):
    repo = CharacterRepository(None)
    items, total = repo.list(q=q or None, include_archived=include_archived, limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.post("/characters", status_code=201)
async def create_character(request: Request, body: CharacterCreate):
    repo = CharacterRepository(None)
    char = repo.create(body)
    return char


@router.get("/characters/{char_id}")
async def get_character(char_id: str):
    repo = CharacterRepository(None)
    char = repo.get(char_id)
    if not char:
        raise HTTPException(status_code=404, detail="not_found")
    return char


@router.patch("/characters/{char_id}")
async def update_character(char_id: str, body: CharacterPatch):
    repo = CharacterRepository(None)
    char = repo.update(char_id, body)
    if not char:
        raise HTTPException(status_code=404, detail="not_found")
    return char


@router.post("/characters/{char_id}/duplicate", status_code=201)
async def duplicate_character(char_id: str):
    repo = CharacterRepository(None)
    char = repo.duplicate(char_id)
    if not char:
        raise HTTPException(status_code=404, detail="not_found")
    return char


@router.delete("/characters/{char_id}", status_code=204)
async def delete_character(char_id: str, confirm: bool = False):
    if not confirm:
        raise HTTPException(status_code=403, detail="confirmation_required")
    repo = CharacterRepository(None)
    ok = repo.delete(char_id)
    if not ok:
        raise HTTPException(status_code=404, detail="not_found")
    return None


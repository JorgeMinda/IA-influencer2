from __future__ import annotations
from fastapi import APIRouter, Request
from ...core.config import settings
from ...core.database import _now
from ...models.schemas import HealthStatus

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "version": settings.app_version, "time": _now()}


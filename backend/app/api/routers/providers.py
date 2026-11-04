from __future__ import annotations
from fastapi import APIRouter
from ...core.config import settings
from ...models.schemas import ProvidersStatus, LocalStatus, CloudStatus, MockStatus, LimitsStatus

router = APIRouter()


@router.get("/providers/status")
async def providers_status():
    local_available = settings.comfyui_enabled
    return {
        "local": {
            "enabled": settings.comfyui_enabled,
            "available": local_available,
            "detail": "ComfyUI local" if settings.comfyui_enabled else "Motor local desactivado",
        },
        "cloud": {
            "enabled": settings.cloud_enabled,
            "provider": settings.cloud_provider,
            "configured": bool(settings.cloud_api_key),
            "detail": "Proveedor configurado" if settings.cloud_api_key else "Sin proveedor configurado",
        },
        "mock": {
            "enabled": True,
            "detail": "Motor simulado para desarrollo",
        },
        "limits": {
            "max_upload_mb": settings.max_upload_mb,
            "max_concurrent_jobs": settings.max_concurrent_jobs,
            "rate_limit_per_minute": settings.rate_limit_per_minute,
        },
    }


"""Reglas de enrutamiento del contrato (1–5). Función pura, sin red."""
from __future__ import annotations

from app.core import errors


def resolve_destination(requested: str, *, confirm_cloud: bool, local_available: bool,
                        cloud_configured: bool, allow_cloud_auto: bool) -> str:
    if requested == "local":
        if not local_available:
            raise errors.provider_unavailable("El motor local no está habilitado o disponible.")
        return "local"
    if requested == "cloud":
        if not cloud_configured:
            raise errors.provider_unavailable("La nube no está habilitada o configurada.")
        if not confirm_cloud:
            raise errors.confirmation_required("Enviar a la nube requiere confirmación explícita (confirm_cloud).")
        return "cloud"
    if requested == "mock":
        return "mock"
    if requested == "auto":
        if local_available:
            return "local"
        if cloud_configured and allow_cloud_auto:
            return "cloud"
        return "mock"
    raise errors.validation("Destino no válido.", [{"field": "destination", "reason": "usa auto, local, cloud o mock"}])

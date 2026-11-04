"""Errores de la API con el formato del contrato: {error:{code,message,details}}."""
from __future__ import annotations

from typing import Any


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: list[Any] | None = None,
                 headers: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or []
        self.headers = headers or {}

    def body(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "details": self.details}}


def bad_request(msg: str) -> ApiError: return ApiError(400, "bad_request", msg)
def unauthorized(msg: str = "Sesión no válida o caducada.") -> ApiError: return ApiError(401, "unauthorized", msg)
def confirmation_required(msg: str) -> ApiError: return ApiError(403, "confirmation_required", msg)
def not_found(msg: str = "Recurso no encontrado.") -> ApiError: return ApiError(404, "not_found", msg)
def conflict(msg: str) -> ApiError: return ApiError(409, "conflict", msg)
def file_too_large(mb: int) -> ApiError: return ApiError(413, "file_too_large", f"El archivo supera el máximo de {mb} MB.")
def unsupported_media(msg: str = "Tipo de archivo no permitido. Usa PNG, JPEG o WebP.") -> ApiError:
    return ApiError(415, "unsupported_media_type", msg)
def validation(msg: str, details: list[Any] | None = None) -> ApiError: return ApiError(422, "validation_error", msg, details)
def content_policy() -> ApiError:
    return ApiError(422, "content_policy", "El texto no cumple la política de contenido.")
def rate_limited(retry_after: int) -> ApiError:
    return ApiError(429, "rate_limited", "Demasiadas peticiones. Intenta de nuevo en unos segundos.",
                    headers={"Retry-After": str(retry_after)})
def quota_exceeded() -> ApiError:
    return ApiError(429, "quota_exceeded", "Se agotó la cuota diaria de generaciones en la nube.")
def provider_error(msg: str = "El motor de generación falló.") -> ApiError: return ApiError(502, "provider_error", msg)
def provider_unavailable(msg: str) -> ApiError: return ApiError(503, "provider_unavailable", msg)
def internal() -> ApiError: return ApiError(500, "internal_error", "Error interno. Inténtalo de nuevo más tarde.")

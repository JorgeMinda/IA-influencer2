from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class EngineTransientError(Exception):
    """Fallo que puede resolverse reintentando (solo se reintenta en local/mock)."""


class EngineError(Exception):
    """Fallo definitivo. El mensaje debe ser seguro (sin claves ni rutas)."""


@dataclass
class GenRequest:
    prompt: str
    negative_prompt: str
    seed: int
    width: int
    height: int
    priority: str = "balanced"
    references: list[bytes] = field(default_factory=list)


@dataclass
class EngineResult:
    images: list[bytes]            # PNG/JPEG/WebP en bytes
    model: str
    workflow_version: str = "1"
    provider_job_id: str | None = None
    params: dict = field(default_factory=dict)


class ImageEngine(Protocol):
    name: str
    supports_references: bool

    def is_available(self) -> tuple[bool, str]: ...
    def generate(self, req: GenRequest) -> EngineResult: ...

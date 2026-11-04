from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator


# --- Character ---

class CharacterCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    visual_description: str = Field(default="", max_length=2000)
    invariant_traits: list[str] = Field(default_factory=list, max_length=20)
    notes: str = Field(default="", max_length=4000)

    @field_validator("invariant_traits")
    @classmethod
    def validate_traits(cls, v):
        for t in v:
            if not (1 <= len(t) <= 120):
                raise ValueError("Cada rasgo debe tener entre 1 y 120 caracteres")
        return v


class CharacterPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    visual_description: str | None = Field(default=None, max_length=2000)
    invariant_traits: list[str] | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)
    archived: bool | None = None

    @field_validator("invariant_traits")
    @classmethod
    def validate_traits(cls, v):
        if v is None:
            return v
        for t in v:
            if not (1 <= len(t) <= 120):
                raise ValueError("Cada rasgo debe tener entre 1 y 120 caracteres")
        return v


class CharacterOut(BaseModel):
    id: str
    user_id: str | None = None
    name: str
    visual_description: str
    invariant_traits: list[str]
    notes: str
    archived: bool
    reference_count: int = 0
    created_at: str
    updated_at: str


# --- Reference Image ---

class ReferenceCreate(BaseModel):
    source_note: str = Field(..., min_length=3, max_length=500)
    rights_confirmed: bool = False


class ReferenceOut(BaseModel):
    id: str
    character_id: str
    url: str
    thumbnail_url: str
    width: int
    height: int
    source_note: str
    rights_confirmed: bool
    origin_artifact_id: str | None = None
    created_at: str


# --- Generation ---

Priority = Literal["speed", "balanced", "quality"]
Destination = Literal["auto", "local", "cloud", "mock"]
JobStatus = Literal["pending", "processing", "completed", "failed", "cancelled"]
UsedDestination = Literal["local", "cloud", "mock"]


class GenerationCreate(BaseModel):
    character_id: str
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: str = Field(default="", max_length=1000)
    destination: Destination = "auto"
    priority: Priority = "balanced"
    width: int = Field(default=768, ge=256, le=1536)
    height: int = Field(default=768, ge=256, le=1536)
    seed: int | None = Field(default=None, ge=0)
    confirm_cloud: bool = False

    @field_validator("width", "height")
    @classmethod
    def multiple_of_64(cls, v):
        if v % 64 != 0:
            raise ValueError("Debe ser múltiplo de 64")
        return v


class GenerationOut(BaseModel):
    id: str
    user_id: str | None = None
    character_id: str
    prompt: str
    negative_prompt: str
    seed: int
    width: int
    height: int
    priority: Priority
    destination_requested: Destination
    destination_used: UsedDestination | None = None
    engine: str
    model: str
    workflow_version: str
    status: JobStatus
    error_code: str | None = None
    error_message: str | None = None
    attempts: int = 1
    retry_of: str | None = None
    provider_job_id: str | None = None
    artifacts: list["ArtifactOut"] = []
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None


# --- Artifact ---

class ArtifactMetadata(BaseModel):
    prompt: str
    negative_prompt: str
    seed: int
    model: str
    engine: str
    workflow_version: str
    params: dict = Field(default_factory=dict)


class ArtifactOut(BaseModel):
    id: str
    job_id: str
    character_id: str
    image_url: str
    thumbnail_url: str
    width: int
    height: int
    selected: bool = False
    note: str = ""
    metadata: ArtifactMetadata
    created_at: str


class ArtifactPatch(BaseModel):
    selected: bool | None = None
    note: str | None = Field(default=None, max_length=1000)


# --- Gallery ---

class GalleryItemOut(ArtifactOut):
    character_name: str
    engine: str
    destination_used: UsedDestination | None = None
    job_status: JobStatus
    job_created_at: str


# --- Providers ---

class LocalStatus(BaseModel):
    enabled: bool
    available: bool
    detail: str


class CloudStatus(BaseModel):
    enabled: bool
    provider: str
    configured: bool
    detail: str


class MockStatus(BaseModel):
    enabled: bool
    detail: str


class LimitsStatus(BaseModel):
    max_upload_mb: int
    max_concurrent_jobs: int
    rate_limit_per_minute: int


class ProvidersStatus(BaseModel):
    local: LocalStatus
    cloud: CloudStatus
    mock: MockStatus
    limits: LimitsStatus


# --- Health ---

class HealthStatus(BaseModel):
    status: str
    version: str
    time: str


# --- Pagination ---

class Paginated(BaseModel):
    items: list
    total: int


# --- Error ---

class ErrorBody(BaseModel):
    error: dict


GenerationOut.model_rebuild()

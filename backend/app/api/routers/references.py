from __future__ import annotations
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, Query, UploadFile, File, Form
from PIL import Image
import io
from ...core.config import settings
from ...core.errors import ApiError
from ...core.database import new_id, _now
from ...models.schemas import ReferenceCreate
from ...repositories.references import ReferenceRepository
from ...repositories.characters import CharacterRepository

router = APIRouter()

ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}


def _validate_and_process_image(file_bytes: bytes, max_mb: int) -> tuple[Image.Image, int, int]:
    if len(file_bytes) > max_mb * 1024 * 1024:
        raise ApiError("file_too_large", f"Archivo supera {max_mb} MB", 413)
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()
        img = Image.open(io.BytesIO(file_bytes))
    except Exception:
        raise ApiError("unsupported_media_type", "Tipo de archivo no permitido", 415)
    if img.format not in ("PNG", "JPEG", "WEBP"):
        raise ApiError("unsupported_media_type", "Tipo de archivo no permitido", 415)
    if img.width > 8192 or img.height > 8192:
        raise ApiError("validation_error", "Dimensiones máximas 8192 px", 422)
    # Re-encode to strip EXIF
    clean = Image.new("RGB", img.size)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGBA")
        clean = Image.new("RGBA", img.size)
    clean.paste(img, (0, 0), img if img.mode == "RGBA" else None)
    return clean, img.width, img.height


@router.get("/characters/{char_id}/references")
async def list_references(char_id: str, limit: int = Query(default=50, le=200), offset: int = 0):
    repo = ReferenceRepository(None)
    items, total = repo.list_by_character(char_id, limit=limit, offset=offset)
    return {"items": items, "total": total}


@router.post("/characters/{char_id}/references", status_code=201)
async def upload_reference(
    char_id: str,
    file: UploadFile,
    source_note: str = Form(...),
    rights_confirmed: str = Form(...),
):
    # Validate character exists
    char_repo = CharacterRepository(None)
    char = char_repo.get(char_id)
    if not char:
        raise ApiError("not_found", "Personaje inexistente", 404)

    # Validate source_note
    note = source_note.strip()
    if len(note) < 3 or len(note) > 500:
        raise ApiError("validation_error", "La nota de procedencia debe tener entre 3 y 500 caracteres", 422,
                       [{"field": "source_note", "reason": "longitud inválida"}])

    # Validate rights_confirmed
    if rights_confirmed.lower() not in ("true", "1", "yes"):
        raise ApiError("confirmation_required", "Debes confirmar los derechos de uso", 403)

    # Read file
    file_bytes = await file.read()

    # Validate content type
    if file.content_type not in ALLOWED_TYPES:
        raise ApiError("unsupported_media_type", "Tipo de archivo no permitido", 415)

    # Validate and process
    img, width, height = _validate_and_process_image(file_bytes, settings.max_upload_mb)

    # Save files
    settings.data_path.mkdir(parents=True, exist_ok=True)
    ref_dir = settings.data_path / "references"
    thumb_dir = settings.data_path / "thumbnails"
    ref_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    ref_id = new_id()
    ref_filename = f"{ref_id}.png"
    thumb_filename = f"{ref_id}.jpg"

    # Save full image
    img_path = ref_dir / ref_filename
    img.save(img_path, format="PNG")

    # Save thumbnail
    thumb = img.copy()
    thumb.thumbnail((256, 256))
    thumb_path = thumb_dir / thumb_filename
    thumb.save(thumb_path, format="JPEG", quality=85)

    # Create DB record
    repo = ReferenceRepository(None)
    ref = repo.create(
        character_id=char_id,
        storage_path=f"references/{ref_filename}",
        thumbnail_path=f"thumbnails/{thumb_filename}",
        width=width,
        height=height,
        source_note=note,
        rights_confirmed=True,
    )
    return ref


@router.post("/characters/{char_id}/references/from-artifact", status_code=201)
async def reference_from_artifact(char_id: str, body: dict):
    artifact_id = body.get("artifact_id")
    source_note = body.get("source_note", "").strip()
    if not artifact_id:
        raise ApiError("validation_error", "Falta artifact_id", 422)
    if len(source_note) < 3 or len(source_note) > 500:
        raise ApiError("validation_error", "La nota debe tener entre 3 y 500 caracteres", 422)

    from ...repositories.generations import GenerationRepository
    gen_repo = GenerationRepository(None)
    artifact = gen_repo.get_artifact(artifact_id)
    if not artifact:
        raise ApiError("not_found", "Artefacto inexistente", 404)

    char_repo = CharacterRepository(None)
    if not char_repo.get(char_id):
        raise ApiError("not_found", "Personaje inexistente", 404)

    # Copy file
    import shutil
    ref_dir = settings.data_path / "references"
    thumb_dir = settings.data_path / "thumbnails"
    ref_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    ref_id = new_id()
    src_img = Path(artifact["image_path"] if "image_path" in artifact else "")
    # artifact has image_url (signed), but we need the raw path. Let's look up from DB.
    from ...core.database import get_db
    conn = get_db()
    row = conn.execute("SELECT image_path, thumbnail_path, width, height FROM generation_artifacts WHERE id = ?", (artifact_id,)).fetchone()
    conn.close()
    if not row:
        raise ApiError("not_found", "Artefacto inexistente", 404)

    ref_filename = f"{ref_id}.png"
    thumb_filename = f"{ref_id}.jpg"
    shutil.copy2(row["image_path"], ref_dir / ref_filename)
    shutil.copy2(row["thumbnail_path"], thumb_dir / thumb_filename)

    repo = ReferenceRepository(None)
    ref = repo.create(
        character_id=char_id,
        storage_path=f"references/{ref_filename}",
        thumbnail_path=f"thumbnails/{thumb_filename}",
        width=row["width"],
        height=row["height"],
        source_note=source_note,
        rights_confirmed=True,
        origin_artifact_id=artifact_id,
    )
    return ref


@router.delete("/references/{ref_id}", status_code=204)
async def delete_reference(ref_id: str, confirm: bool = False):
    if not confirm:
        raise ApiError("confirmation_required", "Falta confirmación", 403)
    repo = ReferenceRepository(None)
    ok, storage_path, thumbnail_path = repo.delete(ref_id)
    if not ok:
        raise ApiError("not_found", "Referencia inexistente", 404)
    # Delete files
    for p in [storage_path, thumbnail_path]:
        if p:
            full = settings.data_path / p
            if full.exists():
                full.unlink()
    return None


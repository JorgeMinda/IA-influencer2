from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from ...core.config import settings
from ...core.auth import verify_file_signature

router = APIRouter()

ALLOWED_KINDS = {"references", "outputs", "thumbnails"}


@router.get("/files/{kind}/{filename}")
async def serve_file(kind: str, filename: str, exp: str = Query(...), sig: str = Query(...)):
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=404, detail="not_found")
    # Prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=404, detail="not_found")
    if Path(filename).is_absolute():
        raise HTTPException(status_code=404, detail="not_found")

    path = f"/api/files/{kind}/{filename}"
    if not verify_file_signature(path, exp, sig):
        raise HTTPException(status_code=403, detail="forbidden")

    file_path = settings.data_path / kind / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="not_found")

    # Determine content type
    suffix = file_path.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    media_type = media_types.get(suffix, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


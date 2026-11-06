"""Validación y reencode de imágenes (subidas y resultados). Elimina EXIF al reguardar."""
from __future__ import annotations

import io
import uuid
from dataclasses import dataclass

from PIL import Image, UnidentifiedImageError

from app.core import errors

MAX_DIM = 4096
MAX_MEGAPIXELS = 25
Image.MAX_IMAGE_PIXELS = MAX_MEGAPIXELS * 1024 * 1024
ALLOWED = {"PNG", "JPEG", "WEBP"}
THUMB_MAX = 256


@dataclass
class ProcessedImage:
    png: bytes
    thumb_jpg: bytes
    width: int
    height: int


def process_image(data: bytes, max_mb: int) -> ProcessedImage:
    if len(data) > max_mb * 1024 * 1024:
        raise errors.file_too_large(max_mb)
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        w, h = probe.size           # solo cabecera: no decodifica todavía
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise errors.unsupported_media("El archivo no es una imagen válida.") from None
    if fmt not in ALLOWED:
        raise errors.unsupported_media()
    if w > MAX_DIM or h > MAX_DIM or w < 1 or h < 1:
        raise errors.validation(f"Las dimensiones máximas son {MAX_DIM}×{MAX_DIM} px.",
                                [{"field": "file", "reason": "dimensiones excesivas"}])
    if w * h > MAX_MEGAPIXELS * 1_000_000:
        raise errors.validation(f"La imagen supera {MAX_MEGAPIXELS} megapíxeles.",
                                [{"field": "file", "reason": "demasiados megapíxeles"}])
    try:
        img = Image.open(io.BytesIO(data)); img.load()
    except (OSError, Image.DecompressionBombError):
        raise errors.unsupported_media("La imagen está dañada.") from None
    img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    clean = Image.new(img.mode, img.size); clean.paste(img)   # sin EXIF ni perfiles
    out = io.BytesIO(); clean.save(out, "PNG")
    thumb = clean.convert("RGB"); thumb.thumbnail((THUMB_MAX, THUMB_MAX))
    tb = io.BytesIO(); thumb.save(tb, "JPEG", quality=82)
    return ProcessedImage(png=out.getvalue(), thumb_jpg=tb.getvalue(), width=w, height=h)


def new_id() -> str:
    return str(uuid.uuid4())

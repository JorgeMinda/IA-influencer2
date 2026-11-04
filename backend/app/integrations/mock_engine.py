from __future__ import annotations
import io
import hashlib
import random
from PIL import Image, ImageDraw, ImageFont
from ..core.config import settings


class MockEngine:
    name = "mock"

    def is_available(self) -> tuple[bool, str]:
        return True, "Motor simulado para desarrollo"

    def generate(self, prompt: str, width: int, height: int, seed: int) -> list[tuple[bytes, bytes, int, int]]:
        """Genera una imagen simulada. Devuelve lista de (image_bytes, thumbnail_bytes, width, height)."""
        # Deterministic color from seed
        rng = random.Random(seed)
        r = rng.randint(60, 200)
        g = rng.randint(60, 200)
        b = rng.randint(60, 200)

        img = Image.new("RGB", (width, height), (r, g, b))
        draw = ImageDraw.Draw(img)

        # Draw some shapes
        for _ in range(5):
            x1 = rng.randint(0, width - 1)
            y1 = rng.randint(0, height - 1)
            x2 = rng.randint(x1, width)
            y2 = rng.randint(y1, height)
            color = (rng.randint(0, 255), rng.randint(0, 255), rng.randint(0, 255))
            draw.ellipse([x1, y1, x2, y2], fill=color, outline=(255, 255, 255))

        # Text overlay
        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except Exception:
            font = ImageFont.load_default()
        draw.text((10, 10), "SIMULADO", fill=(255, 255, 255), font=font)
        draw.text((10, height - 30), prompt[:60], fill=(255, 255, 255), font=font)

        # Image bytes
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        image_bytes = buf.getvalue()

        # Thumbnail
        thumb = img.copy()
        thumb.thumbnail((256, 256))
        tbuf = io.BytesIO()
        thumb.save(tbuf, format="JPEG", quality=85)
        thumb_bytes = tbuf.getvalue()

        return [(image_bytes, thumb_bytes, width, height)]

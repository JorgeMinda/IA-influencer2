"""Motor simulado: imagen determinista (semilla + prompt) marcada «SIMULADO». Sin red ni GPU."""
from __future__ import annotations

import hashlib
import io

from PIL import Image, ImageDraw

from app.engines.base import EngineResult, GenRequest


class MockEngine:
    name = "mock"
    supports_references = False

    def is_available(self) -> tuple[bool, str]:
        return True, "Motor simulado para desarrollo"

    def generate(self, req: GenRequest) -> EngineResult:
        digest = hashlib.sha256(f"{req.seed}|{req.prompt}|{req.negative_prompt}".encode()).digest()
        c1 = tuple(digest[0:3]); c2 = tuple(digest[3:6])
        img = Image.new("RGB", (req.width, req.height), c1)
        px = ImageDraw.Draw(img)
        # degradado vertical determinista
        for y in range(req.height):
            t = y / max(1, req.height - 1)
            color = tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3))
            px.line([(0, y), (req.width, y)], fill=color)
        px.rectangle([8, 8, req.width - 9, req.height - 9], outline=(255, 255, 255), width=3)
        px.text((20, 20), "SIMULADO", fill=(255, 255, 255))
        px.text((20, 40), f"seed {req.seed}", fill=(255, 255, 255))
        px.text((20, 60), req.prompt[:60], fill=(255, 255, 255))
        buf = io.BytesIO(); img.save(buf, "PNG")
        return EngineResult(images=[buf.getvalue()], model="simulado-v1", workflow_version="1",
                            params={"references_sent": False})

import io
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.engines.cloudflare import CloudflareEngine
from app.engines.comfyui import ComfyUIEngine
from app.engines.mock import MockEngine
from app.repositories.memory import MemoryBlobs, MemoryStore
from app.services.studio import InlineExecutor, StudioService

U1 = "11111111-1111-1111-1111-111111111111"
U2 = "22222222-2222-2222-2222-222222222222"


def png_bytes(size=(64, 64), color=(200, 30, 30), fmt="PNG"):
    b = io.BytesIO(); Image.new("RGB", size, color).save(b, fmt); return b.getvalue()


def make_service(**over):
    s = Settings(**over)
    engines = {"mock": MockEngine(),
               "cloudflare": CloudflareEngine(s.cloudflare_account_id, s.cloudflare_api_token, s.cloud_enabled),
               "comfyui": ComfyUIEngine(s.comfyui_enabled, s.comfyui_url, "no/existe.json")}
    return StudioService(s, MemoryStore(), MemoryBlobs(), engines, InlineExecutor())


@pytest.fixture
def svc():
    return make_service()

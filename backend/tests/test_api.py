import pytest
from fastapi.testclient import TestClient

from app.core.auth import RateLimiter, SupabaseAuth
from app.core.config import Settings
from app.engines.mock import MockEngine
from app.main import create_app
from app.repositories.memory import MemoryBlobs, MemoryStore
from app.services.studio import StudioService

# Usamos Settings de desarrollo para test_api (almacén en memoria, DevAuth y Cloudflare configurado)
test_settings = Settings(
    env="development",
    supabase_url="",
    cloud_enabled=True,
    cloudflare_account_id="test_account",
    cloudflare_api_token="test_token",
)
app = create_app(test_settings)
client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "time" in data


def test_providers_status():
    r = client.get("/api/providers/status")
    assert r.status_code == 200
    data = r.json()
    assert "local" in data
    assert "cloud" in data
    assert "mock" in data
    assert "limits" in data
    assert data["mock"]["enabled"] is True


def test_create_and_get_character():
    r = client.post("/api/characters", json={"name": "Test Char", "visual_description": "desc"})
    assert r.status_code == 201
    char = r.json()
    assert char["name"] == "Test Char"
    assert char["id"]

    r2 = client.get(f"/api/characters/{char['id']}")
    assert r2.status_code == 200
    assert r2.json()["name"] == "Test Char"


def test_character_validation():
    r = client.post("/api/characters", json={"name": ""})
    assert r.status_code == 422


def test_character_gender():
    r = client.post("/api/characters", json={"name": "Jade", "gender": "female"})
    assert r.status_code == 201
    char = r.json()
    assert char["gender"] == "female"
    assert client.get(f"/api/characters/{char['id']}").json()["gender"] == "female"
    assert client.patch(f"/api/characters/{char['id']}", json={"gender": "male"}).json()["gender"] == "male"
    assert client.post("/api/characters", json={"name": "X", "gender": "invalid"}).status_code == 422


def test_character_voice_profile():
    profile = {"engine": "browser", "voice_name": None, "preset": "calida",
               "rate": 0.95, "pitch": 1.10, "pause_ms": 200}
    r = client.post("/api/characters", json={"name": "Voz", "voice_profile": profile})
    assert r.status_code == 201
    char = r.json()
    assert char["voice_profile"] == profile
    assert client.get(f"/api/characters/{char['id']}").json()["voice_profile"] == profile
    # voice_profile ausente en el PATCH no modifica el perfil existente (exclude_none)
    assert client.patch(f"/api/characters/{char['id']}", json={"name": "Voz2"}).json()["voice_profile"] == profile
    # rangos inválidos
    bad = {"engine": "browser", "voice_name": None, "preset": "calida", "rate": 2.0, "pitch": 1.0, "pause_ms": 200}
    assert client.post("/api/characters", json={"name": "Bad", "voice_profile": bad}).status_code == 422
    bad2 = {"engine": "browser", "voice_name": None, "preset": "calida", "rate": 1.0, "pitch": 0.5, "pause_ms": 200}
    assert client.post("/api/characters", json={"name": "Bad2", "voice_profile": bad2}).status_code == 422
    bad3 = {"engine": "browser", "voice_name": None, "preset": "calida", "rate": 1.0, "pitch": 1.0, "pause_ms": 999}
    assert client.post("/api/characters", json={"name": "Bad3", "voice_profile": bad3}).status_code == 422
    bad4 = {"engine": "browser", "voice_name": None, "preset": "calida", "rate": 1.0, "pitch": 1.0, "pause_ms": 200, "engine": "x"}
    assert client.post("/api/characters", json={"name": "Bad4", "voice_profile": bad4}).status_code == 422


def test_video_scaffolding():
    # inválido → 422
    assert client.post("/api/videos", json={}).status_code == 422
    assert client.post("/api/videos", json={"character_id": "x", "prompt": "", "duration_seconds": 0}).status_code == 422
    # personaje inexistente en dance → 404
    r = client.post("/api/dances", json={"character_id": "no-existe", "reference_image_id": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 404
    # válido pero sin motor → 503
    char = client.post("/api/characters", json={"name": "V"}).json()
    r = client.post("/api/videos", json={"character_id": char["id"], "prompt": "hola"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "provider_unavailable"
    r = client.post("/api/dances", json={"character_id": char["id"], "reference_image_id": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 503
    r = client.post("/api/faceswaps", json={"source_image_id": "00000000-0000-0000-0000-000000000000", "target_image_id": "00000000-0000-0000-0000-000000000000"})
    assert r.status_code == 503
    # listado vacío
    assert client.get("/api/videos").status_code == 200
    assert client.get("/api/videos").json()["total"] == 0


def test_list_characters():
    r = client.get("/api/characters")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data


def test_generation_mock_flow():
    # Crear personaje
    r = client.post("/api/characters", json={"name": "Gen Test"})
    char = r.json()

    # Solicitar generación
    r = client.post("/api/generations", json={
        "character_id": char["id"],
        "prompt": "test prompt",
        "destination": "mock",
        "priority": "balanced",
        "width": 256,
        "height": 256,
    })
    assert r.status_code == 202
    job = r.json()
    assert job["status"] in ("pending", "processing")

    # Esperar procesamiento en el hilo ejecutor
    import time
    time.sleep(2)

    r = client.get(f"/api/generations/{job['id']}")
    j = r.json()
    assert j["status"] == "completed"
    assert len(j["artifacts"]) == 1

    # Verificar URL de artefacto (en desarrollo/memoria es data URI, en Supabase es https://)
    art = j["artifacts"][0]
    assert art["image_url"].startswith("data:image/png") or art["image_url"].startswith("https://")
    assert art["width"] == 256
    assert art["height"] == 256


def test_generation_requires_cloud_confirmation():
    r = client.post("/api/characters", json={"name": "Cloud Test"})
    char = r.json()
    r = client.post("/api/generations", json={
        "character_id": char["id"],
        "prompt": "test",
        "destination": "cloud",
        "priority": "balanced",
        "width": 256,
        "height": 256,
    })
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "confirmation_required"


def test_cancel_pending_job():
    r = client.post("/api/characters", json={"name": "Cancel Test"})
    char = r.json()
    r = client.post("/api/generations", json={
        "character_id": char["id"],
        "prompt": "test",
        "destination": "mock",
        "priority": "balanced",
        "width": 256,
        "height": 256,
    })
    job = r.json()
    r = client.post(f"/api/generations/{job['id']}/cancel")
    assert r.status_code in (200, 409)


def test_delete_character():
    r = client.post("/api/characters", json={"name": "Delete Test"})
    char = r.json()
    r = client.delete(f"/api/characters/{char['id']}?confirm=true")
    assert r.status_code == 204
    r = client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 404


def test_delete_requires_confirm():
    r = client.post("/api/characters", json={"name": "Confirm Test"})
    char = r.json()
    r = client.delete(f"/api/characters/{char['id']}")
    assert r.status_code == 403


def test_gallery():
    r = client.get("/api/gallery")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data
    assert "total" in data


def test_consistency_batch():
    r = client.post("/api/characters", json={"name": "Batch Test"})
    char = r.json()
    r = client.post(f"/api/characters/{char['id']}/consistency-batch", json={
        "base_prompt": "test",
        "destination": "mock",
        "priority": "balanced",
    })
    assert r.status_code == 202
    data = r.json()
    assert "jobs" in data
    assert len(data["jobs"]) == 4


def test_content_policy():
    r = client.post("/api/characters", json={"name": "Policy Test"})
    char = r.json()
    r = client.post("/api/generations", json={
        "character_id": char["id"],
        "prompt": "sexual content with child",
        "destination": "mock",
        "priority": "balanced",
        "width": 256,
        "height": 256,
    })
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "content_policy"


def test_file_signature_invalid():
    # En contrato v1.1 /api/files/... fue eliminado en favor de signed URLs directas
    r = client.get("/api/files/outputs/nonexistent.png?exp=9999999999&sig=invalid")
    assert r.status_code in (403, 404)


def test_not_found():
    r = client.get("/api/characters/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


def test_unauthorized_in_supabase_mode():
    class MockHttp:
        def request(self, *a, **k):
            class R:
                status_code = 401
                def json(self): return {}
            return R()

    s = Settings(env="production", supabase_url="https://test.supabase.co", supabase_service_role_key="secret")
    store, blobs = MemoryStore(), MemoryBlobs()
    auth = SupabaseAuth("https://test.supabase.co", "secret", MockHttp())
    from concurrent.futures import ThreadPoolExecutor
    svc = StudioService(s, store, blobs, {"mock": MockEngine()}, ThreadPoolExecutor(max_workers=1))
    sp_app = create_app(s, parts=(svc, auth, RateLimiter(60)))
    sp_client = TestClient(sp_app)

    # Sin token -> 401
    r = sp_client.get("/api/characters")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthorized"

    # Con token inválido -> 401
    r2 = sp_client.get("/api/characters", headers={"Authorization": "Bearer badtoken"})
    assert r2.status_code == 401
    assert r2.json()["error"]["code"] == "unauthorized"

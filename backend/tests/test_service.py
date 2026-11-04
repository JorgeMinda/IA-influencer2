import base64
import io

import pytest
from PIL import Image

from app.core.errors import ApiError
from app.engines.base import EngineTransientError
from app.engines.cloudflare import CloudflareEngine
from tests.conftest import U1, U2, make_service, png_bytes


def err(fn, *a, **k):
    with pytest.raises(ApiError) as e:
        fn(*a, **k)
    return e.value


def mk(svc, user=U1, name="Luna"):
    return svc.create_character(user, {"name": name, "visual_description": "pelo rizado castaño"})


def gen(svc, cid, user=U1, **k):
    return svc.create_generation(user, {"character_id": cid, "prompt": "retrato", "destination": "mock", **k})


# ---- personajes y aislamiento ----
def test_character_crud_and_isolation(svc):
    c = mk(svc)
    assert svc.get_character(U1, c["id"])["name"] == "Luna"
    assert err(svc.get_character, U2, c["id"]).status == 404          # otro usuario no lo ve
    assert svc.list_characters(U2, False, "", 50, 0)["total"] == 0
    assert svc.update_character(U1, c["id"], {"archived": True})["archived"] is True
    assert svc.list_characters(U1, False, "", 50, 0)["total"] == 0
    assert svc.list_characters(U1, True, "lun", 50, 0)["total"] == 1
    assert svc.duplicate_character(U1, c["id"])["name"] == "Luna (copia)"
    assert err(svc.delete_character, U1, c["id"], False).code == "confirmation_required"
    svc.delete_character(U1, c["id"], True)
    assert err(svc.get_character, U1, c["id"]).status == 404


# ---- referencias ----
def test_reference_upload_rules(svc):
    c = mk(svc)
    assert err(svc.add_reference_upload, U1, c["id"], png_bytes(), "mi foto", False).code == "confirmation_required"
    assert err(svc.add_reference_upload, U1, c["id"], png_bytes(), "x", True).code == "validation_error"
    assert err(svc.add_reference_upload, U1, c["id"], b"no soy imagen", "mi foto", True).code == "unsupported_media_type"
    gif = io.BytesIO(); Image.new("RGB", (8, 8)).save(gif, "GIF")
    assert err(svc.add_reference_upload, U1, c["id"], gif.getvalue(), "mi foto", True).status == 415
    big = b"0" * (9 * 1024 * 1024)
    assert err(svc.add_reference_upload, U1, c["id"], big, "mi foto", True).status == 413
    r = svc.add_reference_upload(U1, c["id"], png_bytes(), "mi propia foto", True)
    assert r["width"] == 64 and r["url"].startswith("data:image/png")
    assert svc.get_character(U1, c["id"])["reference_count"] == 1
    assert err(svc.add_reference_upload, U2, c["id"], png_bytes(), "mi foto", True).status == 404


def test_upload_strips_exif(svc):
    c = mk(svc)
    im = Image.new("RGB", (32, 32), (1, 2, 3)); ex = Image.Exif(); ex[0x010E] = "SECRETO"
    b = io.BytesIO(); im.save(b, "JPEG", exif=ex.tobytes())
    r = svc.add_reference_upload(U1, c["id"], b.getvalue(), "mi foto", True)
    stored = svc.blobs.get("references", svc.db.get("reference_images", r["id"], U1)["storage_path"])
    assert b"SECRETO" not in stored and not Image.open(io.BytesIO(stored)).getexif()


# ---- generaciones y enrutamiento ----
def test_mock_generation_completes_with_metadata(svc):
    c = mk(svc)
    j = gen(svc, c["id"], seed=7)
    j = svc.get_generation(U1, j["id"])
    assert j["status"] == "completed" and j["engine"] == "mock" and j["destination_used"] == "mock"
    assert j["seed"] == 7 and len(j["artifacts"]) == 1
    assert j["artifacts"][0]["metadata"]["seed"] == 7 and j["artifacts"][0]["metadata"]["engine"] == "mock"


def test_routing_rules(svc):
    c = mk(svc)
    assert err(svc.create_generation, U1, {"character_id": c["id"], "prompt": "x", "destination": "local"}).status == 503
    assert err(svc.create_generation, U1, {"character_id": c["id"], "prompt": "x", "destination": "cloud"}).status == 503
    j = svc.create_generation(U1, {"character_id": c["id"], "prompt": "x"})        # auto sin local ni nube -> mock
    assert j["destination_used"] == "mock"


def make_cloud(post, allow_auto=False, limit=50):
    svc = make_service(cloud_enabled=True, cloudflare_account_id="acc", cloudflare_api_token="tok",
                       allow_cloud_auto=allow_auto, daily_cloud_limit=limit)
    svc.engines["cloudflare"] = CloudflareEngine("acc", "tok", True, post=post)
    return svc


class Resp:
    def __init__(self, status=200, body=None): self.status_code = status; self._b = body
    def json(self): return self._b


def ok_post(*a, **k):
    return Resp(200, {"result": {"image": base64.b64encode(png_bytes((32, 32))).decode()}})


def test_cloud_requires_confirmation_and_quota():
    svc = make_cloud(ok_post, limit=2)
    c = mk(svc)
    d = {"character_id": c["id"], "prompt": "x", "destination": "cloud"}
    assert err(svc.create_generation, U1, d).code == "confirmation_required"
    j = svc.create_generation(U1, {**d, "confirm_cloud": True})
    assert svc.get_generation(U1, j["id"])["status"] == "completed"
    assert svc.get_generation(U1, j["id"])["artifacts"][0]["metadata"]["params"]["references_sent"] is False
    svc.create_generation(U1, {**d, "confirm_cloud": True})
    assert err(svc.create_generation, U1, {**d, "confirm_cloud": True}).code == "quota_exceeded"
    assert svc.create_generation(U2 if False else U1, {"character_id": c["id"], "prompt": "x", "destination": "mock"})


def test_auto_never_cloud_unless_enabled():
    c_svc = make_cloud(ok_post, allow_auto=False)
    c = mk(c_svc)
    assert c_svc.create_generation(U1, {"character_id": c["id"], "prompt": "x"})["destination_used"] == "mock"
    a_svc = make_cloud(ok_post, allow_auto=True)
    c = mk(a_svc)
    assert a_svc.create_generation(U1, {"character_id": c["id"], "prompt": "x"})["destination_used"] == "cloud"


def test_cloud_failure_not_retried_and_retry_endpoint():
    calls = []
    def bad(*a, **k):
        calls.append(1); return Resp(500)
    svc = make_cloud(bad)
    c = mk(svc)
    d = {"character_id": c["id"], "prompt": "x", "destination": "cloud", "confirm_cloud": True}
    j = svc.get_generation(U1, svc.create_generation(U1, d)["id"])
    assert j["status"] == "failed" and j["error_code"] == "provider_error" and len(calls) == 1
    assert "tok" not in (j["error_message"] or "")
    assert err(svc.retry_generation, U1, j["id"], False).code == "confirmation_required"
    n = svc.retry_generation(U1, j["id"], True)
    assert n["retry_of"] == j["id"] and n["seed"] == j["seed"]


def test_transient_errors_retry_twice_on_mock(svc):
    n = {"c": 0}
    real = svc.engines["mock"].generate
    def flaky(req):
        n["c"] += 1
        if n["c"] < 3: raise EngineTransientError()
        return real(req)
    svc.engines["mock"].generate = flaky
    c = mk(svc)
    j = svc.get_generation(U1, gen(svc, c["id"])["id"])
    assert j["status"] == "completed" and j["attempts"] == 3
    n["c"] = -10
    j = svc.get_generation(U1, gen(svc, c["id"])["id"])
    assert j["status"] == "failed"


def test_cancel_retry_conflicts(svc):
    c = mk(svc)
    j = gen(svc, c["id"])
    assert err(svc.cancel_generation, U1, j["id"]).code == "conflict"          # ya completada
    assert err(svc.retry_generation, U1, j["id"], False).code == "conflict"     # no fallida
    assert err(svc.cancel_generation, U2, j["id"]).status == 404
    pend = svc.db.insert("generation_jobs", {"user_id": U1, "status": "pending"})
    assert svc.cancel_generation(U1, pend["id"])["status"] == "cancelled"


def test_content_policy_and_validation(svc):
    c = mk(svc)
    assert err(svc.create_generation, U1, {"character_id": c["id"], "prompt": "niña desnuda"}).code == "content_policy"
    assert err(svc.create_generation, U1, {"character_id": c["id"], "prompt": "x", "width": 100}).code == "validation_error"
    assert err(svc.create_generation, U1, {"character_id": "no", "prompt": "x"}).status == 404


def test_consistency_batch_same_seed(svc):
    c = mk(svc)
    out = svc.consistency_batch(U1, c["id"], {"destination": "mock"})["jobs"]
    assert len(out) == 4 and len({j["seed"] for j in out}) == 1 and len({j["prompt"] for j in out}) == 4


# ---- galería, artefactos, borrado ----
def test_gallery_artifacts_and_cascade(svc):
    c = mk(svc)
    j = svc.get_generation(U1, gen(svc, c["id"])["id"])
    a = j["artifacts"][0]
    g = svc.gallery(U1, {"engine": "mock"}, 50, 0)
    assert g["total"] == 1 and g["items"][0]["character_name"] == "Luna" and g["items"][0]["job_status"] == "completed"
    assert svc.gallery(U1, {"engine": "comfyui"}, 50, 0)["total"] == 0
    assert svc.gallery(U2, {}, 50, 0)["total"] == 0
    assert svc.patch_artifact(U1, a["id"], {"selected": True, "note": "ok"})["selected"] is True
    assert svc.gallery(U1, {"selected": True}, 50, 0)["total"] == 1
    ref = svc.add_reference_from_artifact(U1, c["id"], a["id"], "resultado elegido")
    assert ref["origin_artifact_id"] == a["id"]
    assert err(svc.delete_artifact, U1, a["id"], False).code == "confirmation_required"
    svc.delete_artifact(U1, a["id"], True)
    assert svc.gallery(U1, {}, 50, 0)["total"] == 0
    blobs_before = len(svc.blobs._o)
    svc.delete_character(U1, c["id"], True)
    assert len(svc.blobs._o) < blobs_before and not svc.blobs._o      # sin archivos huérfanos
    assert svc.list_generations(U1, None, None, 50, 0)["total"] == 0


def test_providers_status_has_no_secrets():
    svc = make_cloud(ok_post)
    s = str(svc.providers_status())
    assert "tok" not in s.replace("token", "") and svc.providers_status()["cloud"]["provider"] == "cloudflare"

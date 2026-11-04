import json
import pytest

from app.core import errors
from app.core.auth import RateLimiter, SupabaseAuth
from app.core.config import load_settings
from app.engines.base import EngineError, EngineTransientError, GenRequest
from app.engines.cloudflare import CloudflareEngine
from app.engines.comfyui import ComfyUIEngine, fill_workflow
from app.repositories.supabase import SupabaseBlobs, SupabaseStore
from app.services.routing import resolve_destination
from tests.conftest import png_bytes

REQ = GenRequest("p", "", 1, 64, 64)


class R:
    def __init__(self, status=200, body=None, headers=None, content=b""):
        self.status_code, self._b, self.headers, self.content = status, body, headers or {}, content
    def json(self): return self._b


class FakeHttp:
    def __init__(self, *responses): self.calls, self._r = [], list(responses)
    def request(self, method, url, **kw):
        self.calls.append((method, url, kw)); return self._r.pop(0)


def test_routing_table():
    kw = dict(confirm_cloud=False, local_available=False, cloud_configured=True, allow_cloud_auto=False)
    assert resolve_destination("mock", **kw) == "mock"
    assert resolve_destination("auto", **kw) == "mock"
    assert resolve_destination("auto", **{**kw, "allow_cloud_auto": True}) == "cloud"
    assert resolve_destination("auto", **{**kw, "local_available": True}) == "local"
    with pytest.raises(errors.ApiError) as e: resolve_destination("cloud", **kw)
    assert e.value.code == "confirmation_required"
    with pytest.raises(errors.ApiError) as e: resolve_destination("local", **kw)
    assert e.value.status == 503
    with pytest.raises(errors.ApiError) as e: resolve_destination("xx", **kw)
    assert e.value.status == 422


def test_cloudflare_error_mapping():
    def eng(post): return CloudflareEngine("a", "secreto-123", True, post=post)
    for status, frag in [(401, "credenciales"), (429, "límite"), (500, "HTTP 500")]:
        with pytest.raises(EngineError) as e: eng(lambda *a, **k: R(status)).generate(REQ)
        assert frag in str(e.value) and "secreto-123" not in str(e.value)
    def boom(*a, **k): raise OSError("x")
    with pytest.raises(EngineTransientError): eng(boom).generate(REQ)
    with pytest.raises(EngineError): eng(lambda *a, **k: R(200, {"result": {}})).generate(REQ)
    with pytest.raises(EngineError): CloudflareEngine("", "", True).generate(REQ)
    seen = {}
    def spy(url, headers, json, timeout): seen.update(url=url, h=headers, j=json); return R(200, {"result": {"image": "AAAA"}})
    eng(spy).generate(REQ)
    assert seen["url"].endswith("/accounts/a/ai/run/@cf/black-forest-labs/flux-1-schnell")
    assert seen["j"] == {"prompt": "p", "steps": 4} and seen["h"]["Authorization"] == "Bearer secreto-123"


def test_comfyui_workflow_and_flow(tmp_path):
    wf = {"3": {"inputs": {"seed": "{{seed}}", "text": "{{prompt}}", "w": "{{width}}"}}, "x": ["{{height}}", "fijo"]}
    assert fill_workflow(wf, {"prompt": "hola", "negative_prompt": "", "seed": 5, "width": 64, "height": 128}) == \
        {"3": {"inputs": {"seed": 5, "text": "hola", "w": 64}}, "x": [128, "fijo"]}
    path = tmp_path / "wf.json"; path.write_text(json.dumps(wf))
    assert ComfyUIEngine(False, "http://x", str(path)).is_available()[0] is False
    assert "Falta el flujo" in ComfyUIEngine(True, "http://x", str(tmp_path / "no.json")).is_available()[1]
    png = png_bytes()
    def fake(method, url, **kw):
        if url.endswith("/system_stats"): return R(200, {})
        if url.endswith("/prompt"): return R(200, {"prompt_id": "P1"})
        if "/history/" in url: return R(200, {"P1": {"outputs": {"9": {"images": [{"filename": "a.png"}]}}}})
        if url.endswith("/view"): return R(200, content=png)
    e = ComfyUIEngine(True, "http://x", str(path), request=fake, poll_seconds=0)
    res = e.generate(REQ)
    assert res.images == [png] and res.provider_job_id == "P1"


def test_supabase_auth_and_cache():
    t = {"now": 0.0}
    http = FakeHttp(R(200, {"id": "u-1"}))
    a = SupabaseAuth("https://p.supabase.co", "anon", http, clock=lambda: t["now"])
    assert a.verify("tk") == "u-1" and a.verify("tk") == "u-1" and len(http.calls) == 1   # caché
    m, url, kw = http.calls[0]
    assert url == "https://p.supabase.co/auth/v1/user" and kw["headers"]["Authorization"] == "Bearer tk"
    t["now"] = 31
    http._r.append(R(401))
    with pytest.raises(errors.ApiError) as e: a.verify("tk")
    assert e.value.status == 401
    with pytest.raises(errors.ApiError): a.verify(None)


def test_rate_limiter():
    t = {"n": 0.0}
    rl = RateLimiter(2, clock=lambda: t["n"])
    rl.check("u"); rl.check("u")
    with pytest.raises(errors.ApiError) as e: rl.check("u")
    assert e.value.status == 429 and int(e.value.headers["Retry-After"]) >= 1
    rl.check("otro")
    t["n"] = 61; rl.check("u")


def test_supabase_store_request_shapes():
    http = FakeHttp(R(201, [{"id": "1"}]), R(200, [{"id": "1"}], {"content-range": "0-0/7"}), R(200, [{"id": "1"}]), R(200, []), R(200, True))
    s = SupabaseStore("https://p.supabase.co", "SVC", http)
    assert s.insert("characters", {"name": "a"}) == {"id": "1"}
    rows, total = s.select("characters", "U", [("name", "ilike", "lu"), ("job_id", "in", ["a", "b"])], limit=10)
    assert total == 7
    params = dict(http.calls[1][2]["params"])
    assert params["user_id"] == "eq.U" and params["name"] == "ilike.*lu*" and params["job_id"] == "in.(a,b)"
    assert s.update("jobs", "1", "U", {"status": "x"}, expect={"status": "pending"}) == {"id": "1"}
    assert dict(http.calls[2][2]["params"])["status"] == "eq.pending"
    assert s.delete("jobs", "1", "U") is False
    assert s.claim_cloud_quota("U", 5) is True and http.calls[4][1].endswith("/rpc/increment_cloud_usage")
    assert http.calls[0][2]["headers"]["apikey"] == "SVC"


def test_supabase_store_error_is_generic():
    s = SupabaseStore("https://p.supabase.co", "SVC", FakeHttp(R(500, {"message": "secreto"})))
    from app.repositories.base import StoreError
    with pytest.raises(StoreError) as e: s.get("characters", "1", "U")
    assert "secreto" not in str(e.value) and "SVC" not in str(e.value)


def test_supabase_blobs_shapes():
    http = FakeHttp(R(200), R(200, {"signedURL": "/object/sign/outputs/u/a.png?token=T"}), R(200))
    b = SupabaseBlobs("https://p.supabase.co", "SVC", http)
    b.put("outputs", "u/a b.png", b"x", "image/png")
    assert http.calls[0][1] == "https://p.supabase.co/storage/v1/object/outputs/u/a%20b.png"
    assert b.signed_url("outputs", "u/a.png", 3600) == "https://p.supabase.co/storage/v1/object/sign/outputs/u/a.png?token=T"
    assert http.calls[1][2]["json"] == {"expiresIn": 3600}
    b.delete("outputs", ["u/a.png"]); assert http.calls[2][2]["json"] == {"prefixes": ["u/a.png"]}


def test_config_validation():
    assert load_settings({"ACS_ENV": "production"}).validate()                       # falta Supabase
    assert not load_settings({"ACS_ENV": "development"}).validate()
    ok = load_settings({"ACS_ENV": "production", "SUPABASE_URL": "https://x.supabase.co", "SUPABASE_SERVICE_ROLE_KEY": "SVC-KEY-123"})
    assert not ok.validate() and "SVC-KEY-123" not in repr(ok)
    assert load_settings({"SUPABASE_URL": "http://x", "SUPABASE_SERVICE_ROLE_KEY": "k"}).validate()

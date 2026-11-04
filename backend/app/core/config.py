"""Configuración desde variables de entorno (ver .env.example). Sin valores secretos por defecto."""
from __future__ import annotations
import os
from dataclasses import dataclass, field


def _bool(v: str | None, default: bool = False) -> bool:
    if v is None or v.strip() == "":
        return default
    return v.strip().lower() in {"1", "true", "yes", "si", "sí", "on"}


def _int(v: str | None, default: int) -> int:
    try:
        return int(v) if v not in (None, "") else default
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    env: str = "development"
    version: str = "0.2.0"
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")
    max_upload_mb: int = 8
    max_concurrent_jobs: int = 2
    rate_limit_per_minute: int = 60
    signed_url_ttl: int = 3600
    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = field(default="", repr=False)
    # Motores
    comfyui_enabled: bool = False
    comfyui_url: str = "http://127.0.0.1:8188"
    comfyui_workflow: str = "workflows/image-generation/workflow_api.json"
    cloud_enabled: bool = False
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = field(default="", repr=False)
    allow_cloud_auto: bool = False
    daily_cloud_limit: int = 50

    @property
    def use_supabase(self) -> bool:
        return bool(self.supabase_url and str(self.supabase_url).strip())

    @property
    def is_dev(self) -> bool:
        return self.env == "development"

    @property
    def cloud_configured(self) -> bool:
        return bool(self.cloudflare_account_id and self.cloudflare_api_token)

    def validate(self) -> list[str]:
        """Devuelve problemas de configuración que impiden arrancar."""
        problems: list[str] = []
        if self.env == "production" and not self.use_supabase:
            problems.append("SUPABASE_URL es obligatoria fuera de ACS_ENV=development.")
            return problems
        if self.use_supabase and not self.supabase_service_role_key:
            problems.append("Con SUPABASE_URL hace falta SUPABASE_SERVICE_ROLE_KEY.")
            return problems
        if self.use_supabase and self.supabase_url and not str(self.supabase_url).startswith("https://"):
            problems.append("SUPABASE_URL debe empezar por https://.")
            return problems
        if not self.use_supabase and self.is_dev:
            return []
        return problems


def _load_dotenv() -> dict[str, str]:
    from pathlib import Path
    out: dict[str, str] = {}
    candidates = [
        Path(".env"),
        Path("backend/.env"),
        Path(__file__).resolve().parents[2] / ".env",
        Path(__file__).resolve().parents[1] / ".env",
    ]
    for p in candidates:
        if p.is_file():
            try:
                for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    out.setdefault(k.strip(), v.strip().strip("'\""))
            except Exception:
                pass
    return out


def load_settings(environ: dict[str, str] | None = None) -> Settings:
    if environ is None:
        file_env = _load_dotenv()
        e = {**file_env, **os.environ}
    else:
        e = environ
    origins = tuple(o.strip() for o in e.get("ACS_CORS_ORIGINS", "").split(",") if o.strip())
    return Settings(
        env=e.get("ACS_ENV", "development"),
        cors_origins=origins or Settings.cors_origins,
        max_upload_mb=_int(e.get("ACS_MAX_UPLOAD_MB"), 8),
        max_concurrent_jobs=max(1, _int(e.get("ACS_MAX_CONCURRENT_JOBS"), 2)),
        rate_limit_per_minute=max(1, _int(e.get("ACS_RATE_LIMIT_PER_MINUTE"), 60)),
        signed_url_ttl=_int(e.get("ACS_SIGNED_URL_TTL"), 3600),
        supabase_url=e.get("SUPABASE_URL", "").strip().rstrip("/"),
        supabase_anon_key=e.get("SUPABASE_ANON_KEY", "").strip(),
        supabase_service_role_key=e.get("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        comfyui_enabled=_bool(e.get("ACS_COMFYUI_ENABLED")),
        comfyui_url=e.get("ACS_COMFYUI_URL", "http://127.0.0.1:8188").strip().rstrip("/"),
        comfyui_workflow=e.get("ACS_COMFYUI_WORKFLOW", "workflows/image-generation/workflow_api.json"),
        cloud_enabled=_bool(e.get("ACS_CLOUD_ENABLED")),
        cloudflare_account_id=e.get("ACS_CLOUDFLARE_ACCOUNT_ID", "").strip(),
        cloudflare_api_token=e.get("ACS_CLOUDFLARE_API_TOKEN", "").strip(),
        allow_cloud_auto=_bool(e.get("ACS_ALLOW_CLOUD_AUTO")),
        daily_cloud_limit=max(1, _int(e.get("ACS_DAILY_CLOUD_LIMIT"), 50)),
    )


settings = load_settings()


class _Settings(Settings):
    @property
    def db_path(self):
        from pathlib import Path
        return Path("data/studio.db")

    @property
    def data_path(self):
        from pathlib import Path
        return Path("data")


settings = _Settings(**{k: getattr(load_settings(), k) for k in Settings.__dataclass_fields__})

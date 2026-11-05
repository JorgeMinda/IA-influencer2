"""Lógica de negocio. Todo método recibe user_id y filtra por él (RLS es solo segunda barrera)."""
from __future__ import annotations

import logging
import secrets
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from app.core import errors
from app.core.config import Settings
from app.core.policy import violates_policy
from app.engines.base import EngineError, EngineTransientError, GenRequest
from app.repositories.base import Blobs, Store
from app.services.images import new_id, process_image
from app.services.routing import resolve_destination

log = logging.getLogger("acs")
ENGINE_FOR = {"local": "comfyui", "cloud": "cloudflare", "mock": "mock"}
BATCH_SUFFIXES = ["retrato, primer plano del rostro", "plano medio", "cuerpo completo",
                  "en un escenario distinto"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class InlineExecutor:
    """Ejecuta en el acto (pruebas)."""
    def submit(self, fn, *a, **kw):
        fn(*a, **kw)


class StudioService:
    def __init__(self, settings: Settings, store: Store, blobs: Blobs, engines: dict, executor: Any) -> None:
        self.s, self.db, self.blobs, self.engines, self.executor = settings, store, blobs, engines, executor

    # ---------- URLs ----------
    def _url(self, bucket: str, path: str) -> str:
        return self.blobs.signed_url(bucket, path, self.s.signed_url_ttl)

    # ---------- serialización ----------
    def _char_out(self, r: dict, refs: int) -> dict:
        return {"id": r["id"], "name": r["name"], "visual_description": r["visual_description"],
               "invariant_traits": r["invariant_traits"], "notes": r["notes"],
               "gender": r.get("gender", "unspecified"), "archived": r["archived"],
               "reference_count": refs, "created_at": r["created_at"], "updated_at": r.get("updated_at", r["created_at"])}

    def _ref_out(self, r: dict) -> dict:
        return {"id": r["id"], "character_id": r["character_id"], "url": self._url("references", r["storage_path"]),
                "thumbnail_url": self._url("thumbnails", r["thumbnail_path"]), "width": r["width"], "height": r["height"],
                "source_note": r["source_note"], "rights_confirmed": r["rights_confirmed"],
                "origin_artifact_id": r.get("origin_artifact_id"), "created_at": r["created_at"]}

    def _art_out(self, r: dict) -> dict:
        return {"id": r["id"], "job_id": r["job_id"], "character_id": r["character_id"],
                "image_url": self._url("outputs", r["storage_path"]),
                "thumbnail_url": self._url("thumbnails", r["thumbnail_path"]), "width": r["width"], "height": r["height"],
                "selected": r["selected"], "note": r["note"], "metadata": r["metadata"], "created_at": r["created_at"]}

    def _job_out(self, r: dict, artifacts: list[dict]) -> dict:
        keys = ["id", "character_id", "prompt", "negative_prompt", "seed", "width", "height", "priority",
                "destination_requested", "destination_used", "engine", "model", "workflow_version", "status",
                "error_code", "error_message", "attempts", "retry_of", "provider_job_id", "created_at",
                "started_at", "completed_at"]
        out = {k: r.get(k) for k in keys}
        out["artifacts"] = [self._art_out(a) for a in artifacts]
        return out

    def _job_artifacts(self, user: str, job_id: str) -> list[dict]:
        rows, _ = self.db.select("generation_artifacts", user, [("job_id", "eq", job_id)], desc=False, limit=200)
        return rows

    # ---------- personajes ----------
    def _char(self, user: str, cid: str) -> dict:
        r = self.db.get("characters", cid, user)
        if not r:
            raise errors.not_found("Personaje no encontrado.")
        return r

    def _ref_counts(self, user: str, ids: list[str]) -> Counter:
        if not ids:
            return Counter()
        rows, _ = self.db.select("reference_images", user, [("character_id", "in", ids)], limit=1000)
        return Counter(r["character_id"] for r in rows)

    def list_characters(self, user: str, include_archived: bool, q: str, limit: int, offset: int) -> dict:
        f: list = [] if include_archived else [("archived", "eq", False)]
        if q:
            f.append(("name", "ilike", q))
        rows, total = self.db.select("characters", user, f, limit=limit, offset=offset)
        counts = self._ref_counts(user, [r["id"] for r in rows])
        return {"items": [self._char_out(r, counts[r["id"]]) for r in rows], "total": total}

    def create_character(self, user: str, data: dict) -> dict:
        r = self.db.insert("characters", {"user_id": user, "name": data["name"],
                                          "visual_description": data.get("visual_description") or "",
                                          "invariant_traits": data.get("invariant_traits") or [],
                                          "notes": data.get("notes") or "",
                                          "gender": data.get("gender") or "unspecified",
                                          "archived": False, "updated_at": _now()})
        return self._char_out(r, 0)

    def get_character(self, user: str, cid: str) -> dict:
        r = self._char(user, cid)
        return self._char_out(r, self._ref_counts(user, [cid])[cid])

    def update_character(self, user: str, cid: str, patch: dict) -> dict:
        allowed = {k: v for k, v in patch.items() if k in {"name", "visual_description", "invariant_traits", "notes", "archived", "gender"}}
        self._char(user, cid)
        r = self.db.update("characters", cid, user, {**allowed, "updated_at": _now()}) if allowed else self._char(user, cid)
        if not r:
            raise errors.not_found("Personaje no encontrado.")
        return self._char_out(r, self._ref_counts(user, [cid])[cid])

    def duplicate_character(self, user: str, cid: str) -> dict:
        c = self._char(user, cid)
        return self.create_character(user, {"name": f"{c['name']} (copia)"[:80], "visual_description": c["visual_description"],
                                           "invariant_traits": c["invariant_traits"], "notes": c["notes"],
                                           "gender": c.get("gender", "unspecified")})

    def _storage_paths(self, user: str, table: str, col: str, value: str) -> list[tuple[str, str]]:
        out: list[tuple[str, str]] = []
        bucket = "references" if table == "reference_images" else "outputs"
        rows, _ = self.db.select(table, user, [(col, "eq", value)], limit=1000)
        for r in rows:
            out += [(bucket, r["storage_path"]), ("thumbnails", r["thumbnail_path"])]
        return out

    def _drop_blobs(self, items: list[tuple[str, str]]) -> None:
        by: dict[str, list[str]] = {}
        for b, p in items:
            by.setdefault(b, []).append(p)
        for b, ps in by.items():
            try:
                self.blobs.delete(b, ps)
            except Exception:
                log.warning("No se pudieron borrar %d archivos de %s (quedan huérfanos)", len(ps), b)

    def delete_character(self, user: str, cid: str, confirm: bool) -> None:
        if not confirm:
            raise errors.confirmation_required("Borrar el personaje requiere confirm=true.")
        self._char(user, cid)
        paths = (self._storage_paths(user, "reference_images", "character_id", cid)
                 + self._storage_paths(user, "generation_artifacts", "character_id", cid))
        self.db.delete("characters", cid, user)
        self._drop_blobs(paths)

    # ---------- referencias ----------
    def _store_image(self, user: str, data: bytes, bucket: str, max_mb: int):
        p = process_image(data, max_mb)
        base = f"{user}/{new_id()}"
        self.blobs.put(bucket, f"{base}.png", p.png, "image/png")
        self.blobs.put("thumbnails", f"{base}.jpg", p.thumb_jpg, "image/jpeg")
        return p, f"{base}.png", f"{base}.jpg"

    def list_references(self, user: str, cid: str) -> dict:
        self._char(user, cid)
        rows, total = self.db.select("reference_images", user, [("character_id", "eq", cid)], limit=200)
        return {"items": [self._ref_out(r) for r in rows], "total": total}

    def _check_ref_meta(self, source_note: str, rights: bool) -> None:
        if not 3 <= len((source_note or "").strip()) <= 500:
            raise errors.validation("La procedencia debe tener entre 3 y 500 caracteres.",
                                    [{"field": "source_note", "reason": "longitud 3–500"}])
        if not rights:
            raise errors.confirmation_required("Debes confirmar que tienes derecho a usar esta imagen (rights_confirmed).")

    def add_reference_upload(self, user: str, cid: str, data: bytes, source_note: str, rights_confirmed: bool) -> dict:
        self._char(user, cid)
        self._check_ref_meta(source_note, rights_confirmed)
        p, path, tpath = self._store_image(user, data, "references", self.s.max_upload_mb)
        try:
            r = self.db.insert("reference_images", {"user_id": user, "character_id": cid, "storage_path": path,
                                                    "thumbnail_path": tpath, "width": p.width, "height": p.height,
                                                    "source_note": source_note.strip(), "rights_confirmed": True,
                                                    "origin_artifact_id": None})
        except Exception:
            self._drop_blobs([("references", path), ("thumbnails", tpath)]); raise
        return self._ref_out(r)

    def add_reference_from_artifact(self, user: str, cid: str, artifact_id: str, source_note: str) -> dict:
        self._char(user, cid)
        a = self.db.get("generation_artifacts", artifact_id, user)
        if not a:
            raise errors.not_found("Resultado no encontrado.")
        self._check_ref_meta(source_note, True)
        data = self.blobs.get("outputs", a["storage_path"])
        p, path, tpath = self._store_image(user, data, "references", 64)
        r = self.db.insert("reference_images", {"user_id": user, "character_id": cid, "storage_path": path,
                                                "thumbnail_path": tpath, "width": p.width, "height": p.height,
                                                "source_note": source_note.strip(), "rights_confirmed": True,
                                                "origin_artifact_id": artifact_id})
        return self._ref_out(r)

    def delete_reference(self, user: str, rid: str, confirm: bool) -> None:
        if not confirm:
            raise errors.confirmation_required("Borrar la referencia requiere confirm=true.")
        r = self.db.get("reference_images", rid, user)
        if not r:
            raise errors.not_found("Referencia no encontrada.")
        self.db.delete("reference_images", rid, user)
        self._drop_blobs([("references", r["storage_path"]), ("thumbnails", r["thumbnail_path"])])

    # ---------- generaciones ----------
    def _local_ok(self) -> bool:
        return self.engines["comfyui"].is_available()[0]

    def _cloud_ok(self) -> bool:
        return self.s.cloud_enabled and self.engines["cloudflare"].is_available()[0]

    def _route(self, requested: str, confirm_cloud: bool) -> str:
        return resolve_destination(requested, confirm_cloud=confirm_cloud, local_available=self._local_ok(),
                                   cloud_configured=self._cloud_ok(), allow_cloud_auto=self.s.allow_cloud_auto)

    def _new_job(self, user: str, char: dict, d: dict, dest: str, seed: int, retry_of: str | None = None) -> dict:
        if dest == "cloud" and not self.db.claim_cloud_quota(user, self.s.daily_cloud_limit):
            raise errors.quota_exceeded()
        eng = self.engines[ENGINE_FOR[dest]]
        row = self.db.insert("generation_jobs", {
            "user_id": user, "character_id": char["id"], "prompt": d["prompt"], "negative_prompt": d.get("negative_prompt") or "",
            "seed": seed, "width": d["width"], "height": d["height"], "priority": d["priority"],
            "destination_requested": d["destination"], "destination_used": dest, "engine": eng.name, "model": None,
            "workflow_version": "1", "status": "pending", "error_code": None, "error_message": None, "attempts": 0,
            "retry_of": retry_of, "provider_job_id": None, "params": {"references_sent": False},
            "started_at": None, "completed_at": None})
        self.executor.submit(self.run_job, user, row["id"])
        return self.db.get("generation_jobs", row["id"], user) or row

    @staticmethod
    def _norm_gen(d: dict) -> dict:
        d = dict(d)
        d.setdefault("destination", "auto"); d.setdefault("priority", "balanced")
        d["width"] = d.get("width") or 768; d["height"] = d.get("height") or 768
        for k in ("width", "height"):
            if not (256 <= d[k] <= 1536 and d[k] % 64 == 0):
                raise errors.validation("Tamaño no válido (256–1536, múltiplo de 64).", [{"field": k, "reason": "rango o múltiplo"}])
        if d["priority"] not in {"speed", "balanced", "quality"}:
            raise errors.validation("Prioridad no válida.", [{"field": "priority", "reason": "speed|balanced|quality"}])
        return d

    def create_generation(self, user: str, data: dict) -> dict:
        d = self._norm_gen(data)
        char = self._char(user, d["character_id"])
        if violates_policy(d["prompt"], d.get("negative_prompt") or ""):
            raise errors.content_policy()
        dest = self._route(d["destination"], bool(d.get("confirm_cloud")))
        seed = d.get("seed")
        seed = secrets.randbelow(2**31) if seed is None else seed
        job = self._new_job(user, char, d, dest, seed)
        return self._job_out(job, self._job_artifacts(user, job["id"]))

    def get_generation(self, user: str, jid: str) -> dict:
        j = self.db.get("generation_jobs", jid, user)
        if not j:
            raise errors.not_found("Tarea no encontrada.")
        return self._job_out(j, self._job_artifacts(user, jid))

    def list_generations(self, user: str, character_id: str | None, status: str | None, limit: int, offset: int) -> dict:
        f: list = []
        if character_id: f.append(("character_id", "eq", character_id))
        if status: f.append(("status", "eq", status))
        rows, total = self.db.select("generation_jobs", user, f, limit=limit, offset=offset)
        return {"items": [self._job_out(r, self._job_artifacts(user, r["id"])) for r in rows], "total": total}

    def retry_generation(self, user: str, jid: str, confirm_cloud: bool) -> dict:
        j = self.db.get("generation_jobs", jid, user)
        if not j:
            raise errors.not_found("Tarea no encontrada.")
        if j["status"] != "failed":
            raise errors.conflict("Solo se pueden reintentar tareas fallidas.")
        char = self._char(user, j["character_id"])
        d = {"prompt": j["prompt"], "negative_prompt": j["negative_prompt"], "width": j["width"], "height": j["height"],
             "priority": j["priority"], "destination": j["destination_requested"]}
        dest = self._route(d["destination"], confirm_cloud)
        new = self._new_job(user, char, d, dest, j["seed"], retry_of=jid)
        return self._job_out(new, [])

    def cancel_generation(self, user: str, jid: str) -> dict:
        r = self.db.update("generation_jobs", jid, user, {"status": "cancelled", "completed_at": _now()},
                           expect={"status": "pending"})
        if r:
            return self._job_out(r, [])
        if not self.db.get("generation_jobs", jid, user):
            raise errors.not_found("Tarea no encontrada.")
        raise errors.conflict("Solo se pueden cancelar tareas pendientes.")

    def consistency_batch(self, user: str, cid: str, data: dict) -> dict:
        char = self._char(user, cid)
        d0 = self._norm_gen({"destination": data.get("destination") or "auto", "priority": data.get("priority") or "balanced"})
        base = (data.get("base_prompt") or char["visual_description"] or char["name"]).strip()
        if violates_policy(base):
            raise errors.content_policy()
        dest = self._route(d0["destination"], bool(data.get("confirm_cloud")))
        seed = secrets.randbelow(2**31)
        jobs = []
        for suf in BATCH_SUFFIXES:
            # Nota: en nube cada trabajo consume cuota; si se agota a mitad, los ya creados siguen su curso.
            j = self._new_job(user, char, {**d0, "prompt": f"{base}, {suf}"}, dest, seed)
            jobs.append(self._job_out(j, self._job_artifacts(user, j["id"])))
        return {"jobs": jobs}

    # ---------- ejecución ----------
    def _fail(self, user: str, jid: str, code: str, msg: str) -> None:
        self.db.update("generation_jobs", jid, user, {"status": "failed", "error_code": code, "error_message": msg,
                                                      "completed_at": _now()})

    def run_job(self, user: str, jid: str) -> None:
        j = self.db.update("generation_jobs", jid, user, {"status": "processing", "started_at": _now(), "attempts": 1},
                           expect={"status": "pending"})
        if not j:
            return  # cancelado o ya tomado
        dest = j["destination_used"]
        eng = self.engines[ENGINE_FOR[dest]]
        req = GenRequest(prompt=j["prompt"], negative_prompt=j["negative_prompt"], seed=j["seed"], width=j["width"],
                         height=j["height"], priority=j["priority"], references=[])
        retries = 2 if dest in ("local", "mock") else 0   # contrato regla 6: ninguno automático en nube
        attempt = 1
        try:
            while True:
                try:
                    res = eng.generate(req); break
                except EngineTransientError:
                    if attempt > retries:
                        self._fail(user, jid, "provider_error", "El motor no respondió. Puedes reintentar."); return
                    attempt += 1
                    self.db.update("generation_jobs", jid, user, {"attempts": attempt})
            made: list[tuple[str, str]] = []
            try:
                for img in res.images:
                    p, path, tpath = self._store_image(user, img, "outputs", 64)
                    made += [("outputs", path), ("thumbnails", tpath)]
                    meta = {"prompt": j["prompt"], "negative_prompt": j["negative_prompt"], "seed": j["seed"],
                            "model": res.model, "engine": eng.name, "workflow_version": res.workflow_version,
                            "params": res.params}
                    self.db.insert("generation_artifacts", {"user_id": user, "job_id": jid, "character_id": j["character_id"],
                                                            "storage_path": path, "thumbnail_path": tpath, "width": p.width,
                                                            "height": p.height, "selected": False, "note": "", "metadata": meta})
            except Exception:
                self._drop_blobs(made); raise
            self.db.update("generation_jobs", jid, user, {"status": "completed", "model": res.model,
                                                          "workflow_version": res.workflow_version,
                                                          "provider_job_id": res.provider_job_id,
                                                          "params": res.params, "completed_at": _now()})
        except EngineError as e:
            self._fail(user, jid, "provider_error", str(e))
        except errors.ApiError:
            self._fail(user, jid, "provider_error", "La imagen generada no es válida.")
        except Exception:
            log.exception("Fallo inesperado en la tarea %s", jid)
            self._fail(user, jid, "internal_error", "Error interno al generar la imagen.")

    # ---------- galería y resultados ----------
    def gallery(self, user: str, q: dict, limit: int, offset: int) -> dict:
        f: list = []
        if q.get("character_id"): f.append(("character_id", "eq", q["character_id"]))
        if q.get("selected") is not None: f.append(("selected", "eq", q["selected"]))
        if q.get("date_from"): f.append(("created_at", "gte", q["date_from"]))
        if q.get("date_to"): f.append(("created_at", "lte", q["date_to"]))
        if q.get("status") or q.get("engine"):
            jf = [(k, "eq", q[k]) for k in ("status", "engine") if q.get(k)]
            jobs, _ = self.db.select("generation_jobs", user, jf, limit=1000)
            ids = [j["id"] for j in jobs]
            if not ids:
                return {"items": [], "total": 0}
            f.append(("job_id", "in", ids))
        rows, total = self.db.select("generation_artifacts", user, f, limit=limit, offset=offset)
        jobs = {}
        for r in rows:
            jobs[r["job_id"]] = jobs.get(r["job_id"]) or self.db.get("generation_jobs", r["job_id"], user)
        names = {}
        items = []
        for r in rows:
            j = jobs.get(r["job_id"]) or {}
            if r["character_id"] not in names:
                c = self.db.get("characters", r["character_id"], user)
                names[r["character_id"]] = c["name"] if c else ""
            items.append({**self._art_out(r), "character_name": names[r["character_id"]], "engine": j.get("engine"),
                          "destination_used": j.get("destination_used"), "job_status": j.get("status"),
                          "job_created_at": j.get("created_at")})
        return {"items": items, "total": total}

    def get_artifact(self, user: str, aid: str) -> dict:
        a = self.db.get("generation_artifacts", aid, user)
        if not a:
            raise errors.not_found("Resultado no encontrado.")
        return self._art_out(a)

    def patch_artifact(self, user: str, aid: str, patch: dict) -> dict:
        p = {k: v for k, v in patch.items() if k in {"selected", "note"} and v is not None}
        if "note" in p and len(p["note"]) > 1000:
            raise errors.validation("La nota admite hasta 1000 caracteres.", [{"field": "note", "reason": "máx. 1000"}])
        r = self.db.update("generation_artifacts", aid, user, p) if p else self.db.get("generation_artifacts", aid, user)
        if not r:
            raise errors.not_found("Resultado no encontrado.")
        return self._art_out(r)

    def delete_artifact(self, user: str, aid: str, confirm: bool) -> None:
        if not confirm:
            raise errors.confirmation_required("Borrar el resultado requiere confirm=true.")
        a = self.db.get("generation_artifacts", aid, user)
        if not a:
            raise errors.not_found("Resultado no encontrado.")
        self.db.delete("generation_artifacts", aid, user)
        self._drop_blobs([("outputs", a["storage_path"]), ("thumbnails", a["thumbnail_path"])])

    # ---------- proveedores ----------
    def providers_status(self) -> dict:
        lo, ld = self.engines["comfyui"].is_available()
        co, cd = self.engines["cloudflare"].is_available()
        return {"local": {"enabled": self.s.comfyui_enabled, "available": lo, "detail": ld},
                "cloud": {"enabled": self.s.cloud_enabled, "provider": "cloudflare",
                          "configured": self.s.cloud_configured, "detail": cd},
                "mock": {"enabled": True, "detail": "Motor simulado para desarrollo"},
                "limits": {"max_upload_mb": self.s.max_upload_mb, "max_concurrent_jobs": self.s.max_concurrent_jobs,
                           "rate_limit_per_minute": self.s.rate_limit_per_minute}}

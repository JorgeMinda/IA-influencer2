from __future__ import annotations
import os
import asyncio
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from ..core.config import settings
from ..core.database import new_id, _now
from ..integrations.mock_engine import MockEngine
from ..repositories.generations import GenerationRepository
from ..repositories.characters import CharacterRepository
from ..repositories.references import ReferenceRepository


_executor = ThreadPoolExecutor(max_workers=settings.max_concurrent_jobs)


def _route_destination(requested: str, local_available: bool) -> tuple[str, str, str]:
    """Devuelve (destination_used, engine, model)."""
    if requested == "local":
        if not settings.comfyui_enabled:
            raise ValueError("provider_unavailable: motor local desactivado")
        return "local", "comfyui", "comfyui-model"
    if requested == "cloud":
        if not settings.cloud_enabled or not settings.cloud_api_key:
            raise ValueError("provider_unavailable: nube no configurada")
        return "cloud", "cloud_images", settings.cloud_provider or "cloud"
    if requested == "mock":
        return "mock", "mock", "simulado-v1"
    # auto
    if settings.comfyui_enabled and local_available:
        return "local", "comfyui", "comfyui-model"
    return "mock", "mock", "simulado-v1"


class ContentPolicyError(Exception):
    pass


def check_content_policy(prompt: str) -> None:
    lower = prompt.lower()
    # Minimal filter: sexual content involving minors
    minor_terms = ["niño", "niña", "menor", "child", "kid", "underage", "adolescente"]
    sexual_terms = ["sexual", "nude", "desnudo", "porn", "xxx", "nsfw", "erotic"]
    has_minor = any(t in lower for t in minor_terms)
    has_sexual = any(t in lower for t in sexual_terms)
    if has_minor and has_sexual:
        raise ContentPolicyError("Prompt rechazado por la política de contenido")


class GenerationService:
    def __init__(self, user_id: str | None = None):
        self.user_id = user_id
        self.gen_repo = GenerationRepository(user_id)
        self.char_repo = CharacterRepository(user_id)
        self.ref_repo = ReferenceRepository(user_id)
        self.mock_engine = MockEngine()

    def _ensure_data_dirs(self):
        for d in ["references", "outputs", "thumbnails"]:
            (settings.data_path / d).mkdir(parents=True, exist_ok=True)

    async def create_generation(self, character_id: str, prompt: str, negative_prompt: str,
                                destination: str, priority: str, width: int, height: int,
                                seed: int | None, confirm_cloud: bool) -> dict:
        check_content_policy(prompt)

        char = self.char_repo.get(character_id)
        if not char:
            raise ValueError("not_found")

        # Resolve destination
        if destination == "cloud":
            if not confirm_cloud:
                raise ValueError("confirmation_required")
            if not settings.cloud_enabled or not settings.cloud_api_key:
                raise ValueError("provider_unavailable")

        local_available = settings.comfyui_enabled  # simplified
        dest_used, engine, model = _route_destination(destination, local_available)

        if seed is None:
            import random
            seed = random.randint(0, 2**31 - 1)

        job = self.gen_repo.create_job(
            character_id=character_id,
            prompt=prompt,
            negative_prompt=negative_prompt,
            seed=seed,
            width=width,
            height=height,
            priority=priority,
            destination_requested=destination,
            destination_used=dest_used,
            engine=engine,
            model=model,
            retry_of=None,
        )

        # Enqueue processing (async)
        asyncio.create_task(self._process_job(job["id"]))
        return job

    async def _process_job(self, job_id: str):
        job = self.gen_repo.get_job(job_id)
        if not job:
            return
        # Mark processing
        self.gen_repo.update_job_status(job_id, "processing", started_at=_now())

        try:
            engine = job["engine"]
            if engine == "mock":
                images = self.mock_engine.generate(job["prompt"], job["width"], job["height"], job["seed"])
            elif engine == "comfyui":
                # Not implemented - would call ComfyUI
                raise ValueError("provider_unavailable")
            elif engine == "cloud_images":
                # Not implemented - would call cloud provider
                raise ValueError("provider_unavailable")
            else:
                raise ValueError("provider_unavailable")

            self._ensure_data_dirs()
            for image_bytes, thumb_bytes, w, h in images:
                fname = f"{new_id()}.png"
                tname = f"{new_id()}.jpg"
                img_path = settings.data_path / "outputs" / fname
                thumb_path = settings.data_path / "thumbnails" / tname
                img_path.write_bytes(image_bytes)
                thumb_path.write_bytes(thumb_bytes)

                metadata = {
                    "prompt": job["prompt"],
                    "negative_prompt": job["negative_prompt"],
                    "seed": job["seed"],
                    "model": job["model"],
                    "engine": engine,
                    "workflow_version": job["workflow_version"],
                    "params": {"priority": job["priority"], "width": job["width"], "height": job["height"]},
                }
                self.gen_repo.add_artifact(
                    job_id=job_id,
                    character_id=job["character_id"],
                    image_path=str(img_path),
                    thumbnail_path=str(thumb_path),
                    width=w,
                    height=h,
                    metadata=metadata,
                )

            self.gen_repo.update_job_status(job_id, "completed", completed_at=_now())
        except Exception as e:
            err_msg = str(e)
            if "provider_unavailable" in err_msg:
                code = "provider_unavailable"
                msg = "Motor o proveedor no disponible"
            elif "content_policy" in err_msg:
                code = "content_policy"
                msg = "Prompt rechazado por la política de contenido"
            else:
                code = "provider_error"
                msg = "Falla del motor o proveedor"
            self.gen_repo.update_job_status(job_id, "failed", error_code=code, error_message=msg, completed_at=_now())

    async def retry_generation(self, job_id: str, confirm_cloud: bool) -> dict:
        job = self.gen_repo.get_job(job_id)
        if not job:
            raise ValueError("not_found")
        if job["status"] != "failed":
            raise ValueError("conflict")
        # Create new job
        dest = job["destination_requested"]
        if dest == "cloud" and not confirm_cloud:
            raise ValueError("confirmation_required")
        new_job = await self.create_generation(
            character_id=job["character_id"],
            prompt=job["prompt"],
            negative_prompt=job["negative_prompt"],
            destination=dest,
            priority=job["priority"],
            width=job["width"],
            height=job["height"],
            seed=job["seed"],
            confirm_cloud=confirm_cloud,
        )
        # Set retry_of
        conn_job = self.gen_repo.get_job(new_job["id"])
        # Update retry_of in DB
        from ..core.database import get_db
        conn = get_db()
        conn.execute("UPDATE generation_jobs SET retry_of = ? WHERE id = ?", (job_id, new_job["id"]))
        conn.commit()
        conn.close()
        return self.gen_repo.get_job(new_job["id"])

    async def cancel_generation(self, job_id: str) -> dict:
        job = self.gen_repo.get_job(job_id)
        if not job:
            raise ValueError("not_found")
        if job["status"] != "pending":
            raise ValueError("conflict")
        return self.gen_repo.cancel_job(job_id)

    async def consistency_batch(self, character_id: str, base_prompt: str | None,
                               destination: str, priority: str, confirm_cloud: bool) -> list[dict]:
        char = self.char_repo.get(character_id)
        if not char:
            raise ValueError("not_found")

        if destination == "cloud" and not confirm_cloud:
            raise ValueError("confirmation_required")

        prompts = [
            f"{base_prompt or 'Retrato de'} {char['name']}, {char['visual_description']}, close-up portrait, high detail",
            f"{base_prompt or 'Plano medio de'} {char['name']}, {char['visual_description']}, medium shot",
            f"{base_prompt or 'Cuerpo completo de'} {char['name']}, {char['visual_description']}, full body",
            f"{base_prompt or 'Escenario de'} {char['name']}, {char['visual_description']}, in a different setting",
        ]

        jobs = []
        seed = None
        import random
        seed = random.randint(0, 2**31 - 1)
        for p in prompts:
            j = await self.create_generation(
                character_id=character_id,
                prompt=p,
                negative_prompt="",
                destination=destination,
                priority=priority,
                width=768,
                height=768,
                seed=seed,
                confirm_cloud=confirm_cloud,
            )
            jobs.append(j)
        return jobs

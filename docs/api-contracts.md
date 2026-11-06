# Contrato de la API v1.1 — AI Creator Studio

Este documento es la fuente de verdad entre backend (FastAPI) y frontend (React).
Cualquier cambio se hace aquí primero. Todas las rutas cuelgan de `/api`.

**v1.1 (2026-10-28):** los datos, la sesión y los archivos pasan a Supabase (supabase.com). FastAPI valida la sesión de Supabase, orquesta la generación y guarda los resultados en Supabase Storage. Cambios respecto a v1.0: autenticación por `Authorization: Bearer`, URLs de archivos firmadas por Supabase, motor de nube concreto (Cloudflare Workers AI, sin validar), cuota diaria y regla `auto` ajustada. Las entidades y los endpoints de personajes, referencias, generaciones y galería no cambian de forma.

## Convenciones

- JSON UTF-8, claves en `snake_case`. Fechas ISO 8601 en UTC (`2026-10-27T15:30:00Z`).
- IDs: UUID v4 como string.
- **Autenticación:** cabecera `Authorization: Bearer <access_token>` con el token de sesión de Supabase Auth. Obligatoria en todas las rutas salvo `GET /api/health`. El servidor valida el token con Supabase (`GET {SUPABASE_URL}/auth/v1/user`, sin validar contra un proyecto real) y obtiene el `user_id`. Sin token válido o caducado → `401 unauthorized`. Cada usuario solo ve y modifica sus propios datos: el servidor filtra siempre por `user_id`, y las tablas de Supabase tienen RLS como segunda barrera. La clave `service_role` vive solo en el servidor (`.env`) y nunca llega al cliente.
- **Modo desarrollo sin Supabase:** con `ACS_ENV=development` y `SUPABASE_URL` vacío, el servidor usa un usuario fijo local y un almacén en memoria/disco, solo en `127.0.0.1`, y lo avisa en el arranque. Sirve para pruebas; no es un modo de producción.
- **Errores:** siempre con este formato, sin trazas ni rutas internas:

```json
{ "error": { "code": "validation_error", "message": "Texto legible en español", "details": [] } }
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `bad_request` | Petición mal formada |
| 401 | `unauthorized` | Falta o es inválida la clave |
| 403 | `confirmation_required` | Falta una confirmación explícita (nube, borrado, derechos de referencia) |
| 404 | `not_found` | Recurso inexistente |
| 409 | `conflict` | Estado incompatible (p. ej. reintentar una tarea no fallida) |
| 413 | `file_too_large` | Archivo supera `ACS_MAX_UPLOAD_MB` |
| 415 | `unsupported_media_type` | Tipo de archivo no permitido |
| 422 | `validation_error` | Campos inválidos (`details` lista campo y motivo) |
| 422 | `content_policy` | Prompt rechazado por la política de contenido |
| 429 | `rate_limited` | Límite por minuto o tareas simultáneas (cabecera `Retry-After`) |
| 429 | `quota_exceeded` | Se agotó la cuota diaria de generaciones en la nube (`ACS_DAILY_CLOUD_LIMIT`) |
| 502 | `provider_error` | Falla del motor local o de la nube (mensaje genérico, sin secretos) |
| 503 | `provider_unavailable` | Motor/proveedor no configurado o no disponible |
| 500 | `internal_error` | Error no previsto. Mensaje genérico; el detalle solo va al log del servidor, sin claves ni prompts |

- **Paginación:** `limit` (defecto 50, máx. 200) y `offset` (defecto 0). Las listas devuelven `{ "items": [...], "total": N }`.
- **URLs de archivos:** los campos `image_url`, `thumbnail_url` y `url` son URLs absolutas `https://` firmadas por Supabase Storage (buckets privados). Se usan directo en `<img src>`. Caducan en 1 hora (`ACS_SIGNED_URL_TTL`); si dan error, se vuelve a pedir el recurso a la API, que genera una URL nueva. Los ejemplos de abajo con `/api/files/...` son de v1.0 y ya no se usan.

## Entidades

### Character
```json
{
  "id": "uuid",
  "name": "Luna",
  "visual_description": "Cabello rizado castaño, ojos verdes, pecas, piel morena clara",
  "invariant_traits": ["cabello rizado castaño", "ojos verdes", "pecas"],
  "notes": "",
  "gender": "female",
  "voice_profile": {
    "engine": "browser",
    "voice_name": "Google español",
    "preset": "calida",
    "rate": 0.95,
    "pitch": 1.10,
    "pause_ms": 200
  },
  "archived": false,
  "reference_count": 3,
  "created_at": "…", "updated_at": "…"
}
```
Reglas: `name` 1–80 caracteres, `visual_description` 0–2000, `invariant_traits` hasta 20 ítems de 1–120, `notes` 0–4000.
`gender` es opcional en la entrada (`female | male | neutral | unspecified`, por defecto `unspecified`) y determina la voz del personaje (chat y modo llamada). Si falta o es `unspecified`, el cliente lo infiere de `visual_description`, `name`, rasgos y notas.
`voice_profile` es opcional en la entrada y en la salida. Si es `null` o falta, el frontend usa el comportamiento actual (voz por género). Forma: `{ "engine": "browser", "voice_name": string | null, "preset": "calida" | "energica" | "serena" | "seria" | "custom", "rate": number (0.7–1.3), "pitch": number (0.7–1.5), "pause_ms": integer (0–600) }`. `engine` solo admite `"browser"` por ahora. Valores fuera de rango → 422. Se copia al duplicar el personaje. Compatible hacia atrás: los personajes sin `voice_profile` siguen funcionando.

### ReferenceImage
```json
{
  "id": "uuid", "character_id": "uuid",
  "url": "/api/files/references/<uuid>.png?exp=…&sig=…",
  "thumbnail_url": "/api/files/thumbnails/<uuid>.jpg?exp=…&sig=…",
  "width": 1024, "height": 1024,
  "source_note": "Procedencia y permiso de uso",
  "rights_confirmed": true,
  "origin_artifact_id": null,
  "created_at": "…"
}
```

### GenerationJob
```json
{
  "id": "uuid", "character_id": "uuid",
  "prompt": "…", "negative_prompt": "",
  "seed": 123456789,
  "width": 768, "height": 768,
  "priority": "balanced",
  "destination_requested": "auto",
  "destination_used": "mock",
  "engine": "mock",
  "model": "simulado-v1",
  "workflow_version": "1",
  "status": "pending",
  "error_code": null,
  "error_message": null,
  "attempts": 1,
  "retry_of": null,
  "provider_job_id": null,
  "artifacts": [],
  "created_at": "…", "started_at": null, "completed_at": null
}
```
- `status`: `pending` | `processing` | `completed` | `failed` | `cancelled`.
- `destination_requested`: `auto` | `local` | `cloud` | `mock`.
- `destination_used`: `local` | `cloud` | `mock` | `null` hasta que se asigna. **Es lo que la interfaz muestra al usuario como "dónde se procesó/procesará".**
- `priority`: `speed` | `balanced` | `quality`.
- `error_message`: mensaje seguro y legible; nunca claves, rutas ni trazas.

### GenerationArtifact
```json
{
  "id": "uuid", "job_id": "uuid", "character_id": "uuid",
  "image_url": "/api/files/outputs/<uuid>.png?exp=…&sig=…",
  "thumbnail_url": "/api/files/thumbnails/<uuid>.jpg?exp=…&sig=…",
  "width": 768, "height": 768,
  "selected": false,
  "note": "",
  "metadata": { "prompt": "…", "negative_prompt": "", "seed": 1, "model": "simulado-v1", "engine": "mock", "workflow_version": "1", "params": {} },
  "created_at": "…"
}
```

## Endpoints

### Salud y proveedores
| Ruta | Respuesta |
|---|---|
| `GET /api/health` (pública) | `{ "status": "ok", "version": "0.1.0", "time": "…" }` |
| `GET /api/providers/status` | `{ "local": {"enabled": false, "available": false, "detail": "…"}, "cloud": {"enabled": false, "provider": "cloudflare", "configured": false, "detail": "…"}, "mock": {"enabled": true, "detail": "Motor simulado para desarrollo"}, "limits": {"max_upload_mb": 8, "max_concurrent_jobs": 2, "rate_limit_per_minute": 60} }` — nunca incluye secretos. |

### Personajes
| Ruta | Descripción |
|---|---|
| `GET /api/characters?include_archived=false&q=&limit=&offset=` | Lista `{items: Character[], total}` |
| `POST /api/characters` | Crea. Cuerpo: `name`, `visual_description?`, `invariant_traits?`, `notes?`, `gender?` (`female`\|`male`\|`neutral`\|`unspecified`), `voice_profile?`. → `201 Character` |
| `GET /api/characters/{id}` | Ficha |
| `PATCH /api/characters/{id}` | Actualización parcial (incluye `archived`) |
| `POST /api/characters/{id}/duplicate` | Copia la ficha (sin referencias ni resultados), nombre `"<name> (copia)"`. → `201` |
| `DELETE /api/characters/{id}?confirm=true` | Borra personaje, referencias, trabajos y archivos. Sin `confirm=true` → `403 confirmation_required`. → `204` |

### Referencias
| Ruta | Descripción |
|---|---|
| `GET /api/characters/{id}/references` | `{items: ReferenceImage[], total}` |
| `POST /api/characters/{id}/references` | `multipart/form-data`: `file` (png/jpeg/webp), `source_note` (obligatorio, 3–500), `rights_confirmed` (debe ser `true`, si no → `403 confirmation_required`). → `201 ReferenceImage` |
| `POST /api/characters/{id}/references/from-artifact` | JSON `{ "artifact_id", "source_note" }`: guarda un resultado como referencia (Seleccionar y guardar referencias representativas). → `201` |
| `DELETE /api/references/{id}?confirm=true` | Borra la referencia y su archivo. → `204` |

Validación de subida: tipo real verificado con Pillow (no solo la extensión), máximo `ACS_MAX_UPLOAD_MB`, dimensiones máx. 8192 px, se reencoda y se eliminan metadatos EXIF, nombre de archivo generado por el servidor (UUID). Se ignora el nombre original.

### Generaciones
| Ruta | Descripción |
|---|---|
| `POST /api/generations` | Crea la tarea. Cuerpo: `character_id`, `prompt` (1–2000), `negative_prompt?` (0–1000), `destination?` (defecto `auto`), `priority?` (defecto `balanced`), `width?`/`height?` (256–1536, múltiplos de 64, defecto 768), `seed?` (entero ≥ 0; si falta, el servidor genera uno y lo devuelve), `confirm_cloud?` (bool). → `202 GenerationJob` |
| `GET /api/generations/{id}` | Estado y artefactos |
| `GET /api/generations?character_id=&status=&limit=&offset=` | Lista de trabajos (más recientes primero) |
| `POST /api/generations/{id}/retry` | Solo si `failed` (si no → `409`). Crea un trabajo nuevo con `retry_of`. Si el destino es nube exige `confirm_cloud: true` en el cuerpo. → `202` |
| `POST /api/generations/{id}/cancel` | Solo si `pending` (si no → `409`). → `200 GenerationJob` |
| `POST /api/characters/{id}/consistency-batch` | Crea 4 trabajos con la misma semilla y parámetros para evaluar consistencia: retrato, plano medio, cuerpo completo y escenario distinto. Cuerpo: `base_prompt?`, `destination?`, `priority?`, `confirm_cloud?`. → `202 { "jobs": GenerationJob[] }` |

**Reglas de enrutamiento (obligatorias):**
1. `destination=local`: exige motor local habilitado y disponible; si no → `503 provider_unavailable`.
2. `destination=cloud`: exige nube habilitada y configurada **y** `confirm_cloud=true`; si falta la confirmación → `403 confirmation_required`; si no está configurada → `503`.
3. `destination=mock`: motor simulado (desarrollo/pruebas). Siempre disponible.
4. `destination=auto`: usa local si está habilitado y disponible; si no, usa la nube **solo si** el dueño del servidor activó `ACS_ALLOW_CLOUD_AUTO=true` (por defecto `false`) y la nube está configurada; si no, usa mock. En `auto` por nube solo viaja el texto del prompt, nunca imágenes de referencia.
5. Las imágenes de referencia nunca se envían a un motor de nube sin `confirm_cloud=true`. El motor de nube actual (Cloudflare, FLUX.1 schnell) no declara soporte de referencias (`supports_references=false`), así que no las recibe aunque se confirme; el trabajo guarda en `metadata.params.references_sent=false`.
8. Cuota: las generaciones en la nube cuentan contra `ACS_DAILY_CLOUD_LIMIT` por usuario y día UTC (defecto 50, conservador; el cupo gratuito real de Cloudflare no está confirmado). Al superarlo → `429 quota_exceeded`.
6. Reintentos automáticos: máximo 2 por errores transitorios en local/mock, **ninguno** automático en nube (evita duplicar tareas con coste). El usuario puede usar `/retry`.
7. Tareas simultáneas limitadas por `ACS_MAX_CONCURRENT_JOBS`; el resto queda `pending` en cola. El límite por minuto devuelve `429`.

**Política de contenido mínima:** el servidor rechaza con `422 content_policy` prompts que combinen contenido sexual con menores de edad. Es un primer filtro, no una moderación completa (ver `docs/security.md`).

### Galería y resultados
| Ruta | Descripción |
|---|---|
| `GET /api/gallery?character_id=&status=&engine=&selected=&date_from=&date_to=&limit=&offset=` | `{items: GalleryItem[], total}`. `GalleryItem` = `GenerationArtifact` + `character_name`, `engine`, `destination_used`, `job_status`, `job_created_at`. Más recientes primero. |
| `GET /api/artifacts/{id}` | Un artefacto con metadatos |
| `PATCH /api/artifacts/{id}` | Cuerpo: `selected?`, `note?` (0–1000) |
| `DELETE /api/artifacts/{id}?confirm=true` | Borra imagen y miniatura. → `204` |

### Video, baile y faceswap (scaffolding)
Estos endpoints existen para que el frontend pueda ofrecer las opciones, pero **ningún motor los implementa todavía**: requieren una instancia local de ComfyUI con GPU. Mientras no haya proveedor disponible, responden `503 provider_unavailable`. Los cuerpos se validan con `422` si son inválidos.

| Ruta | Descripción |
|---|---|
| `POST /api/videos` | Crea un trabajo de video. Cuerpo: `character_id`, `prompt` (1–2000), `negative_prompt?` (0–1000), `duration_seconds?` (1–10, defecto 3), `fps?` (8–30, defecto 16), `width?`/`height?` (256–1024, múltiplos de 64, defecto 512), `seed?`, `destination?` (solo `local` por ahora), `confirm_cloud?` (bool). → `202 VideoJob` o `503 provider_unavailable`. |
| `GET /api/videos/{id}` | Estado del trabajo de video. |
| `GET /api/videos?character_id=&status=&limit=&offset=` | Lista de trabajos de video. |
| `POST /api/dances` | Crea un video de baile a partir de una imagen de referencia. Cuerpo: `character_id`, `reference_image_id` (uuid), `motion_preset?` (`wave \| nod \| dance \| idle`, defecto `idle`), `duration_seconds?` (1–10, defecto 3), `seed?`, `destination?`. → `202 VideoJob` o `503`. |
| `POST /api/faceswaps` | Crea un faceswap sobre una imagen. Cuerpo: `source_image_id` (uuid de artefacto o referencia), `target_image_id` (uuid), `destination?`. → `202 FaceswapJob` o `503`. |

`VideoJob` = `{ "id", "user_id", "character_id", "kind": "video"\|"dance", "status", "params", "result_url", "error_code", "error_message", "created_at", "completed_at" }`.
`FaceswapJob` = `{ "id", "user_id", "kind": "faceswap", "status", "params", "result_url", "error_code", "error_message", "created_at", "completed_at" }`.

Hasta que exista un motor con GPU, todos los `POST` devuelven `503 provider_unavailable` con el mensaje "No hay un motor de video disponible. Se requiere ComfyUI con GPU." El frontend muestra esta opción como "Próximamente".

### Archivos (Supabase Storage)
Ya no existe `GET /api/files/...`. Los archivos viven en buckets privados de Supabase: `references`, `outputs`, `thumbnails`, con rutas `<user_id>/<uuid>.<ext>`. El servidor sube los archivos con `service_role` y entrega URLs firmadas de 1 hora. Un usuario solo puede leer los objetos de su carpeta (políticas de Storage). Las subidas se validan igual que en v1.0 (Pillow, reencode, sin EXIF, nombre UUID).

## Datos (Supabase Postgres)

Tablas: `characters`, `reference_images`, `generation_jobs`, `generation_artifacts`, `usage_daily`. Todas con columna `user_id uuid references auth.users` y RLS activa (`user_id = auth.uid()`). El esquema está en `supabase/schema.sql`. Borrar un personaje borra en cascada sus filas y el servidor elimina los objetos de Storage.

## Motores (adaptadores)

Interfaz común en el backend (`ImageEngine`): `name`, `supports_references`, `is_available() -> (bool, detalle)`, `generate(request) -> list[bytes de imagen] + metadatos`. Implementaciones:

- `mock` — imagen determinista (según semilla y prompt) con Pillow, marcada «SIMULADO». Permite probar todo el flujo sin GPU ni red.
- `cloudflare` — Cloudflare Workers AI, modelo FLUX.1 schnell (texto a imagen), con `ACS_CLOUDFLARE_ACCOUNT_ID` y `ACS_CLOUDFLARE_API_TOKEN`. Desactivado por defecto. Cupo gratuito (según una guía secundaria, 10 000 Neurons/día) **sin verificar en la documentación oficial**. **No validado contra la API real en esta entrega.** No soporta semilla ni referencias garantizadas: la semilla se guarda en los metadatos pero el motor puede ignorarla.
- `comfyui` — habla con `ACS_COMFYUI_URL` (`/prompt`, `/history`, `/view`) usando el flujo JSON de `workflows/image-generation/`. Desactivado por defecto. **No validado contra una instancia real en esta entrega.**
- Seedream y otros proveedores de pago quedan fuera por ahora.

`openjarvis/` y `llm_router/` son carpetas reservadas (fase 9); no se implementan en este prototipo.

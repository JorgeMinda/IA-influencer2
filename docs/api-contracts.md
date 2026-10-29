# Contrato de la API v1 — AI Creator Studio

Este documento es la fuente de verdad entre backend (FastAPI) y frontend (React).
Cualquier cambio se hace aquí primero. Todas las rutas cuelgan de `/api`.

## Convenciones

- JSON UTF-8, claves en `snake_case`. Fechas ISO 8601 en UTC (`2026-10-27T15:30:00Z`).
- IDs: UUID v4 como string.
- **Autenticación:** modo dual. (a) **Desarrollo / un solo usuario:** cabecera `X-API-Key`. Si `ACS_API_KEY` está definida, es obligatoria en todas las rutas salvo `GET /api/health` y `GET /api/files/...` (un `<img src>` no puede enviar cabeceras; los archivos se autorizan solo con su firma temporal, ver «Archivos»). Sin clave válida → `401 unauthorized`. Si `ACS_API_KEY` está vacía, el servidor solo debe aceptar conexiones desde `127.0.0.1` y avisar en el arranque. (b) **Producción multiusuario (Supabase):** cabecera `Authorization: Bearer <jwt>` emitido por Supabase Auth. El backend valida el JWT con `ACS_SUPABASE_SERVICE_ROLE_KEY` y extrae el `user_id`. Todas las entidades se filtran por `user_id` (RLS en Supabase o filtro en el backend). Si ambos `ACS_API_KEY` y Supabase están configurados, Supabase tiene prioridad.
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
| 502 | `provider_error` | Falla del motor local o de la nube (mensaje genérico, sin secretos) |
| 503 | `provider_unavailable` | Motor/proveedor no configurado o no disponible |
| 500 | `internal_error` | Error no previsto. Mensaje genérico; el detalle solo va al log del servidor, sin claves ni prompts |

- **Paginación:** `limit` (defecto 50, máx. 200) y `offset` (defecto 0). Las listas devuelven `{ "items": [...], "total": N }`.
- **URLs de archivos:** los campos `image_url`, `thumbnail_url` y `url` son rutas relativas al servidor (empiezan por `/api/files/`) con firma temporal (`?exp=<unix>&sig=<hmac>`). Se pueden usar directo en `<img src>` anteponiendo la URL base. Caducan en 1 hora; si dan 403, se vuelve a pedir el recurso a la API.

## Entidades

### Character
```json
{
  "id": "uuid",
  "user_id": "uuid | null",
  "name": "Luna",
  "visual_description": "Cabello rizado castaño, ojos verdes, pecas, piel morena clara",
  "invariant_traits": ["cabello rizado castaño", "ojos verdes", "pecas"],
  "notes": "",
  "archived": false,
  "reference_count": 3,
  "created_at": "…", "updated_at": "…"
}
```
Reglas: `name` 1–80 caracteres, `visual_description` 0–2000, `invariant_traits` hasta 20 ítems de 1–120, `notes` 0–4000.

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
  "id": "uuid", "user_id": "uuid | null", "character_id": "uuid",
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
| `GET /api/providers/status` | `{ "local": {"enabled": false, "available": false, "detail": "…"}, "cloud": {"enabled": false, "provider": "ninguno", "configured": false, "detail": "…"}, "mock": {"enabled": true, "detail": "Motor simulado para desarrollo"}, "limits": {"max_upload_mb": 8, "max_concurrent_jobs": 2, "rate_limit_per_minute": 60} }` — nunca incluye secretos. |

### Personajes
| Ruta | Descripción |
|---|---|
| `GET /api/characters?include_archived=false&q=&limit=&offset=` | Lista `{items: Character[], total}` |
| `POST /api/characters` | Crea. Cuerpo: `name`, `visual_description?`, `invariant_traits?`, `notes?`. → `201 Character` |
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
4. `destination=auto`: usa local si está habilitado y disponible; si no, usa mock. **Nunca usa la nube** (no se envían imágenes privadas a un tercero sin elección informada).
5. Si hay referencias del personaje y el destino es nube, solo se envían si el usuario confirmó con `confirm_cloud=true`.
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

### Archivos
`GET /api/files/{kind}/{filename}?exp=&sig=` — `kind` ∈ `references`, `outputs`, `thumbnails`. Verifica la firma HMAC y la caducidad; protege contra recorrido de rutas (`..`, rutas absolutas). Devuelve el archivo con `Cache-Control: private, max-age=300` y `X-Content-Type-Options: nosniff`. Firma/caducidad inválida → `403`; archivo inexistente → `404`.

**Almacenamiento:** el backend puede usar disco local (prototipo) o **Supabase Storage** (producción). En modo Supabase, los archivos se suben a buckets `references`, `outputs` y `thumbnails`. El backend genera URLs firmadas (HMAC, como arriba) que proxeen el archivo desde Supabase Storage, o devuelve signed URLs de Supabase directamente. El frontend no distingue entre ambos: usa `fileUrl()` igual. La migración de disco a Supabase no rompe el contrato.

## Configuración de Supabase (producción)

Variables de entorno del backend:
```
ACS_SUPABASE_URL=https://xxx.supabase.co
ACS_SUPABASE_ANON_KEY=eyJ...
ACS_SUPABASE_SERVICE_ROLE_KEY=eyJ...   # solo backend, nunca al cliente
```

**Buckets de Storage:**
| Bucket | Uso | Público |
|---|---|---|
| `references` | Imágenes de referencia de personajes | No (signed URLs) |
| `outputs` | Imágenes generadas | No (signed URLs) |
| `thumbnails` | Miniaturas | No (signed URLs) |

**RLS (Row Level Security):** cada tabla (`characters`, `reference_images`, `generation_jobs`, `generation_artifacts`) tiene política `user_id = auth.uid()`. En modo desarrollo (sin Supabase), `user_id` es `null` y no se aplica filtro.

**Auth en el frontend:** el cliente usa el SDK de Supabase (`@supabase/supabase-js`) para login/registro. El JWT se envía como `Authorization: Bearer <token>`. El backend valida el token y extrae `user_id`. Si Supabase no está configurado, se usa `X-API-Key` como antes.

**Realtime (opcional, v2):** Supabase Realtime puede notificar cambios de estado de jobs en tiempo real, reemplazando el polling del frontend. No se implementa en v1; se mantiene polling con `useJobPolling`.

## Motores (adaptadores)

Interfaz común en el backend (`ImageEngine`): `name`, `is_available() -> (bool, detalle)`, `generate(request) -> list[bytes de imagen] + metadatos`. Implementaciones:

- `mock` — genera una imagen determinista (según semilla y prompt) con Pillow, marcada visualmente como "SIMULADO". Permite probar todo el flujo sin GPU.
- `comfyui` — habla con `ACS_COMFYUI_URL` (`/prompt`, `/history`, `/view`) usando el flujo JSON de `workflows/image-generation/`. Desactivado por defecto. **No validado contra una instancia real en esta entrega.**
- `cloud_images` — adaptador genérico por proveedor, desactivado por defecto. Sin proveedor elegido hasta revisar cuota, privacidad y condiciones.

`openjarvis/` y `llm_router/` son carpetas reservadas (fase 9); no se implementan en este prototipo.

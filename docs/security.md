# Seguridad — AI Creator Studio (estado a 2026-11-01)

Marcas: ✅ probado con pruebas automáticas aquí · 🟡 escrito, sin probar contra servicios reales · ⬜ pendiente.

| Control | Estado | Notas |
|---|---|---|
| Aislamiento por usuario (todas las consultas filtran por `user_id`) | ✅ | `tests/test_service.py` (usuario 2 no ve ni modifica datos del usuario 1) |
| RLS en Supabase (segunda barrera) | 🟡 | `supabase/schema.sql`, sin ejecutar en un proyecto real |
| Validación de sesión con Supabase Auth | 🟡 | Lógica y caché probadas con respuestas simuladas; falta probar con un proyecto real |
| `service_role` solo en el servidor | 🟡 | Solo se lee del `.env` del backend; no hay revisión del frontend todavía |
| Buckets privados y URLs firmadas de 1 h | 🟡 | Formas de petición probadas con simulación; sin validar contra Storage real |
| Subidas: tipo real, tamaño, dimensiones, sin EXIF, nombre UUID | ✅ | PNG/JPEG/WebP; GIF y no-imágenes rechazadas; EXIF eliminado |
| Consentimiento de derechos para referencias | ✅ | `rights_confirmed` obligatorio |
| Nube: confirmación, cuota diaria, sin referencias, sin reintentos automáticos | ✅ | Con el motor de nube simulado; la API real no está validada |
| Errores sin claves ni trazas | ✅ | Mensajes de motores y almacén probados sin filtrar secretos |
| Límite por minuto (429) | ✅ | En memoria, un solo proceso |
| Política de contenido mínima | ✅ | Solo bloquea sexual + menores por palabras clave. NO es moderación completa |
| CORS restringido a orígenes configurados | 🟡 | Sin probar en navegador |
| Capa FastAPI (validación de cuerpos, manejadores de error) | 🟡 | `app/main.py` no se ha ejecutado |

## Pendiente
- ⬜ Revisión independiente de seguridad (un revisor que no escribió el código).
- ⬜ Tareas atascadas en `processing` si el servidor se reinicia (no hay recuperación al arrancar).
- ⬜ Límite por minuto compartido entre procesos (si se despliega con varios).
- ⬜ Moderación de contenido más allá de palabras clave; revisar términos de uso de Cloudflare y de cualquier proveedor.
- ⬜ HTTPS o túnel para acceder desde el teléfono.
- ⬜ Rotar claves si alguna se pega por error en un chat, log o commit.

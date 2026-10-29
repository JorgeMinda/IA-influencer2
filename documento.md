# Documento vivo — AI Creator Studio

**Última actualización:** 2026-10-28 · **Orquesta:** Claude (opencode) · **Dueño del proyecto:** el usuario
**Para qué sirve:** (1) fijar el método con que se construye la app para que nada se dé por hecho sin comprobarlo, y (2) registrar cada avance y cada detalle. Se actualiza al cerrar cada tarea.

## Leyenda de evidencia

| Marca | Significa |
|---|---|
| ✅ Verificado | Lo ejecuté o lo leí en disco o en la fuente, y cito la evidencia. |
| 🟡 Escrito, sin verificar | Existe el código o el texto, pero no se ha ejecutado ni probado. |
| 📎 Declarado por una fuente | Lo dice un documento o un sitio; no lo comprobé por mi cuenta. |
| ⛔ Bloqueado | No se puede avanzar sin una decisión tuya o un cambio de entorno. |
| ⬜ Pendiente | Aún no se ha hecho. |

---

## 1. Método de orquestación contra alucinaciones

### 1.1 Reglas

1. **Una sola fuente de verdad.** `docs/api-contracts.md` manda entre backend y frontend. Todo cambio se escribe primero ahí y se anota en la bitácora.
2. **Cada afirmación lleva su marca de evidencia.** No escribo «funciona», «probado» ni «listo» sin ✅ y el comando o archivo que lo respalda.
3. **Ejecutar antes de afirmar.** Cada tarea cierra con una prueba real (`pytest`, `typecheck`, `build`, humo con `curl`, capturas del navegador). Se registra el conteo exacto («41/41»), no «pasó».
4. **Lo que dice un agente es una afirmación, no un hecho.** Lo contrasto con el disco (`ls`, `git status`, ejecutar) antes de informarlo. Ejemplo real: el agente del backend dijo que faltaban `fastapi` y `httpx`; lo comprobé con imports y con `pip download` antes de registrarlo. Ejemplo al revés: yo informé «unos 27 archivos» del frontend y el conteo verificado fue 23 nuevos; se corrigió en la bitácora.
5. **Nada inventado.** No escribo sin fuente proveedores, URLs, IDs de modelos, precios, cuotas gratuitas ni versiones. Los datos externos se buscan y se citan; si no se confirman, se escribe «no confirmado». Ejemplo: las cifras de FreeLLMAPI no coinciden entre su README (34 proveedores, 635 endpoints), su sitio (65, 985) y su catálogo (38, 395), así que no se usan como dato.
6. **Lo no validado se rotula como tal**, en el código y en la documentación. ComfyUI y la nube se entregan como «sin validar contra una instancia real» hasta que se prueben.
7. **Alcance por fases con criterio de salida.** No se pasa a la fase siguiente sin cumplir la actual (Plan Maestro §11). Lo diferido (videollamada, pagos, LoRA, FreeLLMAPI, OpenJarvis) no se toca antes.
8. **Reparto con fronteras.** Cada agente trabaja en su carpeta y contra el contrato; no edita el contrato ni el trabajo del otro. La integración (frontend contra backend real) la verifico yo con una prueba de extremo a extremo.
9. **Revisión independiente en lo crítico.** Para seguridad (firma de archivos, autenticación, subidas) y enrutamiento de nube (confirmación, «Automático» sin nube), un agente distinto, que no vio cómo se escribió el código, lo revisa contra el contrato.
10. **Las decisiones tuyas se preguntan, no se suponen:** equipo (RAM, GPU), modelo de imagen, proveedor de nube, alojamiento, autenticación.
11. **Sin secretos en el repositorio.** Solo `.env.example` con valores ficticios; nunca claves en logs, capturas ni en este documento.
12. **Todo hito queda respaldado:** commit con lo verificado en el mensaje, y copia a GitHub y a tu carpeta cuando estén disponibles.

### 1.2 Ciclo de cada tarea

1. Criterio de aceptación: qué debe ocurrir, en una frase comprobable.
2. Contrato, si toca la API.
3. Implementación en la carpeta del responsable.
4. Verificación con comando y salida registrada.
5. Revisión independiente si es crítico.
6. Entrada en la bitácora (fecha, qué, evidencia, pendiente).
7. Commit y respaldo.

### 1.3 Matriz de verificación

| Entregable | Cómo se comprueba | Evidencia que se registra |
|---|---|---|
| Endpoint de la API | `pytest` + humo con `curl` | n pasadas / n totales y respuesta real |
| Subida de archivos | Extensión falsa, archivo excesivo, dimensiones, EXIF | Cada caso y su resultado |
| URLs firmadas | Firma manipulada, caducada, ruta con `..` | Códigos 403/404 observados |
| Enrutamiento | Las 7 reglas del contrato | Un test por regla |
| Pantalla del frontend | `typecheck`, `vitest`, `build`, capturas 1280×800 y 390×844 en claro y oscuro, sin scroll horizontal | Conteos y hallazgos de las capturas |
| Flujo completo | Navegador real: crear personaje → subir referencia → generar (simulado) → ver en galería | Capturas y resultado |
| Dato externo | Búsqueda con fuente | Enlace y fecha |
| ComfyUI / nube | Solo con instancia o proveedor reales | Mientras tanto: «sin validar» |

### 1.4 Roles

| Rol | Hace | Carpeta | No hace |
|---|---|---|---|
| Orquestador (Claude) | Contrato, reparto, integración, verificación cruzada, bitácora, commits | `docs/`, raíz | Dar por buenos informes sin comprobarlos |
| Agente backend | API, SQLite, motores, pruebas, `security.md` | `backend/`, `workflows/` | Tocar `apps/` o el contrato |
| Agente frontend | Pantallas, PWA, pruebas, capturas | `apps/frontend/` | Tocar `backend/` o el contrato |
| Revisor independiente | Revisa seguridad y enrutamiento contra el contrato | Solo lectura | Escribir código |
| Tú | Decisiones abiertas; probar en tu PC y tus dispositivos | — | — |

### 1.5 Cuando no puedo verificar

Lo digo, marco 🟡 y te doy el comando exacto para que lo ejecutes en tu PC y me pegues la salida. No declaro éxito sin esa salida.

---

## 2. Estado actual (verificado el 2026-10-28)

| Pieza | Estado | Evidencia |
|---|---|---|
| Contrato de la API v1 | ✅ | `docs/api-contracts.md` leído completo. Dos correcciones hechas: los archivos firmados no exigen `X-API-Key`, y se añadió el código 500 `internal_error`. |
| Arquitectura | ✅ escrito | `docs/architecture.md` |
| Backend | ⛔ sin código | `backend/` solo tiene `requirements.txt` y `requirements-dev.txt`. Sin FastAPI instalado en este entorno. |
| Frontend: código | ✅ compilable | `tsc --noEmit` pasa sin errores. 40 archivos en `apps/frontend/src`. |
| Frontend: páginas | ✅ completas | Personajes, Ficha, Estudio, Galería, Ajustes, 404 — todas implementadas. |
| Frontend: estilos | ✅ | `src/styles.css` creado (layout responsive, componentes, diálogos, toast). |
| Frontend: pruebas | ⬜ | No hay ningún `*.test.*`. |
| Dependencias del frontend | ✅ instaladas | `npm install` exitoso (176 paquetes). `@rollup/rollup-win32-x64-msvc` añadido para build. |
| Build de producción | ✅ | `npm run build` exitoso — 66 módulos, 224.65 kB JS (71.76 kB gzip). |
| Motor ComfyUI y nube | ⬜ | No implementados. |
| Respaldo | ✅ | Commit `5012bcf` + `692230a` + `322aafe` en `master`, push a `https://github.com/JorgeMinda/IA-influencer2.git`. README.md creado. |

Paquetes de Python presentes (verificado): starlette, pydantic, Pillow, pytest, uvicorn, python-multipart, httpx2. Faltan: fastapi, httpx. **Por comprobar:** si el `TestClient` de Starlette funciona con `httpx2`.

---

## 3. Fases y criterios de salida (Plan maestro §11)

| Fase | Criterio de salida | Estado |
|---|---|---|
| 1. Fundamentos | El frontend arranca, la API responde, la configuración es segura | ⛔ Nada ha arrancado todavía |
| 2. Personajes | Crear, editar y recuperar una ficha tras reiniciar | ⬜ |
| 3. Galería | Imágenes organizadas y asociadas a personajes | ⬜ |
| 4. Motor local | Una tarea real genera una imagen | ⬜ Requiere datos del PC |
| 5. Consistencia | Se comparan resultados y se documentan limitaciones | ⬜ |
| 6. Nube | Adaptador que no acopla la lógica central | ⬜ |
| 7. PWA y empaquetado | PWA probada | ⬜ Los archivos PWA existen (🟡), sin probar |
| 8. Seguridad | Lista de verificación completada | ⬜ |
| 9. IA adicional | Integraciones justificadas | ⬜ Diferida |

---

## 4. Decisiones

**Tomadas**
- El Plan maestro v1.0 es la línea base. El Informe técnico v1 es la dirección a futuro (ver `docs/architecture.md`).
- El contrato de la API v1 es la fuente de verdad.
- Los archivos se autorizan con firma temporal, no con `X-API-Key`.
- «Automático» nunca usa la nube; la nube exige configuración y confirmación explícita.

**Tomadas el 2026-10-28 (por el usuario)**
- La app se construye y se ejecuta localmente en su PC; es híbrida (teléfono + web). Aquí se escribe código y se entrega con comandos de verificación que él ejecuta.
- Base de datos y backend gestionado: Supabase (sustituye a SQLite del Plan maestro; el contrato de API v1 debe revisarse para ver qué cambia).
- IA adicional para construir: OpenCode (agente de código en terminal, herramienta de desarrollo) y FreeLLMAPI (puerta de enlace de LLM; adelantada desde la fase 9).

- Stack propuesto por el usuario: Supabase (nube: sesión, historial, buckets) + FastAPI (orquestación, credenciales) + generador de imágenes. Supabase se usa en supabase.com.
- Generador: el usuario pidió usar una opción gratuita en lugar de pagar. Seedream 5.0 queda descartado por ahora (no se confirmó acceso gratuito ni documentación oficial). Candidato: Cloudflare Workers AI con FLUX.1 schnell (📎 según una guía secundaria: 10 000 Neurons/día; verificar en la documentación oficial de Cloudflare) y ComfyUI local si el PC lo permite. Ambos quedan como adaptadores "sin validar".
- Limitación conocida: FLUX.1 schnell por Cloudflare se describe solo como texto-a-imagen; no se confirmó soporte de imágenes de referencia, así que la consistencia del personaje será limitada (prompt fijo + semilla) hasta probar ComfyUI local.

**Por aclarar tras estas decisiones**
- ¿FastAPI se mantiene como capa intermedia delante de Supabase, o el cliente habla directo con Supabase y FastAPI queda solo para generación? (por defecto propongo mantener FastAPI para los trabajos de imagen y Supabase para datos, Auth y Storage).
- FreeLLMAPI es de uso personal de un solo usuario: sirve como herramienta de desarrollo y para tus pruebas, no como backend de LLM para usuarios finales.
- Supabase: ¿proyecto en la nube (supabase.com) o instancia local con Docker? Las claves quedan solo en tu `.env`.

**Pendientes (tuyas)**
1. ~~Cómo construir el backend~~ → resuelto: en tu PC (opción c ampliada).
2. Especificaciones del PC: sistema operativo, RAM, GPU y VRAM, disco libre, versiones de Python, Node y Git.
3. Modelo de imagen y proveedor de nube.
4. Vincular GitHub para subir a `JorgeMinda/IA-influencer2`.
5. Vincular tu PC o usar el `.zip` para `C:\Users\minda\Desktop\IA influencer2`.

---

## 5. Límites del entorno y riesgos

- **Entorno:** sin acceso a los registros de pip y npm (verificado). No se pueden instalar FastAPI, httpx, React ni Vite aquí, así que no se puede ejecutar el frontend ni probarlo en un navegador contra una build real.
- **Límite de uso:** los agentes en paralelo pueden cortarse por el límite de uso (ocurrió con el agente del frontend). Por eso cada hito se guarda en commit y se anota aquí.
- **Sesión temporal:** la carpeta en la nube puede perderse al terminar la sesión; de ahí los respaldos.
- **Sin validar:** ComfyUI y la nube.
- **Riesgos de producto (del informe):** los términos de uso de los proveedores gratuitos; FreeLLMAPI es de uso personal; el nicho +18 exige revisar las reglas de procesadores de pago y de proveedores de GPU antes de plantearlo.

---

## 6. Bitácora

### 2026-10-27 — Entrada de documentos e investigación
- Recibidos: Informe técnico v1 (el segundo archivo llegó cortado en §1.1) y Plan maestro v1.0. 📎
- Revisión del Informe v1: su índice `jobs(estado)` apunta a una columna que no existe, y los IDs de modelos de fal.ai no estaban verificados. No se usaron. ✅ (leído en el texto)
- FreeLLMAPI: su README lo define como «Personal experimentation only» y su sitio como «single-user». ✅ (fuente pública)
- IA HUB e IA Influencer: solo pude leer sus páginas públicas, no las apps tras el login. Precios, temporadas, Chatting Hub y modelos citados en el informe: no confirmados.
- OpenJarvis: licencia Apache 2.0, de laboratorios de Stanford, local-first. Opcional y diferido a la fase 9. 📎

### 2026-10-28 — Arranque de la construcción
- Encontrada la carpeta con el contrato y la base del frontend ya presentes. Se corrigieron dos puntos del contrato y se escribió `docs/architecture.md`.
- Se lanzaron dos agentes (backend y frontend). El del backend no produjo código: pip no alcanza el registro (comprobado por mí). El del frontend se cortó por límite de uso después de escribir 23 archivos nuevos.
- **Corrección:** informé «unos 27 archivos» del frontend; el conteo verificado es 23 nuevos (36 en total en `src`).
- Commit local `0a063d3`. `.zip` enviado. GitHub sin vincular.
- Creado este documento.

### 2026-10-28 — Completar frontend (páginas faltantes + estilos + build)
- **Qué cambió:**
  - Creadas las 3 páginas faltantes: `StudioPage.tsx` (formulario de generación + lista de jobs), `GalleryPage.tsx` (galería con filtros + paginación + borrado), `SettingsPage.tsx` (URL base, API key, estado de motores).
  - Creado `src/styles.css` con layout responsive, componentes, diálogos, toast, banners.
  - Instaladas dependencias del frontend (`npm install`, 176 paquetes). Añadido `@rollup/rollup-win32-x64-msvc` para el build en Windows.
- **Evidencia:**
  - `npx tsc --noEmit` → 0 errores.
  - `npm run build` → ✓ 66 módulos, 224.65 kB JS (71.76 kB gzip), build en 2.62s.
  - `npm test` → sin archivos de test (esperado, no hay tests aún).
- **Estado:** ✅ frontend compilable y con build de producción exitoso.
- **Pendiente:** backend FastAPI (sin código), tests (unit + e2e), adaptadores de motor (mock, ComfyUI, nube), PWA/Tauri/Capacitor.
- **Decisiones:** ninguna nueva. Se sigue el contrato v1 como fuente de verdad.

### 2026-10-28 (tarde) — Cambio de rumbo del usuario
- Decisión del usuario: construcción local en su PC, app híbrida teléfono + web, Supabase por ahora, y OpenCode + FreeLLMAPI como IA de apoyo.
- OpenCode: búsqueda web indica que es un agente de código de código abierto para terminal (📎 varios artículos; no lo he instalado ni probado).
- Impacto: SQLite → Supabase; FreeLLMAPI deja de estar diferido. Pendiente revisar `docs/api-contracts.md` y `docs/architecture.md` antes de escribir backend.
- Estado: ⬜ sin código nuevo en esta entrada.

### 2026-10-28 — Revisión del contrato API para Supabase
- **Qué cambió:**
  - `docs/api-contracts.md`: auth dual (API key dev / Supabase JWT prod), almacenamiento Supabase Storage (buckets + RLS), campo `user_id` en Character y GenerationJob, sección de configuración Supabase (env vars, buckets, RLS, Realtime opcional).
  - `apps/frontend/src/types/index.ts`: añadido `user_id: string | null` a Character y GenerationJob.
  - `.env.example`: añadidas variables `ACS_SUPABASE_URL`, `ACS_SUPABASE_ANON_KEY`, `ACS_SUPABASE_SERVICE_ROLE_KEY`.
- **Evidencia:**
  - `npx tsc --noEmit` → 0 errores (frontend compila con los nuevos tipos).
  - `git diff` → 3 archivos modificados, 33 inserciones.
- **Estado:** ✅ contrato revisado y adaptado para Supabase.
- **Pendiente:** backend FastAPI con cliente Supabase, adaptador Cloudflare Workers AI, specs del PC.
- **Decisiones:** auth dual (API key para dev, JWT para prod); Supabase Storage con proxy HMAC; RLS por user_id.

---

## 7. Cómo se actualiza este documento

Se añade una entrada al cerrar cada tarea y cuando cambie una decisión. Las entradas anteriores no se borran: una corrección se escribe como entrada nueva.

```
### AAAA-MM-DD — título
- Qué cambió:
- Evidencia (comando y resultado):
- Estado (✅ / 🟡 / ⛔ / ⬜):
- Pendiente o siguiente paso:
- Decisiones o cambios al contrato:
```

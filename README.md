# AI Creator Studio (Estudio de Creación de IA)

Plataforma para crear personajes virtuales, generar imágenes consistentes y conversar con ellos (texto, voz y videollamada simulada).
- **Fase actual:** Web / PWA.
- **Fases futuras:** Escritorio Windows (Tauri) y Móvil Android / iOS (Capacitor).
- **Stack tecnológico:**
  - **Frontend:** React 18 + TypeScript + Vite + PWA
  - **Backend:** FastAPI (Python 3.12+)
  - **Plataforma de datos y nube:** Supabase (PostgreSQL con RLS, Supabase Auth y Supabase Storage)
  - **Motores de generación:**
    - `mock`: Motor simulado en memoria/disco con Pillow para desarrollo y pruebas rápidas sin GPU ni red.
    - `cloudflare`: Cloudflare Workers AI (FLUX.1 schnell para imagen y Llama 3.1 para chat).
    - `comfyui`: Instancia local de ComfyUI.
  - **Voz y llamada:** Web Speech API del navegador (TTS para la voz del personaje y STT para dictado). Sin backend ni costo. Requiere Chrome o Edge.

---

## Estructura del repositorio

```
ai-creator-studio/
├── apps/
│   └── frontend/          # React + TypeScript (Vite, PWA, Vitest)
├── backend/               # FastAPI, lógica de negocio y suite de pruebas pytest
├── docs/
│   ├── api-contracts.md   # Contrato de la API v1.1 (fuente de verdad)
│   ├── architecture.md    # Arquitectura del sistema y flujo de datos
│   ├── security.md        # Política de seguridad y manejo de credenciales
│   └── documento.md       # Documento vivo con método anti-alucinaciones y bitácora
├── supabase/
│   └── schema.sql         # Esquema de tablas, RLS, buckets de Storage y cuotas
├── .env.example           # Plantilla general de configuración
└── README.md
```

---

## Puesta en marcha en PC local (Windows / PowerShell)

### 1. Supabase (supabase.com)
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre el **SQL Editor** en tu panel de Supabase y ejecuta el script [`supabase/schema.sql`](file:///C:/Users/minda/Desktop/IA%20influencer2/supabase/schema.sql).
   - Si tu proyecto **ya existía** antes del 2026-11-05, ejecuta también [`supabase/migrations/2026-11-05_add_character_gender.sql`](file:///C:/Users/minda/Desktop/IA%20influencer2/supabase/migrations/2026-11-05_add_character_gender.sql) para añadir el campo de voz/género.
3. Asegúrate de tener creados los 3 buckets privados en **Storage**: `references`, `outputs` y `thumbnails`.
4. Copia tu URL de proyecto (`SUPABASE_URL`), la `anon key` y la `service_role key`.

---

### 2. Backend (FastAPI)

1. Abre PowerShell y entra a la carpeta del backend:
   ```powershell
   cd backend
   ```
2. Si aún no tienes tu archivo `.env`, copia `.env.example`:
   ```powershell
   copy ..\.env.example .env
   ```
   Rellena en `.env` las variables de Supabase:
   ```env
   SUPABASE_URL=https://<tu-id>.supabase.co
   SUPABASE_ANON_KEY=<tu-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>
   ```
3. Ejecutar las pruebas automatizadas (41/41 pruebas):
   ```powershell
   python -m pytest tests
   ```
4. Iniciar el servidor API de FastAPI:
   ```powershell
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   - API de salud: `http://127.0.0.1:8000/api/health`
   - Documentación interactiva (en desarrollo): `http://127.0.0.1:8000/api/docs`

---

### 3. Frontend (React + Vite)

1. Abre otra ventana de PowerShell y entra a la carpeta del frontend:
   ```powershell
   cd apps\frontend
   ```
2. Configura tu `.env`:
   ```powershell
   copy .env.example .env
   ```
   Asegúrate de que tenga:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8000
   VITE_SUPABASE_URL=https://<tu-id>.supabase.co
   VITE_SUPABASE_ANON_KEY=<tu-anon-key>
   ```
3. Instalar dependencias (si no las tienes instaladas):
   ```powershell
   npm install
   ```
4. Verificar tipos y pruebas unitarias (23/23 casos):
   ```powershell
   npm run typecheck
   npm test
   ```
5. Iniciar el servidor de desarrollo:
   ```powershell
   npm run dev
   ```
   Abre tu navegador en `http://localhost:5173`.

---

## Flujo de uso

1. **Acceso:** Entra en `http://localhost:5173/login`. Puedes registrar un usuario o iniciar sesión con tus credenciales de Supabase.
2. **Personajes:** Crea tu personaje virtual en la pestaña **Personajes** indicando nombre, descripción visual, rasgos invariantes y **Voz / género** (femenina, masculina, neutra o detectar de la descripción).
3. **Referencias:** Sube imágenes de referencia representativas confirmando derechos y notas de procedencia.
4. **Estudio (imagen):** En la pestaña **Estudio**, redacta el prompt y selecciona el motor de generación (`Simulado`, `PC local` o `Nube`).
5. **Chat y voz:** En **Estudio → Chat**, elige un personaje y conversa (respuestas en streaming). Activa **Voz: ON** para escuchar sus respuestas y usa **Micrófono** para dictar tu mensaje en español.
6. **Modo llamada:** En el chat, pulsa **Llamar** para abrir la videollamada simulada: avatar del personaje, voz (TTS) y micrófono (STT), con subtítulos y controles de colgar.
7. **Galería:** Consulta los resultados generados, márcalos como favoritos o descárgalos.

---

## Pruebas manuales: chat, voz y modo llamada

**Requisitos:** Chrome o Edge (el dictado por voz no está disponible en Firefox), permiso de micrófono y acceso por `http://localhost` o `http://127.0.0.1` (no por IP de red).

1. Arranca backend y frontend (pasos 2 y 3). Verifica que `http://127.0.0.1:8000/api/health` responde `{"status":"ok"}`.
2. Inicia sesión y crea un personaje (o usa uno existente) con al menos una imagen de referencia (se usará como avatar en la llamada). En su ficha, ajusta **Voz / género**; si lo dejas en «Sin especificar», se detecta de la descripción (p. ej. «una supermodelo adulta» → femenina).
3. Ve a **Estudio → Chat** y envía un mensaje. Debe aparecer la respuesta del personaje en streaming.
4. Pulsa **Voz: ON** y envía otro mensaje: al terminar, el navegador debe leer la respuesta en voz alta. Comprueba que la voz **coincide con el género** (un personaje femenino no debe sonar con voz masculina). Cambia el género en la ficha y repite: la voz debe cambiar. Vuelve a pulsar para silenciar.
5. Pulsa **Micrófono**, acepta el permiso y habla: tu frase debe transcribirse al cuadro de texto. Envía y comprueba la respuesta.
6. Pulsa **Llamar**: se abre el modo llamada con el avatar. Repite los pasos 4 y 5 dentro de la llamada. Usa **Colgar** para salir.
7. Comprobaciones de error: sin permiso de micrófono debe mostrarse un aviso claro; en un navegador sin soporte, los botones de voz/micrófono no aparecen y se indica el requisito.

> **Límite actual:** el avatar es una imagen fija y la voz usa el sintetizador del navegador. El *lipsync* (boca sincronizada) y el video/baile/faceswap necesitan una instancia local de ComfyUI con GPU y quedan como fase siguiente.

---

## Documentación de referencia

- [Contrato de la API v1.1](file:///C:/Users/minda/Desktop/IA%20influencer2/docs/api-contracts.md)
- [Documento vivo y bitácora de verificación](file:///C:/Users/minda/Desktop/IA%20influencer2/docs/documento.md)
- [Arquitectura del sistema](file:///C:/Users/minda/Desktop/IA%20influencer2/docs/architecture.md)
- [Seguridad y credenciales](file:///C:/Users/minda/Desktop/IA%20influencer2/docs/security.md)

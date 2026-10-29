# AI Creator Studio

Plataforma web para crear y administrar personajes virtuales, generar imágenes con consistencia visual, conservar referencias y organizar resultados.

**Stack:** React + TypeScript (Vite) · FastAPI · SQLite · ComfyUI (local) · PWA

## Estructura del repositorio

```
ai-creator-studio/
├── apps/
│   └── frontend/          # React + TypeScript (Vite, PWA)
├── backend/               # FastAPI (en construcción)
├── data/                  # Archivos locales (referencias, outputs, thumbnails)
├── docs/
│   ├── api-contracts.md   # Contrato de la API v1 (fuente de verdad)
│   └── architecture.md    # Arquitectura y decisiones
├── documento.md           # Documento vivo del proyecto
├── .env.example           # Plantilla de variables de entorno
└── README.md
```

## Frontend

### Requisitos

- Node.js 18+ (probado con 22.x)
- npm 9+

### Instalación

```bash
cd apps/frontend
npm install
```

### Desarrollo

```bash
npm run dev          # Vite dev server en http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run build        # Build de producción
npm run test         # Vitest (sin tests aún)
```

### Configuración

Copia `apps/frontend/.env.example` a `apps/frontend/.env` y ajusta `VITE_API_BASE_URL` (por defecto `http://127.0.0.1:8000`).

La clave de acceso (`X-API-Key`) se configura en la pantalla de Ajustes del navegador.

## Backend

En construcción. Dependencias en `backend/requirements.txt` y `backend/requirements-dev.txt`.

## Documentación

- **Contrato API v1:** `docs/api-contracts.md` — fuente de verdad entre backend y frontend.
- **Arquitectura:** `docs/architecture.md` — decisiones y fases.
- **Documento vivo:** `documento.md` — bitácora y estado del proyecto.

## Licencia

Pendiente de definir.

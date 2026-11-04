# Backend — AI Creator Studio

FastAPI + Supabase. Contrato: `../docs/api-contracts.md`. Estado: lógica probada (23 pruebas); capa FastAPI y servicios externos **sin ejecutar**.

## En tu PC (Windows, PowerShell, desde la carpeta `backend`)
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
python -m pytest -q tests              # debe terminar en verde; pégame la salida
copy ..\.env.example .env              # edítalo (ver ../.env.example)
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Prueba rápida: abrir http://127.0.0.1:8000/api/health → `{"status":"ok",...}`.
Documentación interactiva (solo en desarrollo): http://127.0.0.1:8000/api/docs

## Supabase
1. Crea un proyecto en supabase.com.
2. SQL Editor → pega y ejecuta `../supabase/schema.sql` (revisa errores).
3. Copia `URL`, `anon key` y `service_role key` (Project Settings → API) al `.env`.
4. Authentication → crea un usuario para entrar.

## Motores
- `mock`: siempre disponible.
- `cloudflare`: pon `ACS_CLOUD_ENABLED=true` y las dos variables de Cloudflare. Sin validar.
- `comfyui`: requiere el flujo `workflows/image-generation/workflow_api.json` (no incluido) y ComfyUI en marcha. Sin validar.

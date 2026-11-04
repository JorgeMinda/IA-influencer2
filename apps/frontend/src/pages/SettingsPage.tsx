import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '../hooks/useSettings';
import { useProviders } from '../hooks/useProviders';
import { getBaseUrl, saveSettings, resetSettings, isValidBaseUrl, defaultBaseUrl } from '../services/settings';
import { getCurrentUser, logout } from '../services/auth';
import { useToast } from '../components/Toast';
import { ErrorNotice } from '../components/Feedback';
import type { ProvidersStatus } from '../types';

export function SettingsPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const connection = useConnection();
  const { status, loading, error, reload } = useProviders();
  const [baseUrl, setBaseUrl] = useState(getBaseUrl());
  const [urlError, setUrlError] = useState<string | null>(null);
  const user = getCurrentUser();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValidBaseUrl(baseUrl)) {
      setUrlError('La URL no es válida. Debe empezar por http:// o https://');
      return;
    }
    setUrlError(null);
    saveSettings(baseUrl, '');
    notify('Ajustes guardados.');
  }

  function handleReset() {
    resetSettings();
    setBaseUrl(defaultBaseUrl());
    notify('Ajustes restablecidos.');
  }

  async function handleLogout() {
    await logout();
    notify('Sesión cerrada.');
    navigate('/login', { replace: true });
  }

  return (
    <>
      <div className="page-head">
        <h1>Ajustes</h1>
      </div>

      <section className="card stack" aria-label="Cuenta de usuario" style={{ marginBottom: '1.5rem' }}>
        <h2>Cuenta de Supabase</h2>
        <div className="field">
          <p>
            Usuario actual: <strong>{user?.email || 'Sesión local'}</strong>
          </p>
          {user?.id && <p className="hint">ID de usuario: <code>{user.id}</code></p>}
        </div>
        <div className="actions">
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </section>

      <form className="card stack" onSubmit={handleSubmit} noValidate aria-label="Ajustes de conexión">
        <h2>Conexión con la API</h2>
        <div className="field">
          <label htmlFor="base-url">URL base del backend (FastAPI)</label>
          <input
            id="base-url"
            className={`input${urlError ? ' is-invalid' : ''}`}
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:8000"
          />
          {urlError ? <p className="error-text">{urlError}</p> : null}
          <p className="hint">Por defecto: {defaultBaseUrl()}</p>
        </div>

        <div className="field">
          <p>
            Estado de la conexión:{' '}
            <strong>
              {connection === 'ok' ? 'Conectado' : connection === 'offline' ? 'Sin conexión' : connection === 'unauthorized' ? 'Sesión expirada o no autorizada' : 'Desconocido'}
            </strong>
          </p>
        </div>

        <div className="actions">
          <button type="submit" className="btn btn-primary">
            Guardar
          </button>
          <button type="button" className="btn" onClick={handleReset}>
            Restablecer
          </button>
        </div>
      </form>

      <section className="section" aria-labelledby="providers-h">
        <div className="section-head">
          <h2 id="providers-h">Estado de los motores</h2>
          <button type="button" className="btn btn-small" onClick={reload} disabled={loading}>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
        {error ? <ErrorNotice error={error} title="No se pudo consultar el estado de los motores." onRetry={reload} /> : null}
        {status ? <ProvidersCard status={status} /> : null}
      </section>
    </>
  );
}

function ProvidersCard({ status }: { status: ProvidersStatus }) {
  return (
    <div className="card stack">
      <div>
        <h3>Local (ComfyUI)</h3>
        <p>
          {status.local.enabled ? (status.local.available ? 'Disponible' : 'No responde') : 'Desactivado'} — {status.local.detail}
        </p>
      </div>
      <div>
        <h3>Nube</h3>
        <p>
          {status.cloud.enabled ? (status.cloud.configured ? `Configurado (${status.cloud.provider})` : 'Sin proveedor') : 'Desactivado'} — {status.cloud.detail}
        </p>
      </div>
      <div>
        <h3>Simulado</h3>
        <p>{status.mock.enabled ? 'Disponible' : 'Desactivado'} — {status.mock.detail}</p>
      </div>
      <div>
        <h3>Límites</h3>
        <p>
          Subida máx.: {status.limits.max_upload_mb} MB · Tareas simultáneas: {status.limits.max_concurrent_jobs} · Peticiones/min: {status.limits.rate_limit_per_minute}
        </p>
      </div>
    </div>
  );
}

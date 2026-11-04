import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login, register } from '../services/auth';
import { useToast } from '../components/Toast';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/personajes';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email.trim() || !password) {
      setError('Por favor completa todos los campos.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        notify('Sesión iniciada correctamente.');
        navigate(from, { replace: true });
      } else {
        const result = await register(email, password);
        if ('needsConfirmation' in result && result.needsConfirmation) {
          setInfo('Te hemos enviado un correo de confirmación. Revisa tu bandeja de entrada para verificar tu cuenta.');
        } else {
          notify('Cuenta creada y sesión iniciada.');
          navigate(from, { replace: true });
        }
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Ha ocurrido un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container" style={{ maxWidth: '420px', margin: '4rem auto', padding: '1rem' }}>
      <div className="card stack">
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <img src="/icons/favicon.svg" alt="" width="48" height="48" />
          <h1 style={{ fontSize: '1.5rem', marginTop: '0.5rem' }}>AI Creator Studio</h1>
          <p className="hint">Plataforma de creación de personajes virtuales consistentes</p>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border, #333)', marginBottom: '1rem' }}>
          <button
            type="button"
            className={`btn ${mode === 'login' ? 'btn-primary' : ''}`}
            style={{ flex: 1, borderRadius: '4px 4px 0 0' }}
            onClick={() => { setMode('login'); setError(null); setInfo(null); }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`btn ${mode === 'register' ? 'btn-primary' : ''}`}
            style={{ flex: 1, borderRadius: '4px 4px 0 0' }}
            onClick={() => { setMode('register'); setError(null); setInfo(null); }}
          >
            Registrarse
          </button>
        </div>

        {error && (
          <div className="banner banner-error" role="alert" style={{ marginBottom: '1rem' }}>
            <p>{error}</p>
          </div>
        )}

        {info && (
          <div className="banner banner-warn" role="alert" style={{ marginBottom: '1rem' }}>
            <p>{info}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="stack" noValidate>
          <div className="field">
            <label htmlFor="auth-email">Correo electrónico</label>
            <input
              id="auth-email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <div className="field">
            <label htmlFor="auth-password">Contraseña</label>
            <input
              id="auth-password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              disabled={loading}
            />
          </div>

          <div className="actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Procesando…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

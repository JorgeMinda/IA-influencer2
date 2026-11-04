/** Servicio de autenticación con Supabase Auth (API REST pura, sin dependencias pesadas). */

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // timestamp en segundos
  user: AuthUser;
}

const STORAGE_KEY = 'acs.auth.session';

function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = (import.meta.env?.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey };
}

let currentSession: AuthSession | null = (() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
})();

const listeners = new Set<(session: AuthSession | null) => void>();

function setSession(session: AuthSession | null): void {
  currentSession = session;
  try {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* fallback en memoria */
  }
  listeners.forEach((l) => l(session));
}

export function getSession(): AuthSession | null {
  return currentSession;
}

export function getCurrentUser(): AuthUser | null {
  return currentSession?.user ?? null;
}

export function getAccessToken(): string | null {
  return currentSession?.access_token ?? null;
}

export function isAuthenticated(): boolean {
  return !!currentSession?.access_token;
}

export function subscribeAuth(listener: (session: AuthSession | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    // Modo desarrollo local sin Supabase configurado
    const devSession: AuthSession = {
      access_token: 'dev-token',
      refresh_token: 'dev-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: '00000000-0000-0000-0000-000000000001', email: email || 'dev@local.host' },
    };
    setSession(devSession);
    return devSession;
  }

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Error al iniciar sesión.');
  }

  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  };
  setSession(session);
  return session;
}

export async function register(email: string, password: string): Promise<AuthSession | { needsConfirmation: boolean; email: string }> {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return login(email, password);
  }

  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || 'Error al registrarse.');
  }

  if (data.access_token) {
    const session: AuthSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    };
    setSession(session);
    return session;
  }

  return { needsConfirmation: true, email: data.email || email };
}

export async function logout(): Promise<void> {
  const { url, anonKey } = getSupabaseConfig();
  const token = currentSession?.access_token;
  if (url && anonKey && token) {
    try {
      await fetch(`${url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Ignorar fallo de red al cerrar sesión
    }
  }
  setSession(null);
}

export async function refreshSession(): Promise<string | null> {
  const { url, anonKey } = getSupabaseConfig();
  const refreshToken = currentSession?.refresh_token;
  if (!url || !anonKey || !refreshToken) {
    return null;
  }

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      setSession(null);
      return null;
    }

    const data = await res.json();
    const session: AuthSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    };
    setSession(session);
    return session.access_token;
  } catch {
    return null;
  }
}

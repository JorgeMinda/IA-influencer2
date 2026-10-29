/** Ajustes locales (URL base y clave). Todo acceso a localStorage va en try/catch;
 *  si el almacenamiento falla, se mantiene en memoria durante la sesión. */
const KEY_URL = 'acs.apiBaseUrl';
const KEY_KEY = 'acs.apiKey';
export const FALLBACK_BASE_URL = 'http://127.0.0.1:8000';

const memory: { baseUrl: string | null; apiKey: string | null } = { baseUrl: null, apiKey: null };
const listeners = new Set<() => void>();
let version = 0;

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function isValidBaseUrl(value: string): boolean {
  try {
    const u = new URL(normalizeBaseUrl(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null): void {
  try {
    if (value === null || value === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* sin almacenamiento: la app sigue funcionando con la copia en memoria */
  }
}

export function defaultBaseUrl(): string {
  let fromEnv: string | undefined;
  try {
    fromEnv = import.meta.env?.VITE_API_BASE_URL;
  } catch {
    fromEnv = undefined;
  }
  return normalizeBaseUrl(fromEnv && fromEnv.trim() ? fromEnv : FALLBACK_BASE_URL);
}

export function getBaseUrl(): string {
  const stored = memory.baseUrl ?? safeGet(KEY_URL);
  return stored && stored.trim() ? normalizeBaseUrl(stored) : defaultBaseUrl();
}

export function getApiKey(): string {
  return memory.apiKey ?? safeGet(KEY_KEY) ?? '';
}

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function saveSettings(baseUrl: string, apiKey: string): void {
  const url = normalizeBaseUrl(baseUrl);
  memory.baseUrl = url;
  memory.apiKey = apiKey.trim();
  safeSet(KEY_URL, url === defaultBaseUrl() ? null : url);
  safeSet(KEY_KEY, memory.apiKey);
  emit();
}

export function resetSettings(): void {
  memory.baseUrl = null;
  memory.apiKey = null;
  safeSet(KEY_URL, null);
  safeSet(KEY_KEY, null);
  emit();
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getSettingsVersion(): number {
  return version;
}

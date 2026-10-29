import type { ApiError as ApiErrorShape, ApiErrorBody } from '../types';
import { setConnectionState } from './connection';
import { getApiKey, getBaseUrl } from './settings';

export class ApiError extends Error implements ApiErrorShape {
  code: string;
  status: number;
  details: unknown[];
  retryAfter: number | null;
  constructor(code: string, message: string, status: number, details: unknown[] = [], retryAfter: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

/** Antepone la URL base a las rutas relativas /api/files/... (las absolutas se devuelven tal cual). */
export function fileUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${getBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
  /** false: la respuesta no altera el estado global de conexión (p. ej. /health, que es pública). */
  track?: boolean;
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${getBaseUrl()}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseError(res: Response): Promise<ApiError> {
  const retryHeader = res.headers.get('Retry-After');
  const retry = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : null;
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    const e = body?.error;
    if (e && typeof e.code === 'string' && typeof e.message === 'string') {
      return new ApiError(e.code, e.message, res.status, Array.isArray(e.details) ? e.details : [], retry);
    }
  } catch {
    /* cuerpo no JSON */
  }
  return new ApiError('http_error', `La API respondió con un error (HTTP ${res.status}).`, res.status, [], retry);
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const key = getApiKey();
  if (key) headers['X-API-Key'] = key;

  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // el navegador fija el Content-Type con su boundary
  } else if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method, headers, body, signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    if ((err as { name?: string })?.name === 'AbortError') throw err;
    if (opts.track !== false) setConnectionState('offline');
    throw new ApiError('network_error', 'No se pudo conectar con la API. Revisa que el servidor esté en marcha y la URL en Ajustes.', 0);
  }

  if (!res.ok) {
    const err = await parseError(res);
    if (opts.track !== false && res.status === 401) setConnectionState('unauthorized');
    throw err;
  }
  if (opts.track !== false) setConnectionState('ok');
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('bad_response', 'La API devolvió una respuesta que no se puede leer.', res.status);
  }
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, json?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, json }),
  patch: <T>(path: string, json: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, json }),
  del: <T = void>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  upload: <T>(path: string, form: FormData, opts?: RequestOptions) => request<T>('POST', path, { ...opts, form }),
};

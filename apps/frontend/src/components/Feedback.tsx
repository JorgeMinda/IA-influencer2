import type { ReactNode } from 'react';
import { ApiError } from '../services/api';
import { errorMessage, statusLabel } from '../lib/format';
import type { JobStatus } from '../types';

export function Skeleton({ h = 16, w = '100%', r }: { h?: number | string; w?: number | string; r?: number }) {
  return <span className="skeleton" aria-hidden="true" style={{ height: h, width: w, borderRadius: r }} />;
}

/** Error legible con opción de reintentar. Los límites (429) se explican aparte. */
export function ErrorNotice({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const limited = error instanceof ApiError && error.code === 'rate_limited';
  return (
    <div className="notice notice-error" role="alert">
      <p>
        <strong>{limited ? 'Has llegado al límite de uso del servidor.' : title ?? 'No se pudo completar la acción.'}</strong>
      </p>
      <p>{errorMessage(error)}</p>
      {limited ? <p>Espera unos segundos, o a que termine alguna tarea en curso, y vuelve a intentarlo.</p> : null}
      {onRetry ? (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg className="empty-mark" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
        <path d="M14 24V14h10M50 24V14H40M14 40v10h10M50 40v10H40" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>;
}

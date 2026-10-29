import { ApiError } from '../services/api';
import type { Destination, JobStatus, Priority, UsedDestination } from '../types';

const dateFmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'En cola',
  processing: 'Generando',
  completed: 'Terminada',
  failed: 'Falló',
  cancelled: 'Cancelada',
};
export const statusLabel = (s: JobStatus) => STATUS_LABEL[s] ?? s;

export const DESTINATION_LABEL: Record<Destination, string> = { auto: 'Automático', local: 'PC local', cloud: 'Nube', mock: 'Simulado' };
export const destinationLabel = (d: Destination | UsedDestination | null | undefined) => (d ? DESTINATION_LABEL[d] ?? d : 'Sin asignar');

export const PRIORITY_LABEL: Record<Priority, string> = { speed: 'Rapidez', balanced: 'Equilibrio', quality: 'Calidad' };

export const ENGINE_LABEL: Record<string, string> = { mock: 'Simulado', comfyui: 'ComfyUI (PC local)', cloud_images: 'Nube' };
export const engineLabel = (e: string) => ENGINE_LABEL[e] ?? e;

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited' && err.retryAfter) return `${err.message} Vuelve a intentarlo en ${err.retryAfter} s.`;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Ha ocurrido un error inesperado.';
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

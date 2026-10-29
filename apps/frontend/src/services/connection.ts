/** Estado global de la conexión con la API, alimentado por el cliente fetch. */
export type ConnectionState = 'unknown' | 'ok' | 'offline' | 'unauthorized';

let state: ConnectionState = 'unknown';
const listeners = new Set<() => void>();

export function getConnectionState(): ConnectionState {
  return state;
}
export function setConnectionState(next: ConnectionState): void {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}
export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

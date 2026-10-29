import { getProviders } from '../services/endpoints';
import type { ProvidersStatus } from '../types';
import { useAsync } from './useAsync';
import { useSettings } from './useSettings';

/** Estado de los motores y límites del servidor. Se recarga si cambian la URL o la clave. */
export function useProviders() {
  const { baseUrl, apiKey } = useSettings();
  const r = useAsync<ProvidersStatus>((signal) => getProviders({ signal }), [baseUrl, apiKey]);
  return { status: r.data ?? null, loading: r.loading, error: r.error, reload: r.reload };
}

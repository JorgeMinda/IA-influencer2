import type { Destination, ProvidersStatus } from '../../types';
import { autoTarget } from './destinationRules';

/** Texto de "Se procesará en: …" según el destino elegido y el estado de los motores. */
export function routeSummary(destination: Destination, status: ProvidersStatus | null | undefined): string {
  switch (destination) {
    case 'local':
      return 'PC local (tu propio equipo, sin salir de tu red)';
    case 'mock':
      return 'Motor simulado (imagen de prueba)';
    case 'cloud': {
      const p = status?.cloud.provider;
      return `Nube${p && p !== 'ninguno' ? ` (${p})` : ''}: tus datos salen de tu red`;
    }
    default:
      if (!status) return 'Automático: PC local si está disponible; si no, simulado. Nunca la nube';
      return autoTarget(status) === 'local' ? 'Automático: PC local (nunca la nube)' : 'Automático: motor simulado, porque el PC local no está disponible (nunca la nube)';
  }
}

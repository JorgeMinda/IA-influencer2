import type { Destination, ProvidersStatus } from '../../types';

export interface DestinationOption {
  value: Destination;
  label: string;
  description: string;
  enabled: boolean;
  /** Motivo por el que está deshabilitada (si aplica). */
  reason?: string;
}

/** A dónde iría "Automático" según el contrato: local si está disponible, si no simulado. Nunca nube. */
export function autoTarget(status: ProvidersStatus | null | undefined): 'local' | 'mock' {
  return status?.local.enabled && status.local.available ? 'local' : 'mock';
}

export function getDestinationOptions(status: ProvidersStatus | null | undefined): DestinationOption[] {
  const unknown = !status;
  const localOk = !!status && status.local.enabled && status.local.available;
  const cloudOk = !!status && status.cloud.enabled && status.cloud.configured;
  const mockOk = unknown ? true : !!status?.mock.enabled;

  const target = autoTarget(status);
  const auto: DestinationOption = {
    value: 'auto',
    label: 'Automático',
    description: `El estudio elige: tu PC si está disponible; si no, el motor simulado. Nunca usa la nube. Ahora usaría: ${target === 'local' ? 'PC local' : 'simulado'}.`,
    enabled: true,
  };
  const local: DestinationOption = {
    value: 'local',
    label: 'PC local',
    description: 'Genera en tu propio equipo con ComfyUI. Tus prompts e imágenes no salen de tu red.',
    enabled: localOk,
    reason: localOk ? undefined : unknown ? 'Aún no se conoce el estado del motor.' : !status!.local.enabled ? 'El motor local está desactivado en el servidor.' : 'El motor local no responde ahora mismo.',
  };
  const cloud: DestinationOption = {
    value: 'cloud',
    label: 'Nube',
    description: `Envía prompts y referencias a un proveedor externo${status && status.cloud.provider && status.cloud.provider !== 'ninguno' ? ` (${status.cloud.provider})` : ''}. Puede tener coste. Te pediremos confirmación.`,
    enabled: cloudOk,
    reason: cloudOk ? undefined : unknown ? 'Aún no se conoce el estado del proveedor.' : !status!.cloud.enabled ? 'La nube está desactivada en el servidor.' : 'No hay proveedor de nube configurado.',
  };
  const mock: DestinationOption = {
    value: 'mock',
    label: 'Simulado',
    description: 'Crea una imagen de prueba marcada como SIMULADO. No usa GPU ni internet; sirve para probar el flujo.',
    enabled: mockOk,
    reason: mockOk ? undefined : 'El motor simulado está desactivado en el servidor.',
  };
  return [auto, local, cloud, mock];
}

/** Si la opción elegida deja de estar disponible, vuelve a Automático. */
export function resolveDestination(current: Destination, options: DestinationOption[]): Destination {
  const opt = options.find((o) => o.value === current);
  return opt && opt.enabled ? current : 'auto';
}

export const requiresCloudConfirmation = (d: Destination) => d === 'cloud';

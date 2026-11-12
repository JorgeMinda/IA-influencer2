import { describe, it, expect } from 'vitest';
import { autoTarget, getDestinationOptions, resolveDestination, requiresCloudConfirmation } from './destinationRules';
import type { ProvidersStatus } from '../../types';

const baseStatus: ProvidersStatus = {
  local: { enabled: false, available: false, detail: 'desactivado' },
  cloud: { enabled: false, configured: false, provider: 'cloudflare', detail: 'desactivado' },
  voicestudio: { enabled: false, available: false, detail: 'desactivado' },
  mock: { enabled: true, detail: 'simulado' },
  limits: { max_upload_mb: 8, max_concurrent_jobs: 2, rate_limit_per_minute: 60 },
};

describe('autoTarget', () => {
  it('elige local solo si está habilitado y disponible', () => {
    expect(autoTarget(baseStatus)).toBe('mock');
    expect(autoTarget({ ...baseStatus, local: { enabled: true, available: true, detail: 'ok' } })).toBe('local');
    expect(autoTarget({ ...baseStatus, local: { enabled: true, available: false, detail: 'down' } })).toBe('mock');
  });
});

describe('getDestinationOptions', () => {
  it('deshabilita nube si no está configurada', () => {
    const opts = getDestinationOptions(baseStatus);
    const cloud = opts.find((o) => o.value === 'cloud')!;
    expect(cloud.enabled).toBe(false);
  });

  it('habilita nube si está configurada', () => {
    const statusWithCloud: ProvidersStatus = {
      ...baseStatus,
      cloud: { enabled: true, configured: true, provider: 'cloudflare', detail: 'listo' },
      voicestudio: { enabled: false, available: false, detail: 'desactivado' },
    };
    const opts = getDestinationOptions(statusWithCloud);
    const cloud = opts.find((o) => o.value === 'cloud')!;
    expect(cloud.enabled).toBe(true);
  });
});

describe('resolveDestination', () => {
  it('resuelve a auto si la opción actual está deshabilitada', () => {
    const opts = getDestinationOptions(baseStatus);
    expect(resolveDestination('local', opts)).toBe('auto');
    expect(resolveDestination('mock', opts)).toBe('mock');
  });
});

describe('requiresCloudConfirmation', () => {
  it('solo requiere confirmación para nube', () => {
    expect(requiresCloudConfirmation('cloud')).toBe(true);
    expect(requiresCloudConfirmation('local')).toBe(false);
    expect(requiresCloudConfirmation('mock')).toBe(false);
    expect(requiresCloudConfirmation('auto')).toBe(false);
  });
});

import { useSyncExternalStore } from 'react';
import { getApiKey, getBaseUrl, getSettingsVersion, subscribeSettings } from '../services/settings';
import { getConnectionState, subscribeConnection } from '../services/connection';

export function useSettings() {
  useSyncExternalStore(subscribeSettings, getSettingsVersion);
  return { baseUrl: getBaseUrl(), apiKey: getApiKey() };
}
export function useConnection() {
  return useSyncExternalStore(subscribeConnection, getConnectionState);
}

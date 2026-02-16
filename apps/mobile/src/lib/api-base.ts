import { Platform } from 'react-native';

import { getPublicAppUrl } from './runtime-config';

const DEFAULT_LOCAL_WEB_PORT = 3000;
const ANDROID_EMULATOR_HOST = '10.0.2.2';

function trimEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBaseUrl(url: string): string {
  const withoutTrailingSlash = url.replace(/\/+$/, '');
  if (Platform.OS !== 'android') return withoutTrailingSlash;

  return withoutTrailingSlash
    .replace('://localhost', `://${ANDROID_EMULATOR_HOST}`)
    .replace('://127.0.0.1', `://${ANDROID_EMULATOR_HOST}`);
}

export function getApiBaseUrl(): string {
  const explicit = trimEnv(process.env.EXPO_PUBLIC_API_URL);
  if (explicit) return normalizeBaseUrl(explicit);

  const appUrl = getPublicAppUrl();
  if (appUrl) return normalizeBaseUrl(appUrl);

  if (Platform.OS === 'android') {
    return `http://${ANDROID_EMULATOR_HOST}:${DEFAULT_LOCAL_WEB_PORT}`;
  }

  return `http://localhost:${DEFAULT_LOCAL_WEB_PORT}`;
}

export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

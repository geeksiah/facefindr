import { Alert } from 'react-native';

function trimEnv(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getPublicAppUrl(): string | null {
  const url = trimEnv(process.env.EXPO_PUBLIC_APP_URL);
  return url ? url.replace(/\/+$/, '') : null;
}

export function getSupportEmail(): string | null {
  return trimEnv(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);
}

export function buildPublicUrl(path: string): string | null {
  const baseUrl = getPublicAppUrl();
  if (!baseUrl) return null;

  if (path.startsWith('/')) return `${baseUrl}${path}`;
  return `${baseUrl}/${path}`;
}

export function alertMissingPublicAppUrl(): void {
  Alert.alert(
    'Configuration required',
    'EXPO_PUBLIC_APP_URL is not set. Please contact support.'
  );
}

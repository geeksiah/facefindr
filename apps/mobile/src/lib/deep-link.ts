const CANONICAL_APP_SCHEME = 'ferchr';
const LEGACY_APP_SCHEME = 'facefindr';

function normalizeScheme(value: string): string {
  return value.trim().replace(/:\/?\/?$/, '').toLowerCase();
}

export function getSupportedAppSchemes(): string[] {
  const configured = process.env.EXPO_PUBLIC_APP_SCHEME
    ? [normalizeScheme(process.env.EXPO_PUBLIC_APP_SCHEME)]
    : [];

  return Array.from(new Set([CANONICAL_APP_SCHEME, LEGACY_APP_SCHEME, ...configured]));
}

export function getCanonicalAppScheme(): string {
  return CANONICAL_APP_SCHEME;
}

export function isSupportedAppScheme(protocol: string): boolean {
  const normalized = protocol.replace(':', '').toLowerCase();
  return getSupportedAppSchemes().includes(normalized);
}

export function buildCanonicalDeepLink(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${CANONICAL_APP_SCHEME}://${normalizedPath.replace(/^\/+/, '')}`;
}

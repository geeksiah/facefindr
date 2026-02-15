export function getAdminJwtSecret(): string {
  const configured = process.env.ADMIN_JWT_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_JWT_SECRET must be configured in production');
  }

  // Dev/test fallback only.
  return 'development-secret-change-in-production';
}

export function getAdminJwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getAdminJwtSecret());
}

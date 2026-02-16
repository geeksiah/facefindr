export type CanonicalUserType = 'creator' | 'attendee';
export type AnyUserType = CanonicalUserType | 'photographer';

export function normalizeUserType(userType: unknown): CanonicalUserType | null {
  if (userType === 'attendee') return 'attendee';
  if (userType === 'creator' || isCreatorUserType(userType)) return 'creator';
  return null;
}

export function isCreatorUserType(userType: unknown): boolean {
  return normalizeUserType(userType) === 'creator';
}

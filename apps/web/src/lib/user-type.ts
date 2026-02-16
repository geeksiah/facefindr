export type CanonicalUserType = 'creator' | 'attendee';
export type AcceptedUserType = CanonicalUserType | 'photographer';

export function normalizeUserType(userType: unknown): CanonicalUserType | null {
  if (userType === 'attendee') return 'attendee';
  if (userType === 'creator' || userType === 'photographer') return 'creator';
  return null;
}

export function isCreatorUser(userType: unknown): boolean {
  return normalizeUserType(userType) === 'creator';
}

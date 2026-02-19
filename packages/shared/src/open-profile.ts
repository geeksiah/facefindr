// Helper utilities to build profile URLs and resolve slugs.
export type ProfileKind = 'attendee' | 'creator' | 'photographer';

export function resolveProfileSlug(profile: {
  public_profile_slug?: string | null;
  face_tag?: string | null;
  id?: string;
}) {
  return (
    profile.public_profile_slug || profile.face_tag?.replace(/^@/, '') || profile.id || ''
  );
}

export function buildProfileUrls(slug: string) {
  const normalized = slug || '';
  return {
    publicUser: `/u/${normalized}`,
    publicCreator: `/c/${normalized}`,
    shell: `/p/${normalized}`,
    shellCreator: `/p/${normalized}`,
    shellAttendee: `/u/${normalized}`,
  };
}

export default { resolveProfileSlug, buildProfileUrls };

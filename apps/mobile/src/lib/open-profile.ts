import { Linking } from 'react-native';
import { resolveProfileSlug } from '@facefind/shared';
import { buildPublicUrl } from './runtime-config';

type ProfileLike =
  | string
  | {
      public_profile_slug?: string | null;
      face_tag?: string | null;
      id?: string | null;
    };

export async function openProfile(router: any, profileOrSlug: ProfileLike) {
  const slug =
    typeof profileOrSlug === 'string'
      ? profileOrSlug.replace(/^@/, '')
      : resolveProfileSlug(profileOrSlug as any);

  if (!slug) return;

  // Prefer in-app shell path
  try {
    if (router && typeof router.push === 'function') {
      // Use formatted shell route
      router.push(`/p/${slug}`);
      return;
    }
  } catch (err) {
    // fall through to deep link
  }

  // Fallback: open public URL in external browser
  const publicUrl = buildPublicUrl(`/u/${slug}`);
  if (publicUrl) {
    try {
      await Linking.openURL(publicUrl);
    } catch (err) {
      // last-resort: if router is available, push public path
      if (router && typeof router.push === 'function') {
        router.push(`/u/${slug}`);
      }
    }
  } else if (router && typeof router.push === 'function') {
    // If no public URL is configured, fall back to in-app public route
    router.push(`/u/${slug}`);
  }
}

export default openProfile;

'use client';

import { useCallback, useState } from 'react';

export interface PrivacySettings {
  profileVisible: boolean;
  allowPhotoTagging: boolean;
  showInSearch: boolean;
  allowFaceRecognition: boolean;
  shareActivityWithCreators: boolean;
  emailMarketing: boolean;
  allowFollows: boolean;
}

const keyMap: Record<string, string> = {
  profileVisible: 'profile_visible',
  allowPhotoTagging: 'allow_photo_tagging',
  showInSearch: 'show_in_search',
  allowFaceRecognition: 'allow_face_recognition',
  shareActivityWithCreators: 'share_activity_with_photographers',
  emailMarketing: 'email_marketing',
  allowFollows: 'allow_follows',
};

function readBoolean(
  api: any,
  camelKey: string,
  snakeKey: string,
  fallback: boolean
) {
  if (typeof api?.[camelKey] === 'boolean') return api[camelKey];
  if (typeof api?.[snakeKey] === 'boolean') return api[snakeKey];
  return fallback;
}

function mapFromApi(api: any, fallback?: Partial<PrivacySettings>): PrivacySettings {
  return {
    profileVisible: readBoolean(api, 'profileVisible', 'profile_visible', fallback?.profileVisible ?? true),
    allowPhotoTagging: readBoolean(
      api,
      'allowPhotoTagging',
      'allow_photo_tagging',
      fallback?.allowPhotoTagging ?? true
    ),
    showInSearch: readBoolean(api, 'showInSearch', 'show_in_search', fallback?.showInSearch ?? true),
    allowFaceRecognition: readBoolean(
      api,
      'allowFaceRecognition',
      'allow_face_recognition',
      fallback?.allowFaceRecognition ?? true
    ),
    shareActivityWithCreators: readBoolean(
      api,
      'shareActivityWithCreators',
      'share_activity_with_photographers',
      fallback?.shareActivityWithCreators ?? false
    ),
    emailMarketing: readBoolean(
      api,
      'emailMarketing',
      'email_marketing',
      fallback?.emailMarketing ?? false
    ),
    allowFollows: readBoolean(api, 'allowFollows', 'allow_follows', fallback?.allowFollows ?? true),
  };
}

export function usePrivacySettings(baseUrl?: string) {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const endpoint = (path: string) => (baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint('/api/user/privacy-settings'));
      if (!res.ok) {
        const text = await res.text();
        setError(text || 'Failed to load privacy settings');
        return null;
      }
      const data = await res.json();
      const mapped = mapFromApi(data.settings || data || {});
      setSettings(mapped);
      return mapped;
    } catch (err: any) {
      setError(err?.message || 'Failed to load privacy settings');
      return null;
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const updateSetting = useCallback(
    async (key: keyof PrivacySettings, value: boolean) => {
      if (!settings) return null;
      const prev = settings;
      const next = { ...settings, [key]: value } as PrivacySettings;
      setSettings(next);

      const dbKey = keyMap[key as string] || (key as string);
      const payload = { [key]: value, [dbKey]: value };

      try {
        const res = await fetch(endpoint('/api/user/privacy-settings'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          setSettings(prev);
          return null;
        }
        const data = await res.json();
        const mapped = data.settings ? mapFromApi(data.settings, next) : next;
        setSettings(mapped);
        return mapped;
      } catch (err) {
        setSettings(prev);
        return null;
      }
    },
    [settings, baseUrl]
  );

  return {
    settings,
    loading,
    error,
    load,
    updateSetting,
  } as const;
}

const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeEventTimezone(value?: string | null): string {
  const candidate = String(value || '').trim();
  if (!candidate) return 'UTC';
  return isValidTimeZone(candidate) ? candidate : 'UTC';
}

export function normalizeIsoDate(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (ISO_DATE_ONLY_REGEX.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export function normalizeUtcTimestamp(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function deriveEventStartAtUtc(eventDate: string | null): string | null {
  if (!eventDate) return null;
  return new Date(`${eventDate}T12:00:00.000Z`).toISOString();
}

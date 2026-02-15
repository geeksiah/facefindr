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

function parseDateOnlyToUtcNoon(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function toParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hourRaw = Number(map.hour || '0');
  return {
    year: Number(map.year || '0'),
    month: Number(map.month || '1'),
    day: Number(map.day || '1'),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(map.minute || '0'),
    second: Number(map.second || '0'),
  };
}

function zonedDateTimeToUtcIso(dateOnly: string, timeZone: string, hour: number): string {
  const [targetYear, targetMonth, targetDay] = dateOnly.split('-').map(Number);
  const targetUtcEpoch = Date.UTC(targetYear, targetMonth - 1, targetDay, hour, 0, 0);
  let guess = new Date(targetUtcEpoch);

  // Resolve timezone offset for DST boundaries.
  for (let i = 0; i < 4; i++) {
    const parts = toParts(guess, timeZone);
    const mappedEpoch = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const offset = targetUtcEpoch - mappedEpoch;
    if (offset === 0) break;
    guess = new Date(guess.getTime() + offset);
  }

  return guess.toISOString();
}

export function deriveEventStartAtUtc(eventDate: string | null, eventTimezone: string): string | null {
  if (!eventDate) return null;
  const safeTimezone = normalizeEventTimezone(eventTimezone);
  return zonedDateTimeToUtcIso(eventDate, safeTimezone, 12);
}

export function normalizeUtcTimestamp(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatEventDateDisplay(
  event: {
    event_date?: string | null;
    event_start_at_utc?: string | null;
    event_timezone?: string | null;
  },
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const fallback = event.event_date ? normalizeIsoDate(event.event_date) : null;
  const timezone = normalizeEventTimezone(event.event_timezone);

  if (event.event_start_at_utc) {
    const start = new Date(event.event_start_at_utc);
    if (!Number.isNaN(start.getTime())) {
      return new Intl.DateTimeFormat(locale, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone,
        ...options,
      }).format(start);
    }
  }

  if (fallback) {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
      ...options,
    }).format(parseDateOnlyToUtcNoon(fallback));
  }

  return 'No date';
}

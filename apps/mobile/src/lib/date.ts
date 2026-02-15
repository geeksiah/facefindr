const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function parseDateForDisplay(value?: string | null): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (DATE_ONLY_REGEX.test(raw)) {
    return parseDateOnly(raw);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDateForDisplay(
  value?: string | null,
  locale: string = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const parsed = parseDateForDisplay(value);
  if (!parsed) return '';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: DATE_ONLY_REGEX.test(String(value || '').trim()) ? 'UTC' : undefined,
    ...options,
  }).format(parsed);
}

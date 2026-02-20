import { NextRequest, NextResponse } from 'next/server';

import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { bumpRuntimeConfigVersion } from '@/lib/runtime-config-version';
import { supabaseAdmin } from '@/lib/supabase';

const DEFAULT_BASE_CURRENCY = 'USD';
const RATE_STALE_MS = 12 * 60 * 60 * 1000;
const RATE_VALIDITY_MS = 24 * 60 * 60 * 1000;

type RateMap = Map<string, number>;

function parseRatePayload(payload: any, currencyCodes: string[]): RateMap {
  const map = new Map<string, number>();
  const rates = payload?.rates;
  if (!rates || typeof rates !== 'object') {
    return map;
  }

  for (const code of currencyCodes) {
    if (code === DEFAULT_BASE_CURRENCY) {
      map.set(code, 1);
      continue;
    }
    const value = Number((rates as Record<string, unknown>)[code]);
    if (Number.isFinite(value) && value > 0) {
      map.set(code, value);
    }
  }

  return map;
}

async function fetchRatesFromProvider(currencyCodes: string[]): Promise<{ rates: RateMap; source: string } | null> {
  const symbols = currencyCodes.join(',');
  const configuredUrl = process.env.EXCHANGE_RATE_API_URL;
  const candidates: Array<{ url: string; source: string }> = [];

  if (configuredUrl) {
    const url = configuredUrl
      .replace('{base}', DEFAULT_BASE_CURRENCY)
      .replace('{symbols}', encodeURIComponent(symbols));
    candidates.push({ url, source: 'configured_api' });
  }

  candidates.push(
    {
      url: `https://open.er-api.com/v6/latest/${DEFAULT_BASE_CURRENCY}`,
      source: 'open_er_api',
    },
    {
      url: `https://api.exchangerate.host/latest?base=${DEFAULT_BASE_CURRENCY}&symbols=${encodeURIComponent(symbols)}`,
      source: 'exchangerate_host',
    }
  );

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      const parsed = parseRatePayload(payload, currencyCodes);
      if (parsed.size > 0) {
        parsed.set(DEFAULT_BASE_CURRENCY, 1);
        return { rates: parsed, source: candidate.source };
      }
    } catch {
      // Try the next provider candidate.
    }
  }

  return null;
}

async function getLatestRateRows(currencyCodes: string[]) {
  const { data } = await supabaseAdmin
    .from('exchange_rates')
    .select('to_currency, rate, valid_from, created_at')
    .eq('from_currency', DEFAULT_BASE_CURRENCY)
    .in('to_currency', currencyCodes)
    .or('valid_until.is.null,valid_until.gt.now()')
    .order('valid_from', { ascending: false });

  return data || [];
}

function reduceLatestRates(
  rows: Array<{ to_currency: string; rate: number; valid_from?: string | null; created_at?: string | null }>,
  currencyCodes: string[]
): { rates: RateMap; latestAt: number } {
  const latestMap = new Map<string, number>();
  let latestAt = 0;

  for (const row of rows) {
    const code = String(row.to_currency || '').toUpperCase();
    if (!code || latestMap.has(code)) continue;
    const rate = Number(row.rate);
    if (Number.isFinite(rate) && rate > 0) {
      latestMap.set(code, rate);
    }
    const ts = Date.parse(String(row.valid_from || row.created_at || ''));
    if (Number.isFinite(ts) && ts > latestAt) {
      latestAt = ts;
    }
  }

  latestMap.set(DEFAULT_BASE_CURRENCY, 1);

  for (const code of currencyCodes) {
    if (!latestMap.has(code) && code === DEFAULT_BASE_CURRENCY) {
      latestMap.set(code, 1);
    }
  }

  return { rates: latestMap, latestAt };
}

async function refreshRates(currencyCodes: string[]) {
  const providerResult = await fetchRatesFromProvider(currencyCodes);
  if (!providerResult) {
    return null;
  }

  const validFrom = new Date().toISOString();
  const validUntil = new Date(Date.now() + RATE_VALIDITY_MS).toISOString();
  const payload = Array.from(providerResult.rates.entries()).map(([toCurrency, rate]) => ({
    from_currency: DEFAULT_BASE_CURRENCY,
    to_currency: toCurrency,
    rate,
    valid_from: validFrom,
    valid_until: validUntil,
    source: providerResult.source,
  }));

  const { error } = await supabaseAdmin.from('exchange_rates').insert(payload);
  if (error) {
    throw error;
  }

  return {
    rates: providerResult.rates,
    source: providerResult.source,
    validFrom,
  };
}

// GET - List all currencies
export async function GET(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const includeRates = searchParams.get('include_rates') === '1';
    const refreshRatesRequested = searchParams.get('refresh_rates') === '1';

    const { data: currencies, error } = await supabaseAdmin
      .from('supported_currencies')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    const currencyRows = currencies || [];
    if (!includeRates) {
      return NextResponse.json({ currencies: currencyRows });
    }

    const currencyCodes = currencyRows.map((row: any) => String(row.code || '').toUpperCase()).filter(Boolean);
    if (!currencyCodes.includes(DEFAULT_BASE_CURRENCY)) {
      currencyCodes.push(DEFAULT_BASE_CURRENCY);
    }

    const latestRows = await getLatestRateRows(currencyCodes);
    let { rates, latestAt } = reduceLatestRates(latestRows, currencyCodes);

    const hasMissingRates = currencyCodes.some((code) => code !== DEFAULT_BASE_CURRENCY && !rates.has(code));
    const isStale = !latestAt || Date.now() - latestAt > RATE_STALE_MS;
    const shouldRefresh = refreshRatesRequested || hasMissingRates || isStale;

    let refreshMeta: { source: string; validFrom: string } | null = null;
    if (shouldRefresh) {
      try {
        const refreshed = await refreshRates(currencyCodes);
        if (refreshed) {
          rates = refreshed.rates;
          latestAt = Date.parse(refreshed.validFrom);
          refreshMeta = { source: refreshed.source, validFrom: refreshed.validFrom };
        }
      } catch (refreshError) {
        console.error('Currency rate refresh error:', refreshError);
      }
    }

    const payload = currencyRows.map((row: any) => ({
      ...row,
      rate_to_usd: Number(rates.get(String(row.code || '').toUpperCase()) || (String(row.code || '').toUpperCase() === DEFAULT_BASE_CURRENCY ? 1 : 0)),
      rate_updated_at: latestAt ? new Date(latestAt).toISOString() : null,
    }));

    return NextResponse.json({
      currencies: payload,
      rates: {
        base: DEFAULT_BASE_CURRENCY,
        updatedAt: latestAt ? new Date(latestAt).toISOString() : null,
        refreshed: Boolean(refreshMeta),
        refreshSource: refreshMeta?.source || null,
      },
    });
  } catch (error) {
    console.error('Get currencies error:', error);
    return NextResponse.json({ error: 'Failed to get currencies' }, { status: 500 });
  }
}

// PUT - Update currencies
export async function PUT(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await hasPermission('settings.update'))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { currencies } = body;

    // Update each currency
    for (const currency of currencies) {
      const { error } = await supabaseAdmin
        .from('supported_currencies')
        .update({
          name: currency.name,
          symbol: currency.symbol,
          symbol_position: currency.symbol_position || 'before',
          decimal_places: currency.decimal_places ?? 2,
          countries: currency.countries || [],
          display_order: currency.display_order ?? 100,
          is_active: currency.is_active !== undefined ? currency.is_active : true,
        })
        .eq('code', currency.code);

      if (error) throw error;
    }
    await logAction('currencies_update', 'supported_currencies', undefined, {
      updated_count: Array.isArray(currencies) ? currencies.length : 0,
    });
    await bumpRuntimeConfigVersion('pricing', session.adminId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update currencies error:', error);
    return NextResponse.json({ error: 'Failed to update currencies' }, { status: 500 });
  }
}

interface ExternalCrawlerInput {
  displayName: string;
  faceTag?: string | null;
  contactQuery?: string | null;
  limit?: number;
}

export interface ExternalCrawlerResult {
  url: string;
  source: string;
  confidence: number;
}

interface SerpApiResponse {
  organic_results?: Array<{ link?: string }>;
}

interface TavilyResponse {
  results?: Array<{ url?: string; score?: number }>;
}

interface ExaResponse {
  results?: Array<{ url?: string; score?: number }>;
}

interface BingResponse {
  webPages?: {
    value?: Array<{ url?: string; score?: number }>;
  };
}

function normalizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function classifySource(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('instagram.')) return 'instagram';
    if (host.includes('facebook.')) return 'facebook';
    if (host.includes('tiktok.')) return 'tiktok';
    if (host.includes('x.com') || host.includes('twitter.')) return 'x';
    if (host.includes('youtube.')) return 'youtube';
    if (host.includes('linkedin.')) return 'linkedin';
    if (host.includes('medium.')) return 'medium';
    if (host.includes('wordpress.') || host.includes('blogspot.') || host.includes('substack.')) return 'blog';
    return 'web';
  } catch {
    return 'web';
  }
}

function buildQueries({ displayName, faceTag, contactQuery }: ExternalCrawlerInput): string[] {
  const cleanedName = displayName.trim();
  const cleanedFaceTag = (faceTag || '').trim().replace(/^@/, '');
  const cleanedContact = (contactQuery || '').trim();

  const base = cleanedFaceTag
    ? `"${cleanedName}" "${cleanedFaceTag}" photo`
    : `"${cleanedName}" photo event`;

  const queries = [
    base,
    `site:instagram.com ${base}`,
    `site:facebook.com ${base}`,
    `site:tiktok.com ${base}`,
    `site:x.com ${base}`,
    `site:youtube.com ${base}`,
    `${base} blog`,
  ];

  if (cleanedContact.length >= 2) {
    queries.push(`"${cleanedName}" "${cleanedContact}" event photo`);
    queries.push(`site:instagram.com "${cleanedName}" "${cleanedContact}"`);
  }

  return Array.from(new Set(queries));
}

export function hasExternalCrawlerProviderConfigured(): boolean {
  return Boolean(
    process.env.SERPAPI_KEY ||
      process.env.TAVILY_API_KEY ||
      process.env.EXA_API_KEY ||
      process.env.BING_SEARCH_API_KEY
  );
}

async function querySerpApi(query: string): Promise<ExternalCrawlerResult[]> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return [];

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('num', '10');

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) return [];
  const data = (await response.json()) as SerpApiResponse;

  return (data.organic_results || [])
    .map((row) => row.link || '')
    .map((link) => normalizeUrl(link))
    .filter((url): url is string => !!url)
    .map((url) => ({
      url,
      source: classifySource(url),
      confidence: 62,
    }));
}

async function queryTavily(query: string): Promise<ExternalCrawlerResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 10,
      include_images: false,
    }),
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const data = (await response.json()) as TavilyResponse;

  return (data.results || [])
    .map((row) => ({
      url: normalizeUrl(row.url || ''),
      score: Number(row.score || 0),
    }))
    .filter((row): row is { url: string; score: number } => !!row.url)
    .map((row) => ({
      url: row.url,
      source: classifySource(row.url),
      confidence: Math.max(50, Math.min(90, Math.round(row.score * 100))),
    }));
}

async function queryExa(query: string): Promise<ExternalCrawlerResult[]> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return [];

  const response = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: 10,
      useAutoprompt: true,
      type: 'auto',
    }),
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const data = (await response.json()) as ExaResponse;

  return (data.results || [])
    .map((row) => ({
      url: normalizeUrl(row.url || ''),
      score: Number(row.score || 0),
    }))
    .filter((row): row is { url: string; score: number } => !!row.url)
    .map((row) => ({
      url: row.url,
      source: classifySource(row.url),
      confidence: Math.max(50, Math.min(92, Math.round(row.score * 100))),
    }));
}

async function queryBing(query: string): Promise<ExternalCrawlerResult[]> {
  const apiKey = process.env.BING_SEARCH_API_KEY;
  if (!apiKey) return [];

  const url = new URL('https://api.bing.microsoft.com/v7.0/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '10');

  const response = await fetch(url.toString(), {
    headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    cache: 'no-store',
  });
  if (!response.ok) return [];
  const data = (await response.json()) as BingResponse;

  return (data.webPages?.value || [])
    .map((row) => ({
      url: normalizeUrl(row.url || ''),
      score: Number(row.score || 0),
    }))
    .filter((row): row is { url: string; score: number } => !!row.url)
    .map((row) => ({
      url: row.url,
      source: classifySource(row.url),
      confidence: row.score > 0 ? Math.max(50, Math.min(90, Math.round(row.score))) : 58,
    }));
}

export async function crawlExternalPlatforms(input: ExternalCrawlerInput): Promise<ExternalCrawlerResult[]> {
  if (!hasExternalCrawlerProviderConfigured()) {
    throw new Error(
      'External crawler providers are not configured. Set SERPAPI_KEY, TAVILY_API_KEY, EXA_API_KEY, or BING_SEARCH_API_KEY.'
    );
  }

  const limit = Math.max(1, Math.min(input.limit || 25, 50));
  const queries = buildQueries(input).slice(0, 6);
  const candidates: ExternalCrawlerResult[] = [];

  for (const query of queries) {
    const [serpResults, tavilyResults, exaResults, bingResults] = await Promise.all([
      querySerpApi(query),
      queryTavily(query),
      queryExa(query),
      queryBing(query),
    ]);

    candidates.push(...serpResults, ...tavilyResults, ...exaResults, ...bingResults);
    if (candidates.length >= limit * 3) {
      break;
    }
  }

  const deduped = new Map<string, ExternalCrawlerResult>();
  for (const candidate of candidates) {
    if (!deduped.has(candidate.url)) {
      deduped.set(candidate.url, candidate);
      continue;
    }

    const existing = deduped.get(candidate.url)!;
    if (candidate.confidence > existing.confidence) {
      deduped.set(candidate.url, candidate);
    }
  }

  return Array.from(deduped.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

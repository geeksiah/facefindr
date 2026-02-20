export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { createServiceClient } from '@/lib/supabase/server';

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function getRuntimeVersion() {
  const supabase = createServiceClient();
  const [plans, currencies, regions, runtimeMarker] = await Promise.all([
    supabase.from('subscription_plans').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('supported_currencies').select('created_at').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('region_config').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from('platform_settings')
      .select('updated_at')
      .eq('setting_key', 'runtime_config_version')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const stamps = [
    plans.data?.updated_at ? Date.parse(plans.data.updated_at) : 0,
    currencies.data?.created_at ? Date.parse(currencies.data.created_at) : 0,
    regions.data?.updated_at ? Date.parse(regions.data.updated_at) : 0,
    runtimeMarker.data?.updated_at ? Date.parse(runtimeMarker.data.updated_at) : 0,
  ];

  const latest = Math.max(...stamps, 0);
  const updatedAt = latest ? new Date(latest).toISOString() : new Date().toISOString();

  return {
    version: String(latest || Date.now()),
    updatedAt,
  };
}

export async function GET(request: Request) {
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let shutdown: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (heartbeat) clearInterval(heartbeat);
    if (shutdown) clearTimeout(shutdown);
  };

  const stream = new ReadableStream({
    start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return false;
        try {
          controller.enqueue(chunk);
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const push = async () => {
        if (closed) return;
        try {
          const version = await getRuntimeVersion();
          safeEnqueue(sseEvent('runtime-config', version));
        } catch {
          cleanup();
        }
      };

      safeEnqueue(sseEvent('ready', { ok: true }));
      void push();
      timer = setInterval(() => void push(), 15000);
      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      // Keep each invocation under Vercel's default serverless timeout.
      shutdown = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {
          // no-op
        }
      }, 25000);
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener('abort', cleanup);

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

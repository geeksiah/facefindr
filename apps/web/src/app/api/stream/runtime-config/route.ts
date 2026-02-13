export const dynamic = 'force-dynamic';

import { createServiceClient } from '@/lib/supabase/server';

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function getRuntimeVersion() {
  const supabase = createServiceClient();
  const [plans, currencies, regions, runtimeMarker] = await Promise.all([
    supabase.from('subscription_plans').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('supported_currencies').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
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
    currencies.data?.updated_at ? Date.parse(currencies.data.updated_at) : 0,
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

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const push = async () => {
        if (closed) return;
        const version = await getRuntimeVersion();
        controller.enqueue(sseEvent('runtime-config', version));
      };

      controller.enqueue(sseEvent('ready', { ok: true }));
      void push();
      const timer = setInterval(() => void push(), 15000);
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': ping\n\n'));
      }, 15000);

      return () => {
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { createClient } from '@/lib/supabase/server';

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

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
          const [{ data: photographerSub }, { data: attendeeSub }] = await Promise.all([
            supabase
              .from('subscriptions')
              .select('id, plan_code, status, current_period_end, updated_at')
              .eq('photographer_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('attendee_subscriptions')
              .select('id, plan_code, status, current_period_end, updated_at')
              .eq('attendee_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          const stamps = [
            photographerSub?.updated_at ? Date.parse(photographerSub.updated_at) : 0,
            attendeeSub?.updated_at ? Date.parse(attendeeSub.updated_at) : 0,
          ];
          const version = Math.max(...stamps, 0);

          safeEnqueue(
            sseEvent('subscriptions', {
              photographer: photographerSub || null,
              attendee: attendeeSub || null,
              updatedAt: version ? new Date(version).toISOString() : new Date().toISOString(),
              version: String(version || Date.now()),
            })
          );
        } catch {
          cleanup();
        }
      };

      safeEnqueue(sseEvent('ready', { ok: true }));
      void push();
      timer = setInterval(() => void push(), 10000);
      heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(': ping\n\n'));
      }, 15000);

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

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
          const [{ count }, { data }] = await Promise.all([
            supabase
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('is_hidden', false)
              .is('read_at', null),
            supabase
              .from('notifications')
              .select('id, channel, template_code, category, subject, body, status, created_at, read_at, action_url, details, dedupe_key, actor_user_id, metadata')
              .eq('user_id', user.id)
              .eq('is_hidden', false)
              .order('created_at', { ascending: false })
              .limit(20),
          ]);

          const version = (data || []).reduce((acc, row: any) => {
            const createdAt = row.created_at ? Date.parse(row.created_at) : 0;
            const readAt = row.read_at ? Date.parse(row.read_at) : 0;
            const stamp = Math.max(createdAt, readAt, 0);
            return stamp > acc ? stamp : acc;
          }, 0);

          safeEnqueue(
            sseEvent('notifications', {
              unreadCount: count || 0,
              notifications: data || [],
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

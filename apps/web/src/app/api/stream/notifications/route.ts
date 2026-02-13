export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';

const encoder = new TextEncoder();

function sseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const push = async () => {
        if (closed) return;
        const [{ count }, { data }] = await Promise.all([
          supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .is('read_at', null),
          supabase
            .from('notifications')
            .select('id, channel, subject, body, status, created_at, read_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        const version = (data || []).reduce((acc, row: any) => {
          const createdAt = row.created_at ? Date.parse(row.created_at) : 0;
          const readAt = row.read_at ? Date.parse(row.read_at) : 0;
          const stamp = Math.max(createdAt, readAt, 0);
          return stamp > acc ? stamp : acc;
        }, 0);

        controller.enqueue(
          sseEvent('notifications', {
            unreadCount: count || 0,
            notifications: data || [],
            updatedAt: version ? new Date(version).toISOString() : new Date().toISOString(),
            version: String(version || Date.now()),
          })
        );
      };

      controller.enqueue(sseEvent('ready', { ok: true }));
      void push();
      const timer = setInterval(() => void push(), 10000);

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

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

        controller.enqueue(
          sseEvent('subscriptions', {
            photographer: photographerSub || null,
            attendee: attendeeSub || null,
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

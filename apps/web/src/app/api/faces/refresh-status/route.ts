import { NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// FACE REFRESH STATUS API
// Check if user needs to refresh their face profile
// SRS §3.3.2: Confidence-based and time-based refresh
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    // Call the database function to get comprehensive refresh status
    const { data: refreshStatus, error } = await serviceClient
      .rpc('get_refresh_status', { p_user_id: user.id });

    if (error) {
      console.error('Failed to get refresh status:', error);
      return NextResponse.json(
        { error: 'Failed to check refresh status' },
        { status: 500 }
      );
    }

    // Get pending refresh prompts
    const { data: pendingPrompts } = await serviceClient
      .from('refresh_prompts')
      .select('*')
      .eq('user_id', user.id)
      .in('prompt_status', ['pending', 'shown'])
      .order('created_at', { ascending: false })
      .limit(1);

    const status = refreshStatus?.[0] || {
      needs_refresh: false,
      reason: null,
      prompt_strength: 'none',
      confidence_avg: 100,
      days_since_refresh: 0,
      next_due_date: null,
    };

    // Get embedding count
    const { count: embeddingCount } = await serviceClient
      .from('user_face_embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    return NextResponse.json({
      needsRefresh: status.needs_refresh,
      reason: status.reason,
      promptStrength: status.prompt_strength,
      confidenceAverage: parseFloat(status.confidence_avg) || 100,
      daysSinceRefresh: status.days_since_refresh || 0,
      nextDueDate: status.next_due_date,
      pendingPrompt: pendingPrompts?.[0] || null,
      embeddingCount: embeddingCount || 0,
      thresholds: {
        confidenceMinimum: 75,
        highConfidenceThreshold: 90,
      },
    });

  } catch (error) {
    console.error('Refresh status error:', error);
    return NextResponse.json(
      { error: 'Failed to get refresh status' },
      { status: 500 }
    );
  }
}

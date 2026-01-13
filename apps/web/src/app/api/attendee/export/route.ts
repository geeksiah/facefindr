import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// ============================================
// EXPORT ATTENDEE DATA (GDPR Compliance)
// ============================================

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get attendee profile
    const { data: attendee } = await supabase
      .from('attendees')
      .select('*')
      .eq('id', user.id)
      .single();

    // Get face profiles (metadata only, not the actual face data)
    const { data: faceProfiles } = await supabase
      .from('attendee_face_profiles')
      .select('id, is_primary, source, confidence, created_at')
      .eq('attendee_id', user.id);

    // Get consents
    const { data: consents } = await supabase
      .from('attendee_consents')
      .select('consent_type, consent_version, granted_at, withdrawn_at')
      .eq('attendee_id', user.id);

    // Get entitlements
    const { data: entitlements } = await supabase
      .from('entitlements')
      .select(`
        id,
        entitlement_type,
        created_at,
        events (name),
        media (original_filename)
      `)
      .eq('attendee_id', user.id);

    // Get transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('gross_amount, currency, status, created_at')
      .eq('attendee_id', user.id);

    // Get download logs
    const { data: downloads } = await supabase
      .from('download_logs')
      .select('downloaded_at')
      .eq('attendee_id', user.id);

    const exportData = {
      exportDate: new Date().toISOString(),
      profile: {
        id: attendee?.id,
        email: attendee?.email,
        displayName: attendee?.display_name,
        faceTag: attendee?.face_tag,
        status: attendee?.status,
        createdAt: attendee?.created_at,
        updatedAt: attendee?.updated_at,
      },
      faceProfiles: faceProfiles?.map(fp => ({
        id: fp.id,
        isPrimary: fp.is_primary,
        source: fp.source,
        confidence: fp.confidence,
        createdAt: fp.created_at,
      })) || [],
      consents: consents?.map(c => ({
        type: c.consent_type,
        version: c.consent_version,
        grantedAt: c.granted_at,
        withdrawnAt: c.withdrawn_at,
      })) || [],
      purchases: entitlements?.map(e => ({
        id: e.id,
        type: e.entitlement_type,
        eventName: (e.events as any)?.name,
        fileName: (e.media as any)?.original_filename,
        createdAt: e.created_at,
      })) || [],
      transactions: transactions?.map(t => ({
        amount: t.gross_amount,
        currency: t.currency,
        status: t.status,
        createdAt: t.created_at,
      })) || [],
      downloads: downloads?.map(d => ({
        downloadedAt: d.downloaded_at,
      })) || [],
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="facefindr-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });

  } catch (error) {
    console.error('Failed to export data:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}

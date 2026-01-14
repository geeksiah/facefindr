import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, hasPermission, logAction } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; action: string } }
) {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, action } = params;

    // Check permissions
    const permissionMap: Record<string, string> = {
      suspend: 'users.suspend',
      unsuspend: 'users.suspend',
      delete: 'users.delete',
      'delete-face': 'users.delete',
      'export-data': 'users.view',
    };

    const requiredPermission = permissionMap[action];
    if (requiredPermission && !(await hasPermission(requiredPermission))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    switch (action) {
      case 'suspend': {
        await supabaseAdmin
          .from('attendees')
          .update({ status: 'suspended' })
          .eq('id', id);

        await logAction('user_suspend', 'attendee', id, { action: 'suspend' });
        return NextResponse.json({ success: true });
      }

      case 'unsuspend': {
        await supabaseAdmin
          .from('attendees')
          .update({ status: 'active' })
          .eq('id', id);

        await logAction('user_unsuspend', 'attendee', id, { action: 'unsuspend' });
        return NextResponse.json({ success: true });
      }

      case 'delete-face': {
        // Delete face embeddings
        await supabaseAdmin
          .from('user_face_embeddings')
          .delete()
          .eq('user_id', id);

        // Delete face matches
        await supabaseAdmin
          .from('face_matches')
          .delete()
          .eq('attendee_id', id);

        // Update attendee to mark face as deleted
        await supabaseAdmin
          .from('attendees')
          .update({ last_face_refresh: null })
          .eq('id', id);

        await logAction('user_delete', 'attendee', id, { action: 'delete-face' });
        return NextResponse.json({ success: true });
      }

      case 'export-data': {
        // GDPR data export - gather all user data
        const [
          { data: attendee },
          { data: transactions },
          { data: entitlements },
          { data: consents },
          { data: faceMatches },
        ] = await Promise.all([
          supabaseAdmin.from('attendees').select('*').eq('id', id).single(),
          supabaseAdmin.from('transactions').select('*').eq('attendee_id', id),
          supabaseAdmin.from('entitlements').select('*').eq('attendee_id', id),
          supabaseAdmin.from('consents').select('*').eq('user_id', id),
          supabaseAdmin.from('face_matches').select('id, event_id, confidence, created_at').eq('attendee_id', id),
        ]);

        const exportData = {
          exportDate: new Date().toISOString(),
          profile: attendee,
          transactions: transactions || [],
          entitlements: entitlements || [],
          consents: consents || [],
          faceMatches: faceMatches || [],
        };

        await logAction('user_verify', 'attendee', id, { action: 'export-data' });

        return new NextResponse(JSON.stringify(exportData, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="attendee-data-${id}.json"`,
          },
        });
      }

      case 'delete': {
        // Delete user from Supabase Auth (cascade will handle the rest)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_delete', 'attendee', id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Attendee action error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

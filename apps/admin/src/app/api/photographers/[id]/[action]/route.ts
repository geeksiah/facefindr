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
      verify: 'users.verify',
      'reset-password': 'users.verify',
      'send-verification': 'users.verify',
    };

    const requiredPermission = permissionMap[action];
    if (requiredPermission && !(await hasPermission(requiredPermission))) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    switch (action) {
      case 'suspend': {
        await supabaseAdmin
          .from('photographers')
          .update({ status: 'suspended' })
          .eq('id', id);

        await logAction('user_suspend', 'photographer', id, { action: 'suspend' });
        return NextResponse.json({ success: true });
      }

      case 'unsuspend': {
        await supabaseAdmin
          .from('photographers')
          .update({ status: 'active' })
          .eq('id', id);

        await logAction('user_unsuspend', 'photographer', id, { action: 'unsuspend' });
        return NextResponse.json({ success: true });
      }

      case 'verify': {
        await supabaseAdmin
          .from('photographers')
          .update({ 
            email_verified: true,
            status: 'active',
          })
          .eq('id', id);

        await logAction('user_verify', 'photographer', id);
        return NextResponse.json({ success: true });
      }

      case 'reset-password': {
        // Get photographer email
        const { data: photographer } = await supabaseAdmin
          .from('photographers')
          .select('email')
          .eq('id', id)
          .single();

        if (!photographer) {
          return NextResponse.json({ error: 'Photographer not found' }, { status: 404 });
        }

        // Generate password reset via Supabase Auth
        const { error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: photographer.email,
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_verify', 'photographer', id, { action: 'reset-password' });
        return NextResponse.json({ success: true });
      }

      case 'send-verification': {
        // Get photographer email
        const { data: photographer } = await supabaseAdmin
          .from('photographers')
          .select('email')
          .eq('id', id)
          .single();

        if (!photographer) {
          return NextResponse.json({ error: 'Photographer not found' }, { status: 404 });
        }

        // Send verification email via Supabase Auth
        const { error } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: photographer.email,
        });

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_verify', 'photographer', id, { action: 'send-verification' });
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        // Delete user from Supabase Auth (cascade will handle the rest)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await logAction('user_delete', 'photographer', id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Photographer action error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

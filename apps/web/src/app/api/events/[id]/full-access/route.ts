export const dynamic = 'force-dynamic';

/**
 * Event Full Access API
 * 
 * Manage full photo access for employers, clients, and VIPs
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET - Check if current user has full access
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: eventId } = params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ hasAccess: false });
    }

    // Use RPC to check full access
    const { data: hasAccess, error } = await supabase.rpc('has_event_full_access', {
      p_event_id: eventId,
      p_user_id: user.id,
    });

    if (error) {
      console.error('Full access check error:', error);
      return NextResponse.json({ hasAccess: false });
    }

    return NextResponse.json({ hasAccess: !!hasAccess });
  } catch (error) {
    console.error('Full access GET error:', error);
    return NextResponse.json({ hasAccess: false });
  }
}

// POST - Grant full access to a user
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: eventId } = params;
    const supabase = await createClient();
    const serviceClient = createServiceClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is the event owner
    const { data: event } = await supabase
      .from('events')
      .select('photographer_id')
      .eq('id', eventId)
      .single();

    if (!event || event.photographer_id !== user.id) {
      return NextResponse.json({ error: 'Only event owner can grant access' }, { status: 403 });
    }

    const body = await request.json();
    const { email, userType = 'client', notes, expiresAt } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Find user by email
    const { data: targetUser } = await serviceClient
      .from('auth.users')
      .select('id')
      .eq('email', email)
      .single();

    // If user doesn't exist, we could create an invite or just store the email
    // For now, we require the user to exist
    if (!targetUser) {
      // Try to find in photographers or attendees tables
      let userId: string | null = null;
      
      const { data: photographer } = await serviceClient
        .from('photographers')
        .select('id')
        .eq('email', email)
        .single();
      
      if (photographer) {
        userId = photographer.id;
      } else {
        const { data: attendee } = await serviceClient
          .from('attendees')
          .select('id')
          .eq('email', email)
          .single();
        
        if (attendee) {
          userId = attendee.id;
        }
      }

      if (!userId) {
        return NextResponse.json(
          { error: 'User not found. They must create an account first.' },
          { status: 404 }
        );
      }

      // Grant access
      const { data: access, error } = await serviceClient
        .from('event_full_access')
        .upsert({
          event_id: eventId,
          user_id: userId,
          user_type: userType,
          granted_by: user.id,
          notes,
          expires_at: expiresAt || null,
          is_active: true,
        }, {
          onConflict: 'event_id,user_id',
        })
        .select()
        .single();

      if (error) {
        console.error('Grant access error:', error);
        return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 });
      }

      return NextResponse.json({ success: true, access });
    }

    // Grant access to existing user
    const { data: access, error } = await serviceClient
      .from('event_full_access')
      .upsert({
        event_id: eventId,
        user_id: targetUser.id,
        user_type: userType,
        granted_by: user.id,
        notes,
        expires_at: expiresAt || null,
        is_active: true,
      }, {
        onConflict: 'event_id,user_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Grant access error:', error);
      return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 });
    }

    return NextResponse.json({ success: true, access });
  } catch (error) {
    console.error('Full access POST error:', error);
    return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 });
  }
}

// DELETE - Revoke full access
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: eventId } = params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is the event owner
    const { data: event } = await supabase
      .from('events')
      .select('photographer_id')
      .eq('id', eventId)
      .single();

    if (!event || event.photographer_id !== user.id) {
      return NextResponse.json({ error: 'Only event owner can revoke access' }, { status: 403 });
    }

    // Revoke access
    const { error } = await supabase
      .from('event_full_access')
      .update({ is_active: false })
      .eq('event_id', eventId)
      .eq('user_id', userId);

    if (error) {
      console.error('Revoke access error:', error);
      return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Full access DELETE error:', error);
    return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 });
  }
}


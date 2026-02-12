export const dynamic = 'force-dynamic';

/**
 * Contacts Management API
 * 
 * Add, remove, and manage user contacts
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

// GET - List contacts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select(`
        id,
        contact_id,
        contact_type,
        added_at,
        last_interaction_at,
        contact:contact_id (
          id,
          display_name,
          face_tag,
          profile_photo_url
        )
      `)
      .eq('user_id', user.id)
      .neq('contact_type', 'blocked')
      .order('added_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      contacts: contacts || [],
    });

  } catch (error) {
    console.error('Contacts fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}

// POST - Add contact
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contactId, contactType = 'mutual' } = await request.json();

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    if (contactId === user.id) {
      return NextResponse.json({ error: 'Cannot add yourself as contact' }, { status: 400 });
    }

    // Check if contact exists
    const { data: contact } = await supabase
      .from('attendees')
      .select('id')
      .eq('id', contactId)
      .single();

    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }

    // Add contact
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        user_id: user.id,
        contact_id: contactId,
        contact_type: contactType,
      })
      .select()
      .single();

    if (error) {
      // Check if already exists
      if (error.code === '23505') {
        // Update existing contact
        const { data: updated } = await supabase
          .from('contacts')
          .update({ contact_type: contactType })
          .eq('user_id', user.id)
          .eq('contact_id', contactId)
          .select()
          .single();

        return NextResponse.json({ success: true, contact: updated });
      }
      return NextResponse.json({ error: 'Failed to add contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true, contact: newContact });

  } catch (error) {
    console.error('Add contact error:', error);
    return NextResponse.json(
      { error: 'Failed to add contact' },
      { status: 500 }
    );
  }
}

// DELETE - Remove contact
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contactId');

    if (!contactId) {
      return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', user.id)
      .eq('contact_id', contactId);

    if (error) {
      return NextResponse.json({ error: 'Failed to remove contact' }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Remove contact error:', error);
    return NextResponse.json(
      { error: 'Failed to remove contact' },
      { status: 500 }
    );
  }
}


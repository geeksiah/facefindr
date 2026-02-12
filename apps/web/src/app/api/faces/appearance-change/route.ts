export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

// ============================================
// APPEARANCE CHANGE API
// Log user-declared appearance changes
// SRS §3.3.2: Layer 4 - Self-Declared Appearance Changes
// ============================================

const VALID_CHANGE_TYPES = [
  'new_hairstyle',
  'facial_hair',
  'new_glasses',
  'weight_change',
  'aging',
  'temporary_costume',
  'other',
] as const;

const VALID_CHANGE_MODES = [
  'add_to_profile',
  'replace_profile',
  'temporary',
] as const;

type ChangeType = typeof VALID_CHANGE_TYPES[number];
type ChangeMode = typeof VALID_CHANGE_MODES[number];

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      changeType, 
      changeMode, 
      description,
      temporaryUntil, // ISO date string for temporary changes
    } = body;

    // Validate change type
    if (!changeType || !VALID_CHANGE_TYPES.includes(changeType as ChangeType)) {
      return NextResponse.json({ 
        error: 'Invalid change type',
        validTypes: VALID_CHANGE_TYPES,
      }, { status: 400 });
    }

    // Validate change mode
    if (!changeMode || !VALID_CHANGE_MODES.includes(changeMode as ChangeMode)) {
      return NextResponse.json({ 
        error: 'Invalid change mode',
        validModes: VALID_CHANGE_MODES,
      }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // For temporary changes, validate temporaryUntil
    let temporaryUntilDate: string | null = null;
    if (changeMode === 'temporary') {
      if (!temporaryUntil) {
        // Default to 7 days for temporary changes
        const defaultEnd = new Date();
        defaultEnd.setDate(defaultEnd.getDate() + 7);
        temporaryUntilDate = defaultEnd.toISOString();
      } else {
        temporaryUntilDate = new Date(temporaryUntil).toISOString();
      }
    }

    // Log the appearance change
    const { data: change, error: insertError } = await serviceClient
      .from('appearance_changes')
      .insert({
        user_id: user.id,
        change_type: changeType,
        change_mode: changeMode,
        description,
        is_temporary: changeMode === 'temporary',
        temporary_until: temporaryUntilDate,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to log appearance change:', insertError);
      return NextResponse.json(
        { error: 'Failed to log appearance change' },
        { status: 500 }
      );
    }

    // Create a refresh prompt if needed
    if (changeMode !== 'temporary') {
      await serviceClient
        .from('refresh_prompts')
        .insert({
          user_id: user.id,
          prompt_type: 'appearance_change',
          trigger_reason: `User declared: ${changeType}`,
        });
    }

    // Get guidance based on change type
    const guidance = getChangeGuidance(changeType as ChangeType, changeMode as ChangeMode);

    return NextResponse.json({
      success: true,
      changeId: change.id,
      guidance,
      nextStep: changeMode === 'temporary' 
        ? 'Your profile will be restored after the temporary period'
        : 'Please update your face profile to improve matching',
    });

  } catch (error) {
    console.error('Appearance change error:', error);
    return NextResponse.json(
      { error: 'Failed to log appearance change' },
      { status: 500 }
    );
  }
}

// Get list of appearance changes for current user
export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();

    const { data: changes, error } = await serviceClient
      .from('appearance_changes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Failed to fetch appearance changes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch changes' },
        { status: 500 }
      );
    }

    // Check for active temporary changes
    const activeTemporary = changes?.filter(c => 
      c.is_temporary && 
      c.temporary_until && 
      new Date(c.temporary_until) > new Date()
    ) || [];

    return NextResponse.json({
      changes,
      activeTemporaryChanges: activeTemporary,
      changeTypes: VALID_CHANGE_TYPES,
      changeModes: VALID_CHANGE_MODES,
    });

  } catch (error) {
    console.error('Get changes error:', error);
    return NextResponse.json(
      { error: 'Failed to get changes' },
      { status: 500 }
    );
  }
}

// End a temporary change early
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const changeId = searchParams.get('id');

    if (!changeId) {
      return NextResponse.json({ error: 'Change ID required' }, { status: 400 });
    }

    const serviceClient = createServiceClient();

    // End the temporary change by setting temporary_until to now
    const { error } = await serviceClient
      .from('appearance_changes')
      .update({ temporary_until: new Date().toISOString() })
      .eq('id', changeId)
      .eq('user_id', user.id)
      .eq('is_temporary', true);

    if (error) {
      console.error('Failed to end temporary change:', error);
      return NextResponse.json(
        { error: 'Failed to end temporary change' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('End temporary change error:', error);
    return NextResponse.json(
      { error: 'Failed to end temporary change' },
      { status: 500 }
    );
  }
}

// Helper function to provide guidance based on change type
function getChangeGuidance(changeType: ChangeType, changeMode: ChangeMode): string {
  const guidance: Record<ChangeType, string> = {
    new_hairstyle: 'For best results, take new photos showing your current hairstyle from multiple angles.',
    facial_hair: 'Facial hair changes can significantly affect matching. Please update your profile photos.',
    new_glasses: 'If you now wear glasses regularly, include photos both with and without them.',
    weight_change: 'Significant weight changes may affect facial features. Update your profile for better accuracy.',
    aging: 'Regular updates help maintain accurate matching as your appearance naturally changes.',
    temporary_costume: 'Temporary mode activated. Your original profile will be restored automatically.',
    other: 'Please describe your change and update your profile photos for the best matching experience.',
  };

  const modeNote: Record<ChangeMode, string> = {
    add_to_profile: ' New photos will be added to your existing profile.',
    replace_profile: ' Your existing profile photos will be replaced.',
    temporary: ' This is a temporary change and will revert automatically.',
  };

  return guidance[changeType] + modeNote[changeMode];
}


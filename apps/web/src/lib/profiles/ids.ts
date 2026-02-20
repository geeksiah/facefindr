function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

async function selectProfileById(
  supabase: any,
  table: 'photographers' | 'attendees',
  id: string
) {
  return supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .limit(1)
    .maybeSingle();
}

export async function resolvePhotographerProfileByUser(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const byId = await selectProfileById(supabase, 'photographers', userId);
  if (byId.data?.id) {
    return { data: { id: byId.data.id, user_id: byId.data.id }, error: null };
  }

  if (userEmail) {
    const byEmail = await supabase
      .from('photographers')
      .select('id')
      .eq('email', userEmail)
      .limit(1)
      .maybeSingle();

    if (byEmail.data?.id) {
      return {
        data: { id: byEmail.data.id, user_id: byEmail.data.id },
        error: null,
      };
    }
    return { data: null, error: byEmail.error };
  }

  return { data: null, error: byId.error };
}

export async function getPhotographerIdCandidates(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const resolved = await resolvePhotographerProfileByUser(supabase, userId, userEmail);
  return unique([userId, resolved.data?.id, resolved.data?.user_id]);
}

export async function resolveAttendeeProfileByUser(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const byId = await selectProfileById(supabase, 'attendees', userId);
  if (byId.data?.id) {
    return { data: { id: byId.data.id, user_id: byId.data.id }, error: null };
  }

  if (userEmail) {
    const byEmail = await supabase
      .from('attendees')
      .select('id')
      .eq('email', userEmail)
      .limit(1)
      .maybeSingle();

    if (byEmail.data?.id) {
      return {
        data: { id: byEmail.data.id, user_id: byEmail.data.id },
        error: null,
      };
    }
    return { data: null, error: byEmail.error };
  }

  return { data: null, error: byId.error };
}

export async function getAttendeeIdCandidates(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const resolved = await resolveAttendeeProfileByUser(supabase, userId, userEmail);
  return unique([userId, resolved.data?.id, resolved.data?.user_id]);
}

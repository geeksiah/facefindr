function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

export async function resolvePhotographerProfileByUser(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const byId = await supabase
    .from('photographers')
    .select('id, user_id')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (byId.data?.id) {
    return { data: { ...byId.data, user_id: (byId.data as any).user_id || userId }, error: null };
  }

  const byUserId = await supabase
    .from('photographers')
    .select('id, user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
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
        data: { id: byEmail.data.id, user_id: userId },
        error: null,
      };
    }
  }

  return { data: null, error: byUserId.error };
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
  const byId = await supabase
    .from('attendees')
    .select('id, user_id')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (byId.data?.id) {
    return { data: { ...byId.data, user_id: (byId.data as any).user_id || userId }, error: null };
  }

  const byUserId = await supabase
    .from('attendees')
    .select('id, user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!byUserId.error || !isMissingColumnError(byUserId.error, 'user_id')) {
    return byUserId;
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
        data: { id: byEmail.data.id, user_id: userId },
        error: null,
      };
    }
  }

  return { data: null, error: byUserId.error };
}

export async function getAttendeeIdCandidates(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const resolved = await resolveAttendeeProfileByUser(supabase, userId, userEmail);
  return unique([userId, resolved.data?.id, resolved.data?.user_id]);
}

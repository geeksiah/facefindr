function isMissingColumnError(error: any, columnName: string) {
  return error?.code === '42703' && typeof error?.message === 'string' && error.message.includes(columnName);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

async function selectProfileById(
  supabase: any,
  table: 'photographers' | 'attendees',
  id: string
) {
  const withUserId = await supabase
    .from(table)
    .select('id, user_id')
    .eq('id', id)
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  const withoutUserId = await supabase
    .from(table)
    .select('id')
    .eq('id', id)
    .limit(1)
    .maybeSingle();

  if (withoutUserId.data?.id) {
    return {
      data: { id: withoutUserId.data.id, user_id: id },
      error: null,
    };
  }

  return withoutUserId;
}

async function selectProfileByUserId(
  supabase: any,
  table: 'photographers' | 'attendees',
  userId: string
) {
  const withUserId = await supabase
    .from(table)
    .select('id, user_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!withUserId.error || !isMissingColumnError(withUserId.error, 'user_id')) {
    return withUserId;
  }

  return { data: null, error: withUserId.error };
}

export async function resolvePhotographerProfileByUser(
  supabase: any,
  userId: string,
  userEmail?: string | null
) {
  const byId = await selectProfileById(supabase, 'photographers', userId);

  if (byId.data?.id) {
    return { data: { ...byId.data, user_id: (byId.data as any).user_id || userId }, error: null };
  }

  const byUserId = await selectProfileByUserId(supabase, 'photographers', userId);

  if (byUserId.data?.id) {
    return byUserId;
  }

  if (byUserId.error && !isMissingColumnError(byUserId.error, 'user_id')) {
    return { data: null, error: byUserId.error };
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
  const byId = await selectProfileById(supabase, 'attendees', userId);

  if (byId.data?.id) {
    return { data: { ...byId.data, user_id: (byId.data as any).user_id || userId }, error: null };
  }

  const byUserId = await selectProfileByUserId(supabase, 'attendees', userId);

  if (byUserId.data?.id) {
    return byUserId;
  }

  if (byUserId.error && !isMissingColumnError(byUserId.error, 'user_id')) {
    return { data: null, error: byUserId.error };
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

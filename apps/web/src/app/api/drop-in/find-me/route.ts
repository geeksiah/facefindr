export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { crawlExternalPlatforms, hasExternalCrawlerProviderConfigured } from '@/lib/drop-in/external-crawler';
import { getAttendeeIdCandidates, resolveAttendeeProfileByUser } from '@/lib/profiles/ids';
import { createClient, createClientWithAccessToken, createServiceClient } from '@/lib/supabase/server';

type SearchType = 'internal' | 'contacts' | 'external';

const SEARCH_CREDIT_COST: Record<SearchType, number> = {
  internal: 3,
  contacts: 3,
  external: 5,
};

function isSearchType(value: unknown): value is SearchType {
  return value === 'internal' || value === 'contacts' || value === 'external';
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = accessToken ? createClientWithAccessToken(accessToken) : await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const resolvedAttendee = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
    const attendeeId = resolvedAttendee.data?.id;
    if (!attendeeId) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }
    const attendeeIdCandidates = await getAttendeeIdCandidates(serviceClient, user.id, user.email);

    const [{ data: attendee }, { data: searches }, { data: rawResults }] = await Promise.all([
      serviceClient.from('attendees').select('drop_in_credits').eq('id', attendeeId).maybeSingle(),
      supabase
        .from('drop_in_searches')
        .select('id, search_type, status, match_count, credits_used, error_message, created_at, completed_at')
        .in('attendee_id', attendeeIdCandidates)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('drop_in_search_results')
        .select(
          `
            id,
            search_id,
            source,
            confidence,
            external_url,
            created_at,
            media:media_id (
              id,
              storage_path,
              thumbnail_path,
              event:event_id (
                id,
                name,
                photographer:photographer_id (
                  display_name
                )
              )
            )
          `
        )
        .in('attendee_id', attendeeIdCandidates)
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    const mediaPaths: string[] = Array.from(
      new Set(
        (rawResults || [])
          .map((row: any) => row.media?.thumbnail_path || row.media?.storage_path)
          .filter((path: string | null | undefined): path is string => !!path)
      )
    );

    const signedEntries: Array<readonly [string, string | null]> = await Promise.all(
      mediaPaths.map(async (path) => {
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        const { data } = await serviceClient.storage.from('media').createSignedUrl(cleanPath, 3600);
        return [path, data?.signedUrl || null] as const;
      })
    );
    const signedMap = new Map<string, string | null>(signedEntries);

    const results = (rawResults || []).map((row: any) => {
      const mediaPath = row.media?.thumbnail_path || row.media?.storage_path;
      return {
        id: row.id,
        searchId: row.search_id,
        source: row.source,
        confidence: row.confidence || 0,
        externalUrl: row.external_url || null,
        createdAt: row.created_at,
        mediaId: row.media?.id || null,
        thumbnailUrl: mediaPath ? signedMap.get(mediaPath) || null : null,
        eventName: row.media?.event?.name || null,
        photographerName: row.media?.event?.photographer?.display_name || null,
      };
    });

    return NextResponse.json({
      success: true,
      credits: attendee?.drop_in_credits || 0,
      searches: (searches || []).map((search) => ({
        id: search.id,
        searchType: search.search_type,
        status: search.status,
        matchCount: search.match_count || 0,
        creditsUsed: search.credits_used || 0,
        errorMessage: search.error_message || null,
        createdAt: search.created_at,
        completedAt: search.completed_at,
      })),
      results,
    });
  } catch (error) {
    console.error('Drop-in find-me GET error:', error);
    return NextResponse.json({ error: 'Failed to load Drop-In search data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const accessToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = accessToken ? createClientWithAccessToken(accessToken) : await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceClient();
    const resolvedAttendee = await resolveAttendeeProfileByUser(serviceClient, user.id, user.email);
    const attendeeId = resolvedAttendee.data?.id;
    if (!attendeeId) {
      return NextResponse.json({ error: 'Attendee profile not found' }, { status: 404 });
    }
    const attendeeIdCandidates = await getAttendeeIdCandidates(serviceClient, user.id, user.email);
    const payload = await request.json().catch(() => ({}));
    const searchType = payload?.searchType;
    const contactQuery = typeof payload?.contactQuery === 'string' ? payload.contactQuery.trim() : '';

    if (!isSearchType(searchType)) {
      return NextResponse.json({ error: 'Invalid searchType' }, { status: 400 });
    }

    const { data: search, error: searchCreateError } = await supabase
      .from('drop_in_searches')
      .insert({
        attendee_id: attendeeId,
        search_type: searchType,
        status: 'processing',
        started_at: new Date().toISOString(),
        credits_used: 0,
      })
      .select('id')
      .single();

    if (searchCreateError || !search) {
      return NextResponse.json({ error: 'Failed to start search' }, { status: 500 });
    }

    const failSearch = async (message: string) => {
      await supabase
        .from('drop_in_searches')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', search.id);
    };

    const completeSearch = async (count: number, creditsUsed: number) => {
      await supabase
        .from('drop_in_searches')
        .update({
          status: 'completed',
          match_count: count,
          credits_used: creditsUsed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', search.id);
    };

    let creditsUsed = 0;
    const requiredCredits = SEARCH_CREDIT_COST[searchType];

    const { data: attendeeProfile } = await serviceClient
      .from('attendees')
      .select('display_name, face_tag, drop_in_credits')
      .eq('id', attendeeId)
      .maybeSingle();

    if (!attendeeProfile?.display_name) {
      await failSearch('Attendee profile missing display name');
      return NextResponse.json({ error: 'Attendee profile is incomplete' }, { status: 400 });
    }

    if (Number(attendeeProfile.drop_in_credits || 0) < requiredCredits) {
      await failSearch(`Insufficient credits for ${searchType} search`);
      return NextResponse.json(
        { error: `Insufficient credits (${requiredCredits} required)` },
        { status: 402 }
      );
    }

    if (searchType === 'external') {
      if (!hasExternalCrawlerProviderConfigured()) {
        await failSearch('External crawler providers are not configured');
        return NextResponse.json(
          { error: 'External crawler providers are not configured' },
          { status: 503 }
        );
      }

      let externalResults;
      try {
        externalResults = await crawlExternalPlatforms({
          displayName: attendeeProfile.display_name,
          faceTag: attendeeProfile.face_tag,
          contactQuery,
          limit: 30,
        });
      } catch (error: any) {
        await failSearch(error?.message || 'External crawler failed');
        return NextResponse.json(
          { error: error?.message || 'External crawler failed' },
          { status: 500 }
        );
      }

      const { data: creditsConsumed, error: creditsError } = await supabase.rpc('use_drop_in_credits', {
        p_attendee_id: attendeeId,
        p_action: 'external_search',
        p_credits_needed: requiredCredits,
        p_metadata: {
          search_id: search.id,
          results_count: externalResults.length,
        },
      });

      if (creditsError || !creditsConsumed) {
        await failSearch('Insufficient credits for external search');
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
      }

      creditsUsed = requiredCredits;

      const searchResultsToInsert = externalResults.map((result) => ({
        attendee_id: attendeeId,
        search_id: search.id,
        media_id: null,
        source: result.source,
        external_url: result.url,
        confidence: result.confidence,
        is_viewed: false,
        is_purchased: false,
      }));

      if (searchResultsToInsert.length > 0) {
        const { error: insertError } = await supabase.from('drop_in_search_results').insert(searchResultsToInsert);
        if (insertError) {
          await failSearch('Failed to store external search results');
          return NextResponse.json({ error: 'Failed to store external search results' }, { status: 500 });
        }
      }

      await completeSearch(searchResultsToInsert.length, creditsUsed);
      return NextResponse.json({
        success: true,
        searchId: search.id,
        resultsCount: searchResultsToInsert.length,
        searchType,
      });
    }

    const { data: creditsConsumed, error: creditsError } = await supabase.rpc('use_drop_in_credits', {
      p_attendee_id: attendeeId,
      p_action: searchType === 'contacts' ? 'contacts_search' : 'internal_search',
      p_credits_needed: requiredCredits,
      p_metadata: {
        search_id: search.id,
      },
    });

    if (creditsError || !creditsConsumed) {
      await failSearch(`Insufficient credits for ${searchType} search`);
      return NextResponse.json(
        { error: `Insufficient credits (${requiredCredits} required)` },
        { status: 402 }
      );
    }
    creditsUsed = requiredCredits;

    const { data: selfMatches } = await serviceClient
      .from('photo_drop_matches')
      .select('media_id')
      .in('attendee_id', attendeeIdCandidates);

    const { data: purchasedRows } = await supabase
      .from('entitlements')
      .select('media_id')
      .in('attendee_id', attendeeIdCandidates)
      .not('media_id', 'is', null);

    const internalMediaIds = Array.from(
      new Set([
        ...(selfMatches || []).map((row) => row.media_id),
        ...(purchasedRows || []).map((row) => row.media_id),
      ].filter(Boolean))
    );

    if (internalMediaIds.length === 0) {
      await completeSearch(0, creditsUsed);

      return NextResponse.json({ success: true, searchId: search.id, results: [] });
    }

    let filteredMediaIds = internalMediaIds;

    if (searchType === 'contacts') {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('user_id, contact_id, contact_type')
        .or(`user_id.eq.${attendeeId},contact_id.eq.${attendeeId}`)
        .neq('contact_type', 'blocked');

      const rawContactIds = (contacts || [])
        .map((contact) => (contact.user_id === attendeeId ? contact.contact_id : contact.user_id))
        .filter((id): id is string => !!id && id !== attendeeId);
      const uniqueContactIds = Array.from(new Set(rawContactIds));

      let candidateContactIds = uniqueContactIds;
      if (contactQuery.length >= 2 && uniqueContactIds.length > 0) {
        const { data: contactProfiles } = await serviceClient
          .from('attendees')
          .select('id, display_name, face_tag')
          .in('id', uniqueContactIds)
          .or(`display_name.ilike.%${contactQuery}%,face_tag.ilike.%${contactQuery.replace(/^@/, '')}%`);

        candidateContactIds = Array.from(new Set((contactProfiles || []).map((profile) => profile.id)));
      }

      if (candidateContactIds.length === 0) {
        filteredMediaIds = [];
      } else {
        const { data: contactMatches } = await serviceClient
          .from('photo_drop_matches')
          .select('media_id')
          .in('attendee_id', candidateContactIds)
          .in('media_id', internalMediaIds);

        filteredMediaIds = Array.from(
          new Set((contactMatches || []).map((row) => row.media_id).filter(Boolean))
        );
      }
    }

    if (filteredMediaIds.length === 0) {
      await completeSearch(0, creditsUsed);

      return NextResponse.json({ success: true, searchId: search.id, results: [] });
    }

    const { data: mediaRows } = await serviceClient
      .from('media')
      .select(
        `
          id,
          storage_path,
          thumbnail_path,
          event:event_id (
            id,
            name,
            photographer:photographer_id (
              display_name
            )
          )
        `
      )
      .in('id', filteredMediaIds)
      .limit(60);

    const searchResultsToInsert = (mediaRows || []).map((media: any) => ({
      attendee_id: attendeeId,
      search_id: search.id,
      media_id: media.id,
      source: 'ferchr',
      confidence: 100,
      is_viewed: false,
      is_purchased: false,
    }));

    if (searchResultsToInsert.length > 0) {
      await supabase.from('drop_in_search_results').insert(searchResultsToInsert);
    }

    await completeSearch(searchResultsToInsert.length, creditsUsed);

    return NextResponse.json({
      success: true,
      searchId: search.id,
      resultsCount: searchResultsToInsert.length,
      searchType,
    });
  } catch (error) {
    console.error('Drop-in find-me POST error:', error);
    return NextResponse.json({ error: 'Failed to run Drop-In search' }, { status: 500 });
  }
}

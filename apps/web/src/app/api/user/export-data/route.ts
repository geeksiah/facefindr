export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createStorageSignedUrl, uploadStorageObject } from '@/lib/storage/provider';
import { normalizeUserType } from '@/lib/user-type';
import { createClient, createClientWithAccessToken } from '@/lib/supabase/server';

const EXPORT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

async function getAuthClient(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  return accessToken
    ? createClientWithAccessToken(accessToken)
    : await createClient();
}

function normalizeStoragePath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function extractExportObjectPath(raw: string | null | undefined): string | null {
  const normalized = normalizeStoragePath(raw);
  if (!normalized) return null;

  if (normalized.startsWith('exports/')) {
    return normalized;
  }

  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    const pathname = decodeURIComponent(parsed.pathname || '');
    const publicMatch = pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/exports\/(.+)$/i);
    if (publicMatch?.[1]) {
      return `exports/${publicMatch[1].replace(/^\/+/, '')}`;
    }

    const genericExportsMatch = pathname.match(/\/exports\/(.+)$/i);
    if (genericExportsMatch?.[1]) {
      return `exports/${genericExportsMatch[1].replace(/^\/+/, '')}`;
    }
  } catch {
    return null;
  }

  return null;
}

// POST - Request data export
export async function POST(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if there's already a pending export request
    const { data: existingRequest } = await supabase
      .from('data_export_requests')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'processing'])
      .single();

    if (existingRequest) {
      return NextResponse.json({
        error: 'You already have a pending export request. Please wait for it to complete.',
        existingRequest: {
          id: existingRequest.id,
          status: existingRequest.status,
          requestedAt: existingRequest.requested_at,
        },
      }, { status: 400 });
    }

    const userType = normalizeUserType(user.user_metadata?.user_type) || 'attendee';

    // Create new export request
    const { data: exportRequest, error } = await supabase
      .from('data_export_requests')
      .insert({
        user_id: user.id,
        user_type: userType,
        email: user.email,
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating export request:', error);
      return NextResponse.json(
        { error: 'Failed to create export request' },
        { status: 500 }
      );
    }

    // In production, you would queue this job for background processing
    // For now, we'll process it inline (simplified version)
    await processDataExport(supabase, exportRequest.id, user.id, userType);

    return NextResponse.json({
      success: true,
      message: 'Export request created. You will receive an email when your data is ready.',
      request: {
        id: exportRequest.id,
        status: 'processing',
        email: user.email,
      },
    });

  } catch (error) {
    console.error('Data export request error:', error);
    return NextResponse.json(
      { error: 'Failed to request data export' },
      { status: 500 }
    );
  }
}

// GET - Check export request status
export async function GET(request: NextRequest) {
  try {
    const supabase = await getAuthClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the most recent export request
    const { data: requests, error } = await supabase
      .from('data_export_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching export requests:', error);
      return NextResponse.json(
        { error: 'Failed to fetch export requests' },
        { status: 500 }
      );
    }

    const mappedRequests = await Promise.all(
      (requests || []).map(async (r: any) => {
        const exportPath = extractExportObjectPath(r.download_url);
        const signedDownloadUrl =
          r.status === 'completed' && exportPath
            ? await createStorageSignedUrl('exports', exportPath, EXPORT_SIGNED_URL_TTL_SECONDS)
            : null;

        return {
          id: r.id,
          status: r.status,
          requestedAt: r.requested_at,
          processedAt: r.processed_at,
          completedAt: r.completed_at,
          expiresAt: r.expires_at,
          downloadUrl: signedDownloadUrl,
          fileSizeBytes: r.file_size_bytes,
          errorMessage: r.error_message,
        };
      })
    );

    return NextResponse.json({ requests: mappedRequests });

  } catch (error) {
    console.error('Export status fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch export status' },
      { status: 500 }
    );
  }
}

// Helper function to process data export
async function processDataExport(
  supabase: any,
  requestId: string,
  userId: string,
  userType: string
) {
  try {
    // Update status to processing
    await supabase
      .from('data_export_requests')
      .update({
        status: 'processing',
        processed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    // Collect user data based on type
    const exportData: Record<string, any> = {
      exportDate: new Date().toISOString(),
      userType,
    };

    if (userType === 'attendee') {
      // Fetch attendee profile
      const { data: profile } = await supabase
        .from('attendees')
        .select('*')
        .eq('id', userId)
        .single();
      
      exportData.profile = profile;

      // Fetch entitlements (purchased photos)
      const { data: entitlements } = await supabase
        .from('entitlements')
        .select('*, media:media_id(id, storage_path, thumbnail_path)')
        .eq('attendee_id', userId);
      
      exportData.purchases = entitlements || [];

      // Fetch privacy settings
      const { data: privacy } = await supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      exportData.privacySettings = privacy;

    } else if (userType === 'creator') {
      // Fetch photographer profile
      const { data: profile } = await supabase
        .from('photographers')
        .select('*')
        .eq('id', userId)
        .single();
      
      exportData.profile = profile;

      // Fetch events
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('photographer_id', userId);
      
      exportData.events = events || [];
      const eventIds = (events || []).map((event: any) => event.id);

      // Fetch media count for all creator-owned events
      let mediaCount = 0;
      if (eventIds.length > 0) {
        const mediaCountResult = await supabase
          .from('media')
          .select('id', { count: 'exact', head: true })
          .in('event_id', eventIds);
        mediaCount = mediaCountResult.count || 0;
      }
      
      exportData.mediaCount = mediaCount || 0;

      // Fetch wallet
      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('photographer_id', userId)
        .single();
      
      exportData.wallet = wallet;

      // Fetch transactions
      let transactions: any[] = [];
      if (eventIds.length > 0) {
        const { data: txRows } = await supabase
          .from('transactions')
          .select('*')
          .in('event_id', eventIds);
        transactions = txRows || [];
      }
      
      exportData.transactions = transactions || [];
    }

    // Convert to JSON and store
    const jsonData = JSON.stringify(exportData, null, 2);
    const fileName = `exports/${userId}/${requestId}.json`;

    // Upload to storage
    await uploadStorageObject('exports', fileName, jsonData, {
      contentType: 'application/json',
      cacheControl: '3600',
      upsert: true,
      supabaseClient: supabase,
    });

    // Calculate expiry (7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update request as completed
    await supabase
      .from('data_export_requests')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        download_url: fileName,
        file_size_bytes: Buffer.byteLength(jsonData, 'utf8'),
      })
      .eq('id', requestId);

    // TODO: Send email notification with download link
    // await sendExportReadyEmail(user.email, downloadUrl);

  } catch (error) {
    console.error('Error processing data export:', error);
    
    // Update request as failed
    await supabase
      .from('data_export_requests')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', requestId);
  }
}


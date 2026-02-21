export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceClient } from '@/lib/supabase/server';

async function isAdmin(supabase: any, user: { email?: string | null }) {
  if (!user.email) return false;
  const { data } = await supabase
    .from('admin_users')
    .select('id')
    .eq('email', user.email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user || !(await isAdmin(authClient, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit') || 25), 1), 100);
    const issuesLimit = Math.min(Math.max(Number(searchParams.get('issuesLimit') || 100), 1), 500);
    const status = String(searchParams.get('status') || '').trim().toLowerCase();

    const supabase = createServiceClient();

    let runsQuery = supabase
      .from('financial_reconciliation_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (status) {
      runsQuery = runsQuery.eq('status', status);
    }

    const { data: runs, error: runsError } = await runsQuery;
    if (runsError) {
      throw runsError;
    }

    const runIds = (runs || []).map((run: any) => run.id);
    let issuesQuery = supabase
      .from('financial_reconciliation_issues')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(issuesLimit);

    if (runIds.length > 0) {
      issuesQuery = issuesQuery.in('run_id', runIds);
    }

    const { data: issues, error: issuesError } = await issuesQuery;
    if (issuesError) {
      throw issuesError;
    }

    const openIssuesCount = (issues || []).filter((issue: any) => issue.status === 'open').length;

    return NextResponse.json({
      runs: runs || [],
      issues: issues || [],
      openIssuesCount,
    });
  } catch (error) {
    console.error('Admin finance reconciliation GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reconciliation data' },
      { status: 500 }
    );
  }
}

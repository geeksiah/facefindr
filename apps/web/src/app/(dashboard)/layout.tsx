import { redirect } from 'next/navigation';

import { DashboardHeader } from '@/components/dashboard/header';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { resolvePhotographerProfileByUser } from '@/lib/profiles/ids';
import { createClient } from '@/lib/supabase/server';

function isCreatorUser(userType: unknown): boolean {
  return userType === 'photographer' || userType === 'creator';
}

function toSidebarPlan(planCode: string | null | undefined): 'free' | 'starter' | 'pro' | 'studio' {
  const normalized = String(planCode || 'free').toLowerCase();
  if (normalized === 'starter' || normalized === 'pro' || normalized === 'studio') {
    return normalized;
  }
  return 'free';
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const userType = user.user_metadata?.user_type;
  
  // Only creators can access dashboard (supports legacy "photographer" and new "creator")
  if (!isCreatorUser(userType)) {
    redirect('/gallery');
  }

  // Get photographer profile
  const { data: resolvedProfile } = await resolvePhotographerProfileByUser(
    supabase,
    user.id,
    user.email
  );
  const creatorId = resolvedProfile?.id;
  if (!creatorId) {
    redirect('/onboarding');
  }

  const { data: profile } = await supabase
    .from('photographers')
    .select('id, display_name, profile_photo_url, face_tag')
    .eq('id', creatorId)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('plan_code, status, current_period_end, updated_at, created_at')
    .eq('photographer_id', creatorId)
    .in('status', ['active', 'trialing'])
    .or(`current_period_end.is.null,current_period_end.gte.${nowIso}`)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(20);

  const selectedSubscription =
    subscriptions?.find((row: any) => String(row.plan_code || '').toLowerCase() !== 'free') ||
    subscriptions?.[0];
  const planCode = toSidebarPlan((selectedSubscription as any)?.plan_code);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <DashboardSidebar 
        user={{
          email: user.email || '',
          displayName: profile?.display_name || 'Creator',
          profilePhotoUrl: profile?.profile_photo_url,
          faceTag: profile?.face_tag,
          plan: planCode,
        }}
      />

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:pl-72 min-w-0 h-screen overflow-hidden">
        {/* Fixed Header */}
        <DashboardHeader />
        {/* Scrollable Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

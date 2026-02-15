import { redirect } from 'next/navigation';

import { DashboardHeader } from '@/components/dashboard/header';
import { DashboardSidebar } from '@/components/dashboard/sidebar';
import { createClient } from '@/lib/supabase/server';

function isCreatorUser(userType: unknown): boolean {
  return userType === 'photographer' || userType === 'creator';
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
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
  const { data: profile } = await supabase
    .from('photographers')
    .select('*, subscriptions(*)')
    .eq('id', user.id)
    .single();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <DashboardSidebar 
        user={{
          email: user.email || '',
          displayName: profile?.display_name || 'Creator',
          profilePhotoUrl: profile?.profile_photo_url,
          faceTag: profile?.face_tag,
          plan: profile?.subscriptions?.[0]?.plan_code || 'free',
        }}
      />

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:pl-72 min-w-0 h-screen overflow-hidden">
        {/* Fixed Header */}
        <DashboardHeader />
        {/* Scrollable Content */}
        <main className="flex-1 p-6 lg:p-8 min-w-0 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

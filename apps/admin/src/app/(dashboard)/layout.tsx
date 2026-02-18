import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/dashboard-shell';
import { RealtimeProvider } from '@/components/realtime-provider';
import { getAdminSession } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <RealtimeProvider>
      <DashboardShell
        admin={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
      >
        {children}
      </DashboardShell>
    </RealtimeProvider>
  );
}

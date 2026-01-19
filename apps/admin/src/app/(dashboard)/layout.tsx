import { redirect } from 'next/navigation';

import { RealtimeProvider } from '@/components/realtime-provider';
import { Sidebar } from '@/components/sidebar';
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
      <div className="min-h-screen bg-background">
        <Sidebar 
          admin={{
            name: session.name,
            email: session.email,
            role: session.role,
          }}
        />
        <main className="pl-64">
          <div className="p-8">
            {children}
          </div>
        </main>
      </div>
    </RealtimeProvider>
  );
}

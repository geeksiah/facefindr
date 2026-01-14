import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { RealtimeProvider } from '@/components/realtime-provider';

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

'use client';

import { useParams } from 'next/navigation';

import { ProfileShellView } from '@/components/social/profile-shell-view';

export default function DashboardCreatorProfilePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || '';
  return <ProfileShellView profileType="creator" shell="dashboard" slug={slug} />;
}

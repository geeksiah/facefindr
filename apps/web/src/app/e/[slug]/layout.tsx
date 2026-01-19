import { Metadata } from 'next';

import { createClient } from '@/lib/supabase/server';

import { generateEventMetadata } from './metadata';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface Props {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

// Generate dynamic metadata for OG tags
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return generateEventMetadata(slug);
}

export default function EventLayout({ children }: Props) {
  return <>{children}</>;
}

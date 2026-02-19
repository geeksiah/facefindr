"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';
import { buildProfileUrls } from '@facefind/shared';

type Props = {
  slug: string;
  as?: 'attendee' | 'creator' | 'photographer';
  className?: string;
  children?: React.ReactNode;
  title?: string;
};

export function ProfileLink({ slug, as = 'attendee', className, children, title }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const urls = buildProfileUrls(slug);

  const kind = as === 'attendee' ? 'attendee' : 'creator';
  // Consider ourselves "in-app" (prefer shell) when already inside dashboard/gallery or inside a shell path.
  const inApp =
    !!pathname &&
    (pathname.startsWith('/dashboard') ||
      pathname.startsWith('/gallery') ||
      pathname.startsWith('/p') ||
      pathname.startsWith('/u'));

  const targetPublic = as === 'creator' ? urls.publicCreator : urls.publicUser;
  const targetShell = pathname?.startsWith('/dashboard')
    ? `/dashboard/people/${kind}/${slug}`
    : pathname?.startsWith('/gallery')
    ? `/gallery/people/${kind}/${slug}`
    : kind === 'creator'
    ? urls.shellCreator
    : urls.shellAttendee;

  if (inApp) {
    return (
      <a
        href={targetShell}
        onClick={(e) => {
          e.preventDefault();
          void router.push(targetShell);
        }}
        className={className}
        title={title}
      >
        {children ?? slug}
      </a>
    );
  }

  return (
    <Link href={targetPublic} className={className} title={title}>
      {children ?? slug}
    </Link>
  );
}

export default ProfileLink;

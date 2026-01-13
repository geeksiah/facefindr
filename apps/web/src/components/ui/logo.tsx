'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'icon' | 'full' | 'wordmark' | 'combo';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  className?: string;
  showText?: boolean;
}

const sizes = {
  sm: { icon: 32, full: 120, wordmark: 80, combo: 32 },
  md: { icon: 36, full: 140, wordmark: 100, combo: 36 },
  lg: { icon: 48, full: 180, wordmark: 120, combo: 48 },
};

export function Logo({
  variant = 'combo',
  size = 'md',
  href,
  className,
  showText = true,
}: LogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const dimension = sizes[size][variant];

  useEffect(() => {
    setMounted(true);
  }, []);

  // Use light mode as default during SSR
  const isDark = mounted && resolvedTheme === 'dark';
  
  // Dark mode = use "-dark" variants (light colored logos for dark backgrounds)
  // Light mode = use regular variants (dark colored logos for light backgrounds)
  const iconSrc = isDark ? '/assets/logos/icon-dark.svg' : '/assets/logos/icon.svg';
  const logoSrc = isDark ? '/assets/logos/logo-dark.svg' : '/assets/logos/logo.svg';
  const wordmarkSrc = isDark ? '/assets/logos/wordmark-dark.svg' : '/assets/logos/wordmark.svg';

  const content = (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* Icon + Wordmark Combo (default) */}
      {variant === 'combo' && (
        <>
          <Image
            src={iconSrc}
            alt=""
            width={dimension}
            height={dimension}
            className="flex-shrink-0"
            priority
          />
          {showText && (
            <Image
              src={wordmarkSrc}
              alt="FaceFindr"
              width={dimension * 2.5}
              height={dimension * 0.6}
              className="flex-shrink-0"
              priority
            />
          )}
        </>
      )}
      
      {/* Icon only */}
      {variant === 'icon' && (
        <Image
          src={iconSrc}
          alt="FaceFindr"
          width={dimension}
          height={dimension}
          className="flex-shrink-0"
          priority
        />
      )}
      
      {/* Full horizontal logo (icon + wordmark in one SVG) */}
      {variant === 'full' && (
        <Image
          src={logoSrc}
          alt="FaceFindr"
          width={dimension}
          height={dimension * 0.27}
          className="flex-shrink-0"
          priority
        />
      )}
      
      {/* Wordmark only */}
      {variant === 'wordmark' && (
        <Image
          src={wordmarkSrc}
          alt="FaceFindr"
          width={dimension}
          height={dimension * 0.23}
          className="flex-shrink-0"
          priority
        />
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="flex items-center">
        {content}
      </Link>
    );
  }

  return content;
}

// Simple icon-only component for smaller uses
export function LogoIcon({ size = 36, className }: { size?: number; className?: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';
  const iconSrc = isDark ? '/assets/logos/icon-dark.svg' : '/assets/logos/icon.svg';

  return (
    <Image
      src={iconSrc}
      alt="FaceFindr"
      width={size}
      height={size}
      className={cn('flex-shrink-0', className)}
      priority
    />
  );
}

'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

type FacePosition = 'center' | 'left' | 'right' | 'up' | 'down';

interface FaceGuideHeadProps {
  targetPosition: FacePosition;
  isMatched?: boolean;
  size?: number;
}

// Map positions to illustration files
const POSITION_IMAGES: Record<FacePosition, string> = {
  center: '/assets/scan-img/straight-face.svg',
  left: '/assets/scan-img/left-turn.svg',
  right: '/assets/scan-img/right-turn.svg',
  up: '/assets/scan-img/top-turn.svg',
  down: '/assets/scan-img/bottom-turn.svg',
};

const POSITION_LABELS: Record<FacePosition, string> = {
  center: 'Look straight ahead',
  left: 'Turn head left',
  right: 'Turn head right',
  up: 'Tilt head up',
  down: 'Tilt head down',
};

export function FaceGuideHead({ 
  targetPosition, 
  isMatched = false,
  size = 120 
}: FaceGuideHeadProps) {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 400);
    return () => clearTimeout(timer);
  }, [targetPosition]);

  const accentColor = isMatched ? '#34C759' : '#0A84FF';
  const glowColor = isMatched ? 'rgba(52, 199, 89, 0.3)' : 'rgba(10, 132, 255, 0.2)';

  return (
    <div 
      className="relative flex flex-col items-center"
      style={{ width: size, height: size + 40 }}
    >
      {/* Glow effect */}
      <div 
        className="absolute rounded-full blur-xl transition-all duration-500"
        style={{ 
          width: size,
          height: size,
          background: glowColor,
          transform: 'scale(1.1)',
        }}
      />
      
      {/* Illustration container */}
      <div
        className={`relative transition-all duration-300 ${animating ? 'scale-95 opacity-80' : 'scale-100 opacity-100'}`}
        style={{ 
          width: size, 
          height: size,
          borderRadius: '50%',
          border: `3px solid ${accentColor}`,
          overflow: 'hidden',
          background: 'var(--card)',
        }}
      >
        <Image
          src={POSITION_IMAGES[targetPosition]}
          alt={POSITION_LABELS[targetPosition]}
          fill
          className="object-contain p-2"
          priority
        />
        
        {/* Match checkmark overlay */}
        {isMatched && (
          <div className="absolute inset-0 flex items-center justify-center bg-success/20 animate-in fade-in zoom-in duration-300">
            <svg 
              width="48" 
              height="48" 
              viewBox="0 0 48 48" 
              fill="none"
              className="drop-shadow-lg"
            >
              <circle cx="24" cy="24" r="22" fill="#34C759" stroke="white" strokeWidth="2" />
              <path 
                d="M14 24L21 31L34 18" 
                stroke="white" 
                strokeWidth="4" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Position label */}
      <div className="mt-3 text-center">
        <span 
          className="text-sm font-medium transition-colors duration-300"
          style={{ color: accentColor }}
        >
          {POSITION_LABELS[targetPosition]}
        </span>
      </div>
    </div>
  );
}

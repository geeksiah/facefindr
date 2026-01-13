'use client';

import { useEffect, useState } from 'react';

type FacePosition = 'center' | 'left' | 'right' | 'up' | 'down';

interface FaceGuideHeadProps {
  targetPosition: FacePosition;
  isMatched?: boolean;
  size?: number;
}

// Rotation values for each position
const ROTATIONS: Record<FacePosition, { rotateY: number; rotateX: number }> = {
  center: { rotateY: 0, rotateX: 0 },
  left: { rotateY: -35, rotateX: 0 },
  right: { rotateY: 35, rotateX: 0 },
  up: { rotateY: 0, rotateX: -25 },
  down: { rotateY: 0, rotateX: 25 },
};

export function FaceGuideHead({ 
  targetPosition, 
  isMatched = false,
  size = 120 
}: FaceGuideHeadProps) {
  const [currentRotation, setCurrentRotation] = useState(ROTATIONS.center);

  useEffect(() => {
    setCurrentRotation(ROTATIONS[targetPosition]);
  }, [targetPosition]);

  const accentColor = isMatched ? '#34C759' : '#0A84FF';
  const glowColor = isMatched ? 'rgba(52, 199, 89, 0.4)' : 'rgba(10, 132, 255, 0.3)';

  return (
    <div 
      className="relative"
      style={{ 
        width: size, 
        height: size,
        perspective: '400px',
      }}
    >
      {/* Glow effect */}
      <div 
        className="absolute inset-0 rounded-full blur-xl transition-all duration-500"
        style={{ 
          background: glowColor,
          transform: 'scale(1.2)',
        }}
      />
      
      {/* 3D Head Container */}
      <div
        className="relative w-full h-full transition-transform duration-700 ease-out"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${currentRotation.rotateY}deg) rotateX(${currentRotation.rotateX}deg)`,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          style={{ filter: `drop-shadow(0 4px 20px ${glowColor})` }}
        >
          <defs>
            {/* Gradient for head */}
            <linearGradient id="headGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f0f0f5" />
              <stop offset="50%" stopColor="#e8e8ed" />
              <stop offset="100%" stopColor="#d8d8e0" />
            </linearGradient>
            
            {/* Gradient for face area */}
            <radialGradient id="faceGradient" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#fdf8f5" />
              <stop offset="100%" stopColor="#f5ebe5" />
            </radialGradient>

            {/* Shadow gradient */}
            <linearGradient id="shadowGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.1)" />
            </linearGradient>
          </defs>

          {/* Head outline - oval shape */}
          <ellipse
            cx="50"
            cy="48"
            rx="32"
            ry="40"
            fill="url(#headGradient)"
            stroke={accentColor}
            strokeWidth="2"
            className="transition-all duration-300"
          />

          {/* Face area */}
          <ellipse
            cx="50"
            cy="45"
            rx="26"
            ry="32"
            fill="url(#faceGradient)"
            opacity="0.8"
          />

          {/* Left eye */}
          <ellipse
            cx="38"
            cy="40"
            rx="5"
            ry="3"
            fill="#4a4a5a"
            opacity="0.7"
          />

          {/* Right eye */}
          <ellipse
            cx="62"
            cy="40"
            rx="5"
            ry="3"
            fill="#4a4a5a"
            opacity="0.7"
          />

          {/* Nose */}
          <path
            d="M50 42 L50 52 L46 54 Q50 56 54 54 L50 52"
            fill="none"
            stroke="#c0b8b0"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Mouth */}
          <path
            d="M42 62 Q50 66 58 62"
            fill="none"
            stroke="#b0a8a0"
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {/* Neck hint */}
          <path
            d="M40 85 Q50 92 60 85"
            fill="none"
            stroke="#d0c8c0"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Direction indicator arrow */}
          {targetPosition !== 'center' && (
            <g className="animate-pulse">
              {targetPosition === 'left' && (
                <path
                  d="M8 50 L18 50 M8 50 L14 44 M8 50 L14 56"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {targetPosition === 'right' && (
                <path
                  d="M92 50 L82 50 M92 50 L86 44 M92 50 L86 56"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {targetPosition === 'up' && (
                <path
                  d="M50 4 L50 14 M50 4 L44 10 M50 4 L56 10"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {targetPosition === 'down' && (
                <path
                  d="M50 96 L50 86 M50 96 L44 90 M50 96 L56 90"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          )}

          {/* Match checkmark */}
          {isMatched && (
            <g className="animate-in fade-in zoom-in duration-300">
              <circle cx="78" cy="22" r="12" fill="#34C759" />
              <path
                d="M72 22 L76 26 L84 18"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Position label */}
      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span 
          className="text-sm font-medium transition-colors duration-300"
          style={{ color: accentColor }}
        >
          {targetPosition === 'center' && 'Look straight ahead'}
          {targetPosition === 'left' && 'Turn head left'}
          {targetPosition === 'right' && 'Turn head right'}
          {targetPosition === 'up' && 'Tilt head up'}
          {targetPosition === 'down' && 'Tilt head down'}
        </span>
      </div>
    </div>
  );
}

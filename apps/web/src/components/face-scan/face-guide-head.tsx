'use client';

import { useEffect, useState } from 'react';

type FacePosition = 'center' | 'left' | 'right' | 'up' | 'down';

interface FaceGuideHeadProps {
  targetPosition: FacePosition;
  isMatched?: boolean;
  size?: number;
}

export function FaceGuideHead({ 
  targetPosition, 
  isMatched = false,
  size = 120 
}: FaceGuideHeadProps) {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setAnimating(true);
    const timer = setTimeout(() => setAnimating(false), 500);
    return () => clearTimeout(timer);
  }, [targetPosition]);

  const accentColor = isMatched ? '#34C759' : '#0A84FF';
  const glowColor = isMatched ? 'rgba(52, 199, 89, 0.4)' : 'rgba(10, 132, 255, 0.3)';

  // Each position has a unique SVG showing the head from that angle
  const renderHead = () => {
    switch (targetPosition) {
      case 'center':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="headGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f8f6f4" />
                <stop offset="100%" stopColor="#e8e4e0" />
              </linearGradient>
              <radialGradient id="faceGrad" cx="50%" cy="35%" r="50%">
                <stop offset="0%" stopColor="#fdf8f5" />
                <stop offset="100%" stopColor="#f0e8e0" />
              </radialGradient>
            </defs>
            {/* Head */}
            <ellipse cx="50" cy="48" rx="30" ry="38" fill="url(#headGrad)" 
              stroke={accentColor} strokeWidth="2.5" />
            {/* Face */}
            <ellipse cx="50" cy="45" rx="24" ry="30" fill="url(#faceGrad)" opacity="0.9" />
            {/* Left eyebrow */}
            <path d="M32 32 Q38 28 44 32" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            {/* Right eyebrow */}
            <path d="M56 32 Q62 28 68 32" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            {/* Left eye */}
            <ellipse cx="38" cy="40" rx="6" ry="4" fill="#3a3a4a" />
            <circle cx="39" cy="39" r="1.5" fill="white" opacity="0.8" />
            {/* Right eye */}
            <ellipse cx="62" cy="40" rx="6" ry="4" fill="#3a3a4a" />
            <circle cx="63" cy="39" r="1.5" fill="white" opacity="0.8" />
            {/* Nose */}
            <path d="M50 44 L50 54 L45 57 Q50 59 55 57 L50 54" fill="none" 
              stroke="#c0b0a0" strokeWidth="1.5" strokeLinecap="round" />
            {/* Mouth */}
            <path d="M42 66 Q50 70 58 66" fill="none" stroke="#b09090" strokeWidth="2" strokeLinecap="round" />
            {/* Ears */}
            <ellipse cx="20" cy="48" rx="4" ry="8" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            <ellipse cx="80" cy="48" rx="4" ry="8" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
          </svg>
        );

      case 'left':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="headGradL" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#f8f6f4" />
                <stop offset="100%" stopColor="#e0dcd8" />
              </linearGradient>
            </defs>
            {/* Head - turned left (3/4 view) */}
            <ellipse cx="45" cy="48" rx="28" ry="38" fill="url(#headGradL)" 
              stroke={accentColor} strokeWidth="2.5" />
            {/* Face contour - asymmetric for 3/4 view */}
            <path d="M25 30 Q20 48 25 70 Q35 82 50 78 Q62 72 65 55 Q66 35 55 25 Q40 20 25 30" 
              fill="#faf5f0" opacity="0.9" />
            {/* Visible ear (right side, appears on left when turned) */}
            <ellipse cx="72" cy="48" rx="5" ry="9" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            {/* Left eyebrow (closer, larger) */}
            <path d="M28 34 Q35 30 42 34" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            {/* Right eyebrow (farther, smaller) */}
            <path d="M50 35 Q54 33 58 36" fill="none" stroke="#7a7a8a" strokeWidth="1.5" strokeLinecap="round" />
            {/* Left eye (closer, larger) */}
            <ellipse cx="35" cy="42" rx="6" ry="4" fill="#3a3a4a" />
            <circle cx="36" cy="41" r="1.5" fill="white" opacity="0.8" />
            {/* Right eye (farther, smaller, partially hidden) */}
            <ellipse cx="54" cy="43" rx="4" ry="3" fill="#4a4a5a" />
            <circle cx="55" cy="42" r="1" fill="white" opacity="0.6" />
            {/* Nose (side profile hint) */}
            <path d="M22 48 Q18 52 22 56 L28 58" fill="none" stroke="#b0a090" strokeWidth="2" strokeLinecap="round" />
            {/* Mouth (asymmetric) */}
            <path d="M28 68 Q38 72 48 68" fill="none" stroke="#b09090" strokeWidth="2" strokeLinecap="round" />
            {/* Jaw line */}
            <path d="M20 60 Q25 78 45 82" fill="none" stroke="#d8d0c8" strokeWidth="1.5" strokeLinecap="round" />
            {/* Direction arrow */}
            <g className="animate-pulse">
              <path d="M5 50 L15 50 M5 50 L11 44 M5 50 L11 56" fill="none" 
                stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
        );

      case 'right':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="headGradR" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f8f6f4" />
                <stop offset="100%" stopColor="#e0dcd8" />
              </linearGradient>
            </defs>
            {/* Head - turned right (3/4 view) */}
            <ellipse cx="55" cy="48" rx="28" ry="38" fill="url(#headGradR)" 
              stroke={accentColor} strokeWidth="2.5" />
            {/* Face contour - asymmetric for 3/4 view */}
            <path d="M75 30 Q80 48 75 70 Q65 82 50 78 Q38 72 35 55 Q34 35 45 25 Q60 20 75 30" 
              fill="#faf5f0" opacity="0.9" />
            {/* Visible ear (left side) */}
            <ellipse cx="28" cy="48" rx="5" ry="9" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            {/* Right eyebrow (closer, larger) */}
            <path d="M58 34 Q65 30 72 34" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            {/* Left eyebrow (farther, smaller) */}
            <path d="M42 36 Q46 33 50 35" fill="none" stroke="#7a7a8a" strokeWidth="1.5" strokeLinecap="round" />
            {/* Right eye (closer, larger) */}
            <ellipse cx="65" cy="42" rx="6" ry="4" fill="#3a3a4a" />
            <circle cx="64" cy="41" r="1.5" fill="white" opacity="0.8" />
            {/* Left eye (farther, smaller) */}
            <ellipse cx="46" cy="43" rx="4" ry="3" fill="#4a4a5a" />
            <circle cx="45" cy="42" r="1" fill="white" opacity="0.6" />
            {/* Nose (side profile hint) */}
            <path d="M78 48 Q82 52 78 56 L72 58" fill="none" stroke="#b0a090" strokeWidth="2" strokeLinecap="round" />
            {/* Mouth (asymmetric) */}
            <path d="M52 68 Q62 72 72 68" fill="none" stroke="#b09090" strokeWidth="2" strokeLinecap="round" />
            {/* Jaw line */}
            <path d="M80 60 Q75 78 55 82" fill="none" stroke="#d8d0c8" strokeWidth="1.5" strokeLinecap="round" />
            {/* Direction arrow */}
            <g className="animate-pulse">
              <path d="M95 50 L85 50 M95 50 L89 44 M95 50 L89 56" fill="none" 
                stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
        );

      case 'up':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="headGradU" x1="50%" y1="100%" x2="50%" y2="0%">
                <stop offset="0%" stopColor="#f8f6f4" />
                <stop offset="100%" stopColor="#e8e4e0" />
              </linearGradient>
            </defs>
            {/* Head - tilted up */}
            <ellipse cx="50" cy="52" rx="30" ry="36" fill="url(#headGradU)" 
              stroke={accentColor} strokeWidth="2.5" />
            {/* Face - foreshortened, chin prominent */}
            <ellipse cx="50" cy="50" rx="24" ry="28" fill="#faf5f0" opacity="0.9" />
            {/* Chin more visible */}
            <ellipse cx="50" cy="72" rx="16" ry="8" fill="#f5f0eb" />
            {/* Eyebrows (higher, curved more) */}
            <path d="M32 38 Q38 32 44 36" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            <path d="M56 36 Q62 32 68 38" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            {/* Eyes (higher position, slightly squinted) */}
            <ellipse cx="38" cy="44" rx="5" ry="3" fill="#3a3a4a" />
            <circle cx="39" cy="43" r="1.2" fill="white" opacity="0.8" />
            <ellipse cx="62" cy="44" rx="5" ry="3" fill="#3a3a4a" />
            <circle cx="61" cy="43" r="1.2" fill="white" opacity="0.8" />
            {/* Nose (foreshortened, more nostrils visible) */}
            <ellipse cx="50" cy="54" rx="6" ry="4" fill="none" stroke="#c0b0a0" strokeWidth="1.5" />
            <circle cx="46" cy="55" r="2" fill="#d8c8b8" />
            <circle cx="54" cy="55" r="2" fill="#d8c8b8" />
            {/* Mouth (lower, more curved) */}
            <path d="M42 64 Q50 68 58 64" fill="none" stroke="#b09090" strokeWidth="2" strokeLinecap="round" />
            {/* Neck visible below chin */}
            <path d="M40 85 L40 92 M60 85 L60 92" stroke="#e0d8d0" strokeWidth="3" strokeLinecap="round" />
            {/* Ears (lower relative to face) */}
            <ellipse cx="20" cy="52" rx="4" ry="7" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            <ellipse cx="80" cy="52" rx="4" ry="7" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            {/* Direction arrow */}
            <g className="animate-pulse">
              <path d="M50 5 L50 15 M50 5 L44 11 M50 5 L56 11" fill="none" 
                stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
        );

      case 'down':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <linearGradient id="headGradD" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#f8f6f4" />
                <stop offset="100%" stopColor="#e8e4e0" />
              </linearGradient>
            </defs>
            {/* Head - tilted down */}
            <ellipse cx="50" cy="45" rx="30" ry="36" fill="url(#headGradD)" 
              stroke={accentColor} strokeWidth="2.5" />
            {/* Top of head/hair more visible */}
            <ellipse cx="50" cy="22" rx="26" ry="14" fill="#d8d0c8" opacity="0.6" />
            {/* Face - foreshortened from above */}
            <ellipse cx="50" cy="48" rx="24" ry="26" fill="#faf5f0" opacity="0.9" />
            {/* Forehead prominent */}
            <ellipse cx="50" cy="32" rx="20" ry="10" fill="#f8f4f0" />
            {/* Eyebrows (lower, less curved) */}
            <path d="M34 40 Q38 38 44 40" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            <path d="M56 40 Q62 38 66 40" fill="none" stroke="#6a6a7a" strokeWidth="2" strokeLinecap="round" />
            {/* Eyes (lower, more lid visible) */}
            <path d="M34 46 Q38 44 42 46" fill="none" stroke="#5a5a6a" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="38" cy="48" rx="4" ry="2.5" fill="#3a3a4a" />
            <path d="M58 46 Q62 44 66 46" fill="none" stroke="#5a5a6a" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="62" cy="48" rx="4" ry="2.5" fill="#3a3a4a" />
            {/* Nose (bridge visible, tip hidden) */}
            <path d="M50 42 L50 52 M46 54 L50 52 L54 54" fill="none" stroke="#c0b0a0" strokeWidth="1.5" strokeLinecap="round" />
            {/* Mouth (partially hidden) */}
            <path d="M44 62 Q50 64 56 62" fill="none" stroke="#c0a8a0" strokeWidth="1.5" strokeLinecap="round" />
            {/* Ears (higher relative to face) */}
            <ellipse cx="20" cy="44" rx="4" ry="7" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            <ellipse cx="80" cy="44" rx="4" ry="7" fill="#e8e0d8" stroke="#d0c8c0" strokeWidth="1" />
            {/* Direction arrow */}
            <g className="animate-pulse">
              <path d="M50 95 L50 85 M50 95 L44 89 M50 95 L56 89" fill="none" 
                stroke={accentColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </svg>
        );
    }
  };

  return (
    <div 
      className="relative"
      style={{ width: size, height: size }}
    >
      {/* Glow effect */}
      <div 
        className="absolute inset-0 rounded-full blur-xl transition-all duration-500"
        style={{ 
          background: glowColor,
          transform: 'scale(1.1)',
        }}
      />
      
      {/* Head container with transition */}
      <div
        className={`relative w-full h-full transition-opacity duration-300 ${animating ? 'opacity-70' : 'opacity-100'}`}
        style={{ filter: `drop-shadow(0 4px 12px ${glowColor})` }}
      >
        {renderHead()}
        
        {/* Match checkmark overlay */}
        {isMatched && (
          <div className="absolute top-0 right-0 animate-in fade-in zoom-in duration-300">
            <svg width="28" height="28" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="13" fill="#34C759" stroke="white" strokeWidth="2" />
              <path d="M8 14 L12 18 L20 10" fill="none" stroke="white" strokeWidth="2.5" 
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
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

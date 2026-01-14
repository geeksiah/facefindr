import { useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

interface LivenessResult {
  isLive: boolean;
  confidence: number;
  mode: 'multi-angle';
}

interface UseLivenessVerificationReturn {
  verifyLiveness: (images: string[]) => Promise<LivenessResult>;
  isVerifying: boolean;
  error: string | null;
  result: LivenessResult | null;
  reset: () => void;
}

/**
 * Hook for verifying liveness using multi-angle face images
 * SRS §3.3.1: Liveness detection to prevent photo-of-photo attacks
 */
export function useLivenessVerification(): UseLivenessVerificationReturn {
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LivenessResult | null>(null);
  const { session } = useAuthStore();

  const verifyLiveness = useCallback(async (images: string[]): Promise<LivenessResult> => {
    if (images.length < 3) {
      throw new Error('At least 3 images required for liveness verification');
    }

    setIsVerifying(true);
    setError(null);

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/api/faces/liveness`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            mode: 'multi-angle',
            images, // Already base64 encoded
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Liveness verification failed');
      }

      const livenessResult = await response.json();
      setResult(livenessResult);
      return livenessResult;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to verify liveness';
      setError(errorMessage);
      throw err;
    } finally {
      setIsVerifying(false);
    }
  }, [session]);

  const reset = useCallback(() => {
    setIsVerifying(false);
    setError(null);
    setResult(null);
  }, []);

  return {
    verifyLiveness,
    isVerifying,
    error,
    result,
    reset,
  };
}

/**
 * Tips for successful liveness verification
 */
export const LIVENESS_TIPS = [
  'Ensure your face is well-lit',
  'Remove sunglasses or hats',
  'Follow the head turn prompts carefully',
  'Keep your face within the oval guide',
  'Move naturally between positions',
];

/**
 * Required angles for liveness verification
 */
export const LIVENESS_ANGLES = [
  { id: 'front', label: 'Front', instruction: 'Look straight ahead' },
  { id: 'left', label: 'Left', instruction: 'Turn slightly left' },
  { id: 'right', label: 'Right', instruction: 'Turn slightly right' },
  { id: 'up', label: 'Up', instruction: 'Tilt head up slightly' },
  { id: 'down', label: 'Down', instruction: 'Tilt head down slightly' },
];

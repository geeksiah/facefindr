'use client';

import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  X,
  Camera,
} from 'lucide-react';
import Image from 'next/image';
import { useState, useRef, useCallback, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/toast';

import { FaceGuideHead } from './face-guide-head';

// Face position types
type FacePosition = 'center' | 'left' | 'right' | 'up' | 'down';

interface PositionConfig {
  label: string;
  instruction: string;
  yawRange: [number, number];
  pitchRange: [number, number];
}

const POSITIONS: Record<FacePosition, PositionConfig> = {
  center: {
    label: 'Look Straight',
    instruction: 'Look directly at the camera',
    yawRange: [-0.2, 0.2],
    pitchRange: [-0.2, 0.2],
  },
  left: {
    label: 'Turn Left',
    instruction: 'Turn your head to the left',
    yawRange: [-0.6, -0.15],
    pitchRange: [-0.25, 0.25],
  },
  right: {
    label: 'Turn Right',
    instruction: 'Turn your head to the right',
    yawRange: [0.15, 0.6],
    pitchRange: [-0.25, 0.25],
  },
  up: {
    label: 'Tilt Up',
    instruction: 'Tilt your head upward',
    yawRange: [-0.25, 0.25],
    pitchRange: [-0.6, -0.15],
  },
  down: {
    label: 'Tilt Down',
    instruction: 'Tilt your head downward',
    yawRange: [-0.25, 0.25],
    pitchRange: [0.15, 0.6],
  },
};

const POSITION_ORDER: FacePosition[] = ['center', 'left', 'right', 'up', 'down'];

interface GuidedFaceScannerProps {
  onComplete: (captures: string[]) => Promise<void>;
  onCancel?: () => void;
}

type ScanState = 'initializing' | 'ready' | 'processing' | 'complete' | 'error';

export function GuidedFaceScanner({
  onComplete,
  onCancel,
}: GuidedFaceScannerProps) {
  const [state, setState] = useState<ScanState>('initializing');
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [captures, setCaptures] = useState<string[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [positionMatch, setPositionMatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [useAutoCapture, setUseAutoCapture] = useState(true);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);

  const currentPosition = POSITION_ORDER[currentPositionIndex];
  const positionConfig = POSITIONS[currentPosition];

  // Initialize camera
  const initializeCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionBlocked(false);
        setCameraMessage('Camera is not supported on this device/browser.');
        return false;
      }

      try {
        const permissionsApi = (navigator as any).permissions;
        if (permissionsApi?.query) {
          const permissionStatus = await permissionsApi.query({ name: 'camera' as PermissionName });
          if (permissionStatus?.state === 'denied') {
            setPermissionBlocked(true);
            setCameraMessage('Camera access is blocked. Enable camera permission in browser settings and retry.');
            return false;
          }
        }
      } catch {
        // Ignore permissions API failures and continue to browser prompt.
      }

      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Camera initialization timed out')), 12000);
        }),
      ]);

      setPermissionBlocked(false);
      setCameraMessage(null);

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      return true;
    } catch (err: any) {
      console.error('Camera error:', err);
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      setPermissionBlocked(denied);
      setCameraMessage(
        denied
          ? 'Camera permission denied. Please allow camera access and retry.'
          : 'Failed to access camera. Check your camera and try again.'
      );
      return false;
    }
  }, []);

  // Initialize face detector (optional - for auto-capture)
  const initializeDetector = useCallback(async () => {
    try {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();

      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();

      const faceLandmarksDetection = await import('@tensorflow-models/face-landmarks-detection');

      detectorRef.current = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
          runtime: 'tfjs',
          refineLandmarks: false,
          maxFaces: 1,
        }
      );

      setModelLoaded(true);
      return true;
    } catch (err) {
      console.warn('Face detection model failed to load, using manual capture mode:', err);
      setUseAutoCapture(false);
      return false;
    }
  }, []);

  // Initialize everything - camera first, then model in background
  const initialize = useCallback(async () => {
    setState('initializing');
    setError(null);
    setUseAutoCapture(false); // Start in manual mode, upgrade if model loads

    const cameraReady = await initializeCamera();
    if (!cameraReady) {
      setError('Failed to access camera. Please check permissions.');
      setState('error');
      return;
    }

    // Camera is ready - show it immediately in manual mode
    setState('ready');

    // Load face detection model in background for auto-capture
    initializeDetector().then((loaded) => {
      if (loaded) {
        setUseAutoCapture(true);
      }
    });
  }, [initializeCamera, initializeDetector]);

  const requestCameraAccess = useCallback(async () => {
    const ok = await initializeCamera();
    if (!ok) return;
    setState('ready');
    setError(null);
  }, [initializeCamera]);

  // Face detection loop (only when auto-capture is enabled)
  useEffect(() => {
    if (state !== 'ready' || !useAutoCapture || !modelLoaded || !detectorRef.current) {
      return;
    }

    let isRunning = true;

    const detect = async () => {
      if (!isRunning || !videoRef.current || !detectorRef.current) return;

      try {
        const faces = await detectorRef.current.estimateFaces(videoRef.current, {
          flipHorizontal: true,
        });

        if (faces.length > 0 && isRunning) {
          setFaceDetected(true);
          const face = faces[0];
          const keypoints = face.keypoints;

          const noseTip = keypoints.find((k: any) => k.name === 'noseTip');
          const leftEye = keypoints.find((k: any) => k.name === 'leftEye');
          const rightEye = keypoints.find((k: any) => k.name === 'rightEye');

          if (noseTip && leftEye && rightEye) {
            const eyeCenter = {
              x: (leftEye.x + rightEye.x) / 2,
              y: (leftEye.y + rightEye.y) / 2,
            };
            const eyeWidth = Math.abs(rightEye.x - leftEye.x);
            const yaw = (noseTip.x - eyeCenter.x) / (eyeWidth * 2);
            const pitch = (noseTip.y - eyeCenter.y) / (eyeWidth * 1.5);

            const config = POSITIONS[POSITION_ORDER[currentPositionIndex]];
            const yawMatch = yaw >= config.yawRange[0] && yaw <= config.yawRange[1];
            const pitchMatch = pitch >= config.pitchRange[0] && pitch <= config.pitchRange[1];

            setPositionMatch(yawMatch && pitchMatch);
          }
        } else if (isRunning) {
          setFaceDetected(false);
          setPositionMatch(false);
        }
      } catch {
        // Silently handle detection errors
      }

      if (isRunning) {
        animationRef.current = requestAnimationFrame(detect);
      }
    };

    void detect();

    return () => {
      isRunning = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [state, useAutoCapture, modelLoaded, currentPositionIndex]);

  // Auto-capture hold timer
  useEffect(() => {
    if (!positionMatch || !useAutoCapture || state !== 'ready') {
      holdStartRef.current = null;
      setHoldProgress(0);
      return;
    }

    if (!holdStartRef.current) {
      holdStartRef.current = Date.now();
    }

    const holdDuration = 1200; // 1.2 seconds

    const interval = setInterval(() => {
      if (!holdStartRef.current) return;

      const elapsed = Date.now() - holdStartRef.current;
      const progress = Math.min(elapsed / holdDuration, 1);
      setHoldProgress(progress);

      if (progress >= 1) {
        captureCurrentPosition();
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [positionMatch, useAutoCapture, state]);

  // Capture current position
  const captureCurrentPosition = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    // In manual mode without model, always allow capture
    // With model loaded, only warn but still allow capture
    if (!useAutoCapture && modelLoaded && !positionMatch) {
      // Don't block capture - just proceed
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0);
      context.setTransform(1, 0, 0, 1, 0, 0);

      const imageData = canvas.toDataURL('image/jpeg', 0.9);
      const newCaptures = [...captures, imageData];
      setCaptures(newCaptures);
      setError(null);

      // Reset for next position
      setPositionMatch(false);
      setHoldProgress(0);
      holdStartRef.current = null;

      if (currentPositionIndex < POSITION_ORDER.length - 1) {
        setCurrentPositionIndex((prev) => prev + 1);
      } else {
        void handleComplete(newCaptures);
      }
    }
  }, [captures, currentPositionIndex, useAutoCapture, modelLoaded, positionMatch, positionConfig.label]);

  // Handle completion
  const handleComplete = async (allCaptures: string[]) => {
    setState('processing');

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    try {
      await onComplete(allCaptures);
      setState('complete');
    } catch (err) {
      console.error('Completion error:', err);
      setError('Failed to process face data. Please try again.');
      setState('error');
    }
  };

  // Cleanup
  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
  }, []);

  // Reset
  const reset = () => {
    cleanup();
    setCaptures([]);
    setCurrentPositionIndex(0);
    setFaceDetected(false);
    setPositionMatch(false);
    setHoldProgress(0);
    setError(null);
    holdStartRef.current = null;
    void initialize();
  };

  // Initialize on mount
  useEffect(() => {
    void initialize();
    return cleanup;
  }, [initialize, cleanup]);

  return (
    <div className="space-y-6">
      {/* Animated Head Guide */}
      <div className="flex justify-center pt-2 pb-4">
        <FaceGuideHead
          targetPosition={currentPosition}
          isMatched={positionMatch}
          size={100}
        />
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-3">
        {POSITION_ORDER.map((pos, index) => (
          <div
            key={pos}
            className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
              index < currentPositionIndex
                ? 'bg-success text-white'
                : index === currentPositionIndex
                  ? 'bg-accent text-white ring-4 ring-accent/20'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {index < currentPositionIndex ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              index + 1
            )}
          </div>
        ))}
      </div>

      {/* Camera View */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover scale-x-[-1]"
        />

        {/* Initializing Overlay */}
        {state === 'initializing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <Loader2 className="h-10 w-10 animate-spin text-white mb-4" />
            <p className="text-white font-medium">Starting camera...</p>
          </div>
        )}

        {/* Face Oval Guide */}
        {state === 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative">
              {/* Oval guide */}
              <div
                className={`h-56 w-40 rounded-[50%] border-4 transition-all duration-300 ${
                  positionMatch
                    ? 'border-success shadow-[0_0_40px_rgba(52,199,89,0.5)]'
                    : faceDetected
                      ? 'border-accent shadow-[0_0_20px_rgba(10,132,255,0.3)]'
                      : 'border-white/60'
                }`}
              />

              {/* Progress ring for auto-capture */}
              {holdProgress > 0 && (
                <svg
                  className="absolute -inset-3"
                  viewBox="0 0 100 140"
                  style={{ transform: 'rotate(-90deg)' }}
                >
                  <ellipse
                    cx="50"
                    cy="70"
                    rx="48"
                    ry="68"
                    fill="none"
                    stroke="rgba(52,199,89,0.2)"
                    strokeWidth="4"
                  />
                  <ellipse
                    cx="50"
                    cy="70"
                    rx="48"
                    ry="68"
                    fill="none"
                    stroke="#34C759"
                    strokeWidth="4"
                    strokeDasharray={`${holdProgress * 380} 380`}
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </div>
          </div>
        )}

        {/* Status Bar */}
        {state === 'ready' && (
          <div className="absolute bottom-4 left-4 right-4">
            <div
              className={`rounded-xl px-4 py-3 backdrop-blur-md transition-all ${
                positionMatch
                  ? 'bg-success/90'
                  : 'bg-black/60'
              }`}
            >
              <p className="text-white text-center font-medium">
                {positionMatch
                  ? useAutoCapture
                    ? 'Hold still - capturing...'
                    : 'Position matched - tap capture'
                  : positionConfig.instruction}
              </p>
            </div>
          </div>
        )}

        {/* Processing Overlay */}
        {state === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-white/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-accent animate-spin" />
            </div>
            <p className="mt-4 text-lg font-medium text-white">Processing...</p>
          </div>
        )}

        {/* Cancel button */}
        {state === 'ready' && (
          <button
            onClick={async () => {
              if (captures.length > 0 || currentPositionIndex > 0) {
                const confirmed = await confirm({
                  title: 'Cancel Face Scan?',
                  message: 'Your face scan is in progress. Are you sure you want to cancel? You will need to start over.',
                  confirmLabel: 'Cancel Scan',
                  cancelLabel: 'Continue',
                  variant: 'destructive',
                });
                if (!confirmed) return;
              }
              cleanup();
              onCancel?.();
            }}
            className="absolute top-4 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Shutter / Capture button - centered at bottom */}
        {state === 'ready' && (
          <div className="absolute bottom-20 left-0 right-0 flex justify-center">
            <button
              onClick={captureCurrentPosition}
              className={`flex h-16 w-16 items-center justify-center rounded-full border-4 transition-all shadow-lg ${
                positionMatch
                  ? 'bg-success border-success/50 hover:bg-success/90 scale-110'
                  : 'bg-white/90 border-white/50 hover:bg-white active:scale-95'
              }`}
            >
              <Camera className={`h-7 w-7 ${positionMatch ? 'text-white' : 'text-foreground'}`} />
            </button>
          </div>
        )}
      </div>

      {/* Captured thumbnails */}
      {captures.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          {captures.map((capture, index) => (
            <div
              key={index}
              className="relative h-14 w-14 overflow-hidden rounded-xl ring-2 ring-success"
            >
              <Image
                src={capture}
                alt={`Capture ${index + 1}`}
                fill
                className="object-cover"
              />
            </div>
          ))}
          {Array.from({ length: POSITION_ORDER.length - captures.length }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="h-14 w-14 rounded-xl border-2 border-dashed border-border"
            />
          ))}
        </div>
      )}

      {/* Mode toggle */}
      {state === 'ready' && modelLoaded && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <span className={!useAutoCapture ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            Manual
          </span>
          <button
            onClick={() => setUseAutoCapture(!useAutoCapture)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              useAutoCapture ? 'bg-accent' : 'bg-muted'
            }`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                useAutoCapture ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span className={useAutoCapture ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            Auto-capture
          </span>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="rounded-xl bg-destructive/10 p-4">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {cameraMessage && (
            <p className="mt-2 text-sm text-foreground">{cameraMessage}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {permissionBlocked && (
              <Button variant="outline" className="w-full" onClick={requestCameraAccess}>
                Allow Camera
              </Button>
            )}
            <Button variant="primary" className="w-full" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      )}

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog />
    </div>
  );
}

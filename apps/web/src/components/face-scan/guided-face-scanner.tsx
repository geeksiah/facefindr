'use client';

import { AlertCircle, Camera, CheckCircle2, Loader2, RotateCcw, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/toast';

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
    yawRange: [-0.32, 0.32],
    pitchRange: [-0.32, 0.32],
  },
  left: {
    label: 'Turn Left',
    instruction: 'Turn your head left',
    yawRange: [-1.2, -0.08],
    pitchRange: [-0.4, 0.4],
  },
  right: {
    label: 'Turn Right',
    instruction: 'Turn your head right',
    yawRange: [0.08, 1.2],
    pitchRange: [-0.4, 0.4],
  },
  up: {
    label: 'Tilt Up',
    instruction: 'Tilt your head up',
    yawRange: [-0.45, 0.45],
    pitchRange: [-1.1, -0.08],
  },
  down: {
    label: 'Tilt Down',
    instruction: 'Tilt your head down',
    yawRange: [-0.45, 0.45],
    pitchRange: [0.08, 1.1],
  },
};

const POSITION_ORDER: FacePosition[] = ['center', 'left', 'right', 'up', 'down'];
const AUTO_CAPTURE_HOLD_MS = 650;
const DETECT_INTERVAL_MS = 65;
const MATCH_STREAK_REQUIRED = 1;
const POSE_RELAX_STAGE_1_MS = 1800;
const POSE_RELAX_STAGE_2_MS = 3600;
const POSE_RELAX_DELTA_1 = 0.12;
const POSE_RELAX_DELTA_2 = 0.22;
const POSE_EMA_ALPHA = 0.35;

interface GuidedFaceScannerProps {
  onComplete: (captures: string[]) => Promise<void>;
  onCancel?: () => void;
}

type ScanState = 'initializing' | 'ready' | 'processing' | 'complete' | 'error';

type DetectionSource = 'mediapipe' | 'tfjs';

interface PoseReading {
  yaw: number;
  pitch: number;
}

interface FaceDetectorAdapter {
  source: DetectionSource;
  detectPose: (video: HTMLVideoElement, timestampMs: number) => Promise<PoseReading | null>;
}

const DEFAULT_MEDIAPIPE_WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const DEFAULT_MEDIAPIPE_FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let sharedDetector: FaceDetectorAdapter | null = null;
let sharedDetectorPromise: Promise<FaceDetectorAdapter> | null = null;

function pickKeypointFromArray(keypoints: any[], name: string, fallbackIndexes: number[]) {
  const named = keypoints.find((k: any) => k?.name === name);
  if (named && typeof named.x === 'number' && typeof named.y === 'number') return named;

  for (const index of fallbackIndexes) {
    const point = keypoints[index];
    if (point && typeof point.x === 'number' && typeof point.y === 'number') return point;
  }

  return null;
}

async function createTfjsDetectorAdapter(): Promise<FaceDetectorAdapter> {
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();

  try {
    await tf.setBackend('webgl');
  } catch {
    await tf.setBackend('cpu');
  }
  await tf.ready();

  const faceLandmarksDetection = await import('@tensorflow-models/face-landmarks-detection');
  const detector = await faceLandmarksDetection.createDetector(
    faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
    {
      runtime: 'tfjs',
      refineLandmarks: false,
      maxFaces: 1,
    }
  );

  return {
    source: 'tfjs',
    async detectPose(video) {
      const faces = await detector.estimateFaces(video, { flipHorizontal: true });
      const face = faces?.[0];
      if (!face?.keypoints) return null;

      const keypoints = face.keypoints;
      const noseTip = pickKeypointFromArray(keypoints, 'noseTip', [1, 4, 168]);
      const leftEye = pickKeypointFromArray(keypoints, 'leftEye', [33, 133, 159]);
      const rightEye = pickKeypointFromArray(keypoints, 'rightEye', [263, 362, 386]);
      if (!noseTip || !leftEye || !rightEye) return null;

      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 1);

      const yaw = (noseTip.x - eyeCenterX) / eyeDistance;
      const pitch = (noseTip.y - eyeCenterY) / (eyeDistance * 0.92);

      return { yaw, pitch };
    },
  };
}

async function createMediapipeDetectorAdapter(): Promise<FaceDetectorAdapter> {
  const tasksVision = await import('@mediapipe/tasks-vision');
  const wasmBase = process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_BASE || DEFAULT_MEDIAPIPE_WASM_BASE;
  const modelPath = process.env.NEXT_PUBLIC_MEDIAPIPE_FACE_MODEL_URL || DEFAULT_MEDIAPIPE_FACE_MODEL;

  const vision = await tasksVision.FilesetResolver.forVisionTasks(wasmBase);
  const landmarker = await tasksVision.FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: modelPath,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
  });

  return {
    source: 'mediapipe',
    async detectPose(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      const landmarks = result?.faceLandmarks?.[0];
      if (!landmarks) return null;

      const noseTip = landmarks[1] || landmarks[4];
      const leftEye = landmarks[33] || landmarks[133];
      const rightEye = landmarks[263] || landmarks[362];
      if (!noseTip || !leftEye || !rightEye) return null;

      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 0.001);

      const yaw = (noseTip.x - eyeCenterX) / eyeDistance;
      const pitch = (noseTip.y - eyeCenterY) / (eyeDistance * 0.92);

      return { yaw, pitch };
    },
  };
}

async function getSharedFaceDetector() {
  if (sharedDetector) return sharedDetector;
  if (sharedDetectorPromise) return sharedDetectorPromise;

  sharedDetectorPromise = (async () => {
    let detector: FaceDetectorAdapter;
    try {
      detector = await createMediapipeDetectorAdapter();
    } catch (mediapipeError) {
      console.warn('MediaPipe detector init failed. Falling back to TFJS.', mediapipeError);
      detector = await createTfjsDetectorAdapter();
    }

    sharedDetector = detector;
    return detector;
  })()
    .catch((error) => {
      sharedDetectorPromise = null;
      throw error;
    });

  return sharedDetectorPromise;
}

export function GuidedFaceScanner({ onComplete, onCancel }: GuidedFaceScannerProps) {
  const [state, setState] = useState<ScanState>('initializing');
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [captures, setCaptures] = useState<string[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [positionMatch, setPositionMatch] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [autoCaptureReady, setAutoCaptureReady] = useState(false);
  const [autoCaptureLoading, setAutoCaptureLoading] = useState(false);
  const [showManualAssist, setShowManualAssist] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugPoseText, setDebugPoseText] = useState<string | null>(null);

  const { confirm, ConfirmDialog } = useConfirm();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const matchStreakRef = useRef(0);
  const noMatchFrameCountRef = useRef(0);
  const lastDetectAtRef = useRef(0);
  const captureLockedRef = useRef(false);
  const poseEnteredAtRef = useRef<number>(Date.now());
  const yawEmaRef = useRef<number | null>(null);
  const pitchEmaRef = useRef<number | null>(null);

  const currentPosition = POSITION_ORDER[currentPositionIndex];
  const positionConfig = POSITIONS[currentPosition];

  const resetMatchingState = useCallback(() => {
    holdStartRef.current = null;
    matchStreakRef.current = 0;
    setHoldProgress(0);
    setPositionMatch(false);
    yawEmaRef.current = null;
    pitchEmaRef.current = null;
  }, []);

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
            setCameraMessage(
              'Camera access is blocked. Enable camera permission in browser settings and retry.'
            );
            return false;
          }
        }
      } catch {
        // Continue even if Permissions API is unavailable.
      }

      const stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Camera initialization timed out')), 12000);
        }),
      ]);

      streamRef.current = stream;
      setPermissionBlocked(false);
      setCameraMessage(null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
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

  const initializeDetector = useCallback(async () => {
    setAutoCaptureLoading(true);
    setStatusMessage('Preparing auto capture...');

    const slowLoadTimer = setTimeout(() => {
      setShowManualAssist(true);
      setStatusMessage('Manual shutter is ready while auto capture finishes loading.');
    }, 4500);

    try {
      const detector = await getSharedFaceDetector();
      detectorRef.current = detector;
      setAutoCaptureReady(true);
      setShowManualAssist(false);
      setStatusMessage(
        detector.source === 'mediapipe' ? 'Auto capture ready (MediaPipe)' : 'Auto capture ready'
      );
    } catch (detectorError) {
      console.warn('Auto capture unavailable, falling back to manual shutter:', detectorError);
      setAutoCaptureReady(false);
      setShowManualAssist(true);
      setStatusMessage('Auto capture is unavailable on this device. Use manual shutter.');
    } finally {
      clearTimeout(slowLoadTimer);
      setAutoCaptureLoading(false);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const captureCurrentPosition = useCallback(() => {
    if (captureLockedRef.current) return;
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context || !video.videoWidth || !video.videoHeight) return;

    captureLockedRef.current = true;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0);
    context.setTransform(1, 0, 0, 1, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    const nextCaptures = [...captures, imageData];
    setCaptures(nextCaptures);
    resetMatchingState();
    noMatchFrameCountRef.current = 0;
    setStatusMessage('Capture saved');

    if (currentPositionIndex < POSITION_ORDER.length - 1) {
      setCurrentPositionIndex((prev) => prev + 1);
      captureLockedRef.current = false;
      return;
    }

    setState('processing');
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    void onComplete(nextCaptures)
      .then(() => {
        setState('complete');
      })
      .catch((completionError) => {
        console.error('Completion error:', completionError);
        setError('Failed to process face data. Please try again.');
        setState('error');
      })
      .finally(() => {
        captureLockedRef.current = false;
      });
  }, [captures, currentPositionIndex, onComplete, resetMatchingState]);

  const runDetectionLoop = useCallback(() => {
    if (state !== 'ready' || !autoCaptureReady || !detectorRef.current) return;

    const detect = async (ts: number) => {
      if (state !== 'ready' || !autoCaptureReady || !detectorRef.current || !videoRef.current) return;
      if (captureLockedRef.current) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }

      if (ts - lastDetectAtRef.current < DETECT_INTERVAL_MS) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectAtRef.current = ts;

      try {
        const video = videoRef.current;
        if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          animationRef.current = requestAnimationFrame(detect);
          return;
        }

        const reading = await detectorRef.current.detectPose(video, ts);
        if (!reading) {
          setFaceDetected(false);
          if (showDebug) setDebugPoseText(null);
          resetMatchingState();
          noMatchFrameCountRef.current += 1;
          if (noMatchFrameCountRef.current > 70) {
            setShowManualAssist(true);
            setStatusMessage('Face not detected consistently. Use manual shutter.');
          }
          animationRef.current = requestAnimationFrame(detect);
          return;
        }

        setFaceDetected(true);
        const smoothedYaw =
          yawEmaRef.current === null
            ? reading.yaw
            : yawEmaRef.current + POSE_EMA_ALPHA * (reading.yaw - yawEmaRef.current);
        const smoothedPitch =
          pitchEmaRef.current === null
            ? reading.pitch
            : pitchEmaRef.current + POSE_EMA_ALPHA * (reading.pitch - pitchEmaRef.current);
        yawEmaRef.current = smoothedYaw;
        pitchEmaRef.current = smoothedPitch;

        const config = POSITIONS[POSITION_ORDER[currentPositionIndex]];
        const poseElapsedMs = Date.now() - poseEnteredAtRef.current;
        const relaxDelta =
          poseElapsedMs >= POSE_RELAX_STAGE_2_MS
            ? POSE_RELAX_DELTA_2
            : poseElapsedMs >= POSE_RELAX_STAGE_1_MS
              ? POSE_RELAX_DELTA_1
              : 0;
        const yawMin = config.yawRange[0] - relaxDelta;
        const yawMax = config.yawRange[1] + relaxDelta;
        const pitchMin = config.pitchRange[0] - relaxDelta;
        const pitchMax = config.pitchRange[1] + relaxDelta;

        if (showDebug) {
          setDebugPoseText(
            `yaw ${smoothedYaw.toFixed(2)} [${yawMin.toFixed(2)}..${yawMax.toFixed(2)}], ` +
              `pitch ${smoothedPitch.toFixed(2)} [${pitchMin.toFixed(2)}..${pitchMax.toFixed(2)}], ` +
              `relax ${relaxDelta.toFixed(2)}`
          );
        }

        const isMatch =
          smoothedYaw >= yawMin &&
          smoothedYaw <= yawMax &&
          smoothedPitch >= pitchMin &&
          smoothedPitch <= pitchMax;

        if (!isMatch) {
          matchStreakRef.current = 0;
          setPositionMatch(false);
          holdStartRef.current = null;
          setHoldProgress(0);
          noMatchFrameCountRef.current += 1;
          if (noMatchFrameCountRef.current > 90) {
            setShowManualAssist(true);
            setStatusMessage('Auto capture is taking too long for this pose. Use manual shutter.');
          }
          animationRef.current = requestAnimationFrame(detect);
          return;
        }

        noMatchFrameCountRef.current = 0;
        setShowManualAssist(false);
        matchStreakRef.current += 1;
        if (matchStreakRef.current < MATCH_STREAK_REQUIRED) {
          animationRef.current = requestAnimationFrame(detect);
          return;
        }

        setPositionMatch(true);
        if (!holdStartRef.current) holdStartRef.current = Date.now();
        const elapsed = Date.now() - holdStartRef.current;
        const progress = Math.min(elapsed / AUTO_CAPTURE_HOLD_MS, 1);
        setHoldProgress(progress);
        setStatusMessage('Hold still...');

        if (progress >= 1) {
          captureCurrentPosition();
          return;
        }
      } catch {
        noMatchFrameCountRef.current += 1;
        if (noMatchFrameCountRef.current > 90) {
          setShowManualAssist(true);
          setStatusMessage('Auto detection is unstable. Use manual shutter.');
        }
      }

      animationRef.current = requestAnimationFrame(detect);
    };

    animationRef.current = requestAnimationFrame(detect);
  }, [autoCaptureReady, captureCurrentPosition, currentPositionIndex, resetMatchingState, state]);

  const initialize = useCallback(async () => {
    setState('initializing');
    setError(null);
    setStatusMessage(null);
    setShowManualAssist(false);
    setAutoCaptureReady(false);
    setAutoCaptureLoading(false);
    resetMatchingState();
    noMatchFrameCountRef.current = 0;
    captureLockedRef.current = false;

    const cameraReady = await initializeCamera();
    if (!cameraReady) {
      setError('Failed to access camera. Please check permissions.');
      setState('error');
      return;
    }

    setState('ready');
    void initializeDetector();
  }, [initializeCamera, initializeDetector, resetMatchingState]);

  const requestCameraAccess = useCallback(async () => {
    const ok = await initializeCamera();
    if (!ok) return;
    setState('ready');
    setError(null);
    void initializeDetector();
  }, [initializeCamera, initializeDetector]);

  const reset = useCallback(() => {
    cleanup();
    setCaptures([]);
    setCurrentPositionIndex(0);
    setFaceDetected(false);
    setPositionMatch(false);
    setHoldProgress(0);
    setError(null);
    setStatusMessage(null);
    setShowManualAssist(false);
    holdStartRef.current = null;
    matchStreakRef.current = 0;
    noMatchFrameCountRef.current = 0;
    captureLockedRef.current = false;
    void initialize();
  }, [cleanup, initialize]);

  useEffect(() => {
    void initialize();
    return cleanup;
  }, [cleanup, initialize]);

  useEffect(() => {
    if (state !== 'ready' || !autoCaptureReady) return;
    runDetectionLoop();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [autoCaptureReady, runDetectionLoop, state]);

  useEffect(() => {
    poseEnteredAtRef.current = Date.now();
  }, [currentPositionIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    setShowDebug(params.get('scanDebug') === '1');
  }, []);

  useEffect(() => {
    if (!showDebug) {
      setDebugPoseText(null);
    }
  }, [showDebug]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        {POSITION_ORDER.map((position, index) => (
          <div
            key={position}
            className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
              index < currentPositionIndex
                ? 'bg-success text-white'
                : index === currentPositionIndex
                  ? 'bg-accent text-white ring-4 ring-accent/20'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {index < currentPositionIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
          </div>
        ))}
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover scale-x-[-1]" />

        {state === 'initializing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-white" />
            <p className="text-sm font-medium text-white">Starting camera...</p>
          </div>
        )}

        {state === 'ready' && (
          <>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <div
                  className={`h-56 w-40 rounded-[50%] border-4 transition-all duration-200 ${
                    positionMatch
                      ? 'border-success shadow-[0_0_30px_rgba(52,199,89,0.4)]'
                      : faceDetected
                        ? 'border-accent shadow-[0_0_18px_rgba(10,132,255,0.28)]'
                        : 'border-white/55'
                  }`}
                />
                {holdProgress > 0 && (
                  <svg className="absolute -inset-3" viewBox="0 0 100 140" style={{ transform: 'rotate(-90deg)' }}>
                    <ellipse cx="50" cy="70" rx="48" ry="68" fill="none" stroke="rgba(52,199,89,0.22)" strokeWidth="4" />
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

            <div className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
              {autoCaptureReady ? 'Auto capture' : 'Manual capture'}
            </div>
          </>
        )}

        {state === 'processing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
            <div className="relative h-14 w-14">
              <div className="absolute inset-0 rounded-full border-4 border-white/20" />
              <div className="absolute inset-0 animate-spin rounded-full border-4 border-t-accent" />
            </div>
            <p className="mt-3 text-base font-medium text-white">Processing...</p>
          </div>
        )}

        {state === 'ready' && (
          <button
            onClick={async () => {
              if (captures.length > 0 || currentPositionIndex > 0) {
                const confirmed = await confirm({
                  title: 'Cancel Face Scan?',
                  message:
                    'Your face scan is in progress. Are you sure you want to cancel? You will need to start over.',
                  confirmLabel: 'Cancel Scan',
                  cancelLabel: 'Continue',
                  variant: 'destructive',
                });
                if (!confirmed) return;
              }
              cleanup();
              onCancel?.();
            }}
            className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {state === 'ready' && (
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{positionConfig.label}</p>
            <p className="text-xs text-muted-foreground">{positionConfig.instruction}</p>
            {autoCaptureLoading && (
              <p className="mt-1 text-xs text-muted-foreground">Auto capture is loading in the background...</p>
            )}
            {statusMessage && <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>}
            {showDebug && debugPoseText && (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{debugPoseText}</p>
            )}
          </div>

          <div className="flex justify-center">
            <button
              onClick={captureCurrentPosition}
              className={`flex h-16 w-16 items-center justify-center rounded-full border-4 shadow-lg transition-all ${
                positionMatch && autoCaptureReady
                  ? 'bg-success border-success/55 hover:bg-success/90'
                  : 'bg-white border-white/60 hover:bg-white/90 active:scale-95'
              }`}
            >
              <Camera className={`h-7 w-7 ${positionMatch && autoCaptureReady ? 'text-white' : 'text-foreground'}`} />
            </button>
          </div>
        </div>
      )}

      {captures.length > 0 && (
        <div className="flex items-center justify-center gap-2">
          {captures.map((capture, index) => (
            <div key={index} className="relative h-14 w-14 overflow-hidden rounded-xl ring-2 ring-success">
              <Image src={capture} alt={`Capture ${index + 1}`} fill className="object-cover" />
            </div>
          ))}
          {Array.from({ length: POSITION_ORDER.length - captures.length }).map((_, index) => (
            <div key={`empty-${index}`} className="h-14 w-14 rounded-xl border-2 border-dashed border-border" />
          ))}
        </div>
      )}

      {state === 'ready' && showManualAssist && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-center text-sm text-foreground">
          Auto capture is taking longer than expected. Continue with manual shutter.
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl bg-destructive/10 p-4">
          <div className="flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {cameraMessage && <p className="mt-2 text-sm text-foreground">{cameraMessage}</p>}
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

      <canvas ref={canvasRef} className="hidden" />
      <ConfirmDialog />
    </div>
  );
}

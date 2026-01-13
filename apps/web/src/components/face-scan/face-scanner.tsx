'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import {
  Camera,
  Upload,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  FlipHorizontal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

interface FaceScannerProps {
  onCapture: (imageData: string) => Promise<void>;
  onCancel?: () => void;
  isProcessing?: boolean;
  processingText?: string;
}

type CameraState = 'idle' | 'initializing' | 'ready' | 'error';

export function FaceScanner({
  onCapture,
  onCancel,
  isProcessing = false,
  processingText = 'Processing...',
}: FaceScannerProps) {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [countdown, setCountdown] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraState('initializing');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('ready');
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please check permissions.');
      setCameraState('error');
    }
  }, [facingMode]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraState('idle');
  }, []);

  // Flip camera
  const flipCamera = useCallback(() => {
    stopCamera();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, [stopCamera]);

  // Restart camera when facing mode changes
  useEffect(() => {
    if (cameraState === 'ready' || cameraState === 'initializing') {
      startCamera();
    }
  }, [facingMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Capture with countdown
  const startCountdown = () => {
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          capturePhoto();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Mirror if using front camera
        if (facingMode === 'user') {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }

        context.drawImage(video, 0, 0);
        context.setTransform(1, 0, 0, 1, 0, 0); // Reset transform

        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(imageData);
        stopCamera();
      }
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be less than 10MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = e.target?.result as string;
        setCapturedImage(imageData);
        stopCamera();
      };
      reader.readAsDataURL(file);
    }
  };

  // Confirm and process
  const confirmCapture = async () => {
    if (capturedImage) {
      await onCapture(capturedImage);
    }
  };

  // Retake photo
  const retake = () => {
    setCapturedImage(null);
    setError(null);
    startCamera();
  };

  // Reset everything
  const reset = () => {
    setCapturedImage(null);
    setError(null);
    stopCamera();
    onCancel?.();
  };

  return (
    <div className="relative">
      {/* Camera View */}
      {cameraState !== 'idle' && !capturedImage && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />

          {/* Initializing Overlay */}
          {cameraState === 'initializing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}

          {/* Face Guide Overlay */}
          {cameraState === 'ready' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative">
                {/* Face oval guide */}
                <div className="h-64 w-48 rounded-[50%] border-4 border-white/60 shadow-lg" />
                
                {/* Guide text */}
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white">
                  Position your face in the oval
                </div>

                {/* Corner guides */}
                <div className="absolute -top-2 -left-2 h-8 w-8 border-t-4 border-l-4 border-white/80 rounded-tl-lg" />
                <div className="absolute -top-2 -right-2 h-8 w-8 border-t-4 border-r-4 border-white/80 rounded-tr-lg" />
                <div className="absolute -bottom-2 -left-2 h-8 w-8 border-b-4 border-l-4 border-white/80 rounded-bl-lg" />
                <div className="absolute -bottom-2 -right-2 h-8 w-8 border-b-4 border-r-4 border-white/80 rounded-br-lg" />
              </div>
            </div>
          )}

          {/* Countdown Overlay */}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <div className="text-8xl font-bold text-white animate-pulse">{countdown}</div>
            </div>
          )}

          {/* Camera Controls */}
          {cameraState === 'ready' && countdown === null && (
            <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4">
              {/* Cancel */}
              <button
                onClick={reset}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>

              {/* Capture */}
              <button
                onClick={startCountdown}
                className="flex h-18 w-18 items-center justify-center rounded-full bg-white border-4 border-white/50 hover:scale-105 transition-transform"
                style={{ width: '72px', height: '72px' }}
              >
                <div className="h-14 w-14 rounded-full bg-accent" style={{ width: '56px', height: '56px' }} />
              </button>

              {/* Flip Camera */}
              <button
                onClick={flipCamera}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 transition-colors"
              >
                <FlipHorizontal className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Captured Image Preview */}
      {capturedImage && !isProcessing && (
        <div className="space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
            <Image
              src={capturedImage}
              alt="Captured face"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={retake}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Retake
            </Button>
            <Button variant="primary" className="flex-1" onClick={confirmCapture}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Use This Photo
            </Button>
          </div>
        </div>
      )}

      {/* Processing State */}
      {isProcessing && capturedImage && (
        <div className="space-y-4">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
            <Image
              src={capturedImage}
              alt="Processing"
              fill
              className="object-cover opacity-60"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
              <div className="relative">
                <div className="h-16 w-16 rounded-full border-4 border-white/20" />
                <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-t-accent animate-spin" />
              </div>
              <p className="mt-4 text-lg font-medium text-white">{processingText}</p>
            </div>
          </div>
        </div>
      )}

      {/* Idle State / Start Options */}
      {cameraState === 'idle' && !capturedImage && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={startCamera}
              className="flex flex-col items-center gap-4 rounded-2xl border-2 border-border p-8 transition-all hover:border-accent hover:bg-accent/5"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                <Camera className="h-8 w-8 text-accent" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Take a Selfie</p>
                <p className="text-sm text-secondary">Use your camera</p>
              </div>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-4 rounded-2xl border-2 border-border p-8 transition-all hover:border-accent hover:bg-accent/5"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Upload className="h-8 w-8 text-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">Upload Photo</p>
                <p className="text-sm text-secondary">Select from device</p>
              </div>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

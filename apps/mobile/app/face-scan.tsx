/**
 * Face Scan Screen
 * 
 * Camera-based face scanning with 5-position guided capture.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { ArrowLeft, RefreshCw, Check, X, Camera as CameraIcon } from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;

// 5 head positions for accurate face matching
const HEAD_POSITIONS = [
  { id: 'front', label: 'Front', instruction: 'Look straight ahead' },
  { id: 'left', label: 'Left', instruction: 'Turn slightly left' },
  { id: 'right', label: 'Right', instruction: 'Turn slightly right' },
  { id: 'up', label: 'Up', instruction: 'Tilt head up slightly' },
  { id: 'down', label: 'Down', instruction: 'Tilt head down slightly' },
];

interface MatchedPhoto {
  id: string;
  thumbnailUrl: string;
  eventName: string;
  similarity: number;
  price: number;
}

interface CapturedPosition {
  id: string;
  uri: string;
  base64: string;
}

type ScanStep = 'consent' | 'capture' | 'processing' | 'results' | 'error';

export default function FaceScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageUri?: string; eventId?: string }>();
  const { profile } = useAuthStore();
  const cameraRef = useRef<CameraView>(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>('consent');
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [capturedPositions, setCapturedPositions] = useState<CapturedPosition[]>([]);
  const [matchedPhotos, setMatchedPhotos] = useState<MatchedPhoto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  // If image was passed in, skip to processing
  useEffect(() => {
    if (params.imageUri) {
      setStep('processing');
      processSingleImage(params.imageUri);
    }
  }, [params.imageUri]);

  const handleConsent = () => {
    setStep('capture');
  };

  const currentPosition = HEAD_POSITIONS[currentPositionIndex];

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      if (photo?.uri && photo?.base64) {
        const newCapture: CapturedPosition = {
          id: currentPosition.id,
          uri: photo.uri,
          base64: photo.base64,
        };

        const updatedCaptures = [...capturedPositions, newCapture];
        setCapturedPositions(updatedCaptures);

        // Move to next position or process
        if (currentPositionIndex < HEAD_POSITIONS.length - 1) {
          setCurrentPositionIndex(currentPositionIndex + 1);
        } else {
          // All positions captured, process
          setStep('processing');
          await processAllImages(updatedCaptures);
        }
      }
    } catch (err) {
      console.error('Error taking picture:', err);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const processSingleImage = async (imageUri: string) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

      const response = await fetch(`${apiUrl}/api/face/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          eventId: params.eventId || null,
          attendeeId: profile?.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Face matching failed');
      }

      const data = await response.json();
      handleMatchResults(data);
    } catch (err: any) {
      console.error('Face matching error:', err);
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const processAllImages = async (captures: CapturedPosition[]) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

      // Use the front-facing image as primary
      const frontCapture = captures.find(c => c.id === 'front') || captures[0];

      const response = await fetch(`${apiUrl}/api/face/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: frontCapture.base64,
          additionalImages: captures
            .filter(c => c.id !== 'front')
            .map(c => ({ position: c.id, base64: c.base64 })),
          eventId: params.eventId || null,
          attendeeId: profile?.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Face matching failed');
      }

      const data = await response.json();
      handleMatchResults(data);
    } catch (err: any) {
      console.error('Face matching error:', err);
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMatchResults = (data: any) => {
    if (data.matches && data.matches.length > 0) {
      setMatchedPhotos(
        data.matches.map((match: any) => ({
          id: match.mediaId,
          thumbnailUrl: match.thumbnailUrl,
          eventName: match.eventName,
          similarity: match.similarity,
          price: match.price || 0,
        }))
      );
      setStep('results');
    } else {
      setErrorMessage('No photos found matching your face. Try a different angle or event.');
      setStep('error');
    }
  };

  const retryCapture = () => {
    setCapturedPositions([]);
    setCurrentPositionIndex(0);
    setMatchedPhotos([]);
    setErrorMessage(null);
    setStep('capture');
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'front' ? 'back' : 'front'));
  };

  const handleCancelCapture = () => {
    Alert.alert(
      'Cancel Scan?',
      'Are you sure you want to cancel? Your progress will be lost.',
      [
        { text: 'Continue Scanning', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  const handleCancelSearch = () => {
    Alert.alert(
      'Cancel Search?',
      'Are you sure you want to stop searching? You can always try again later.',
      [
        { text: 'Keep Searching', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: () => {
            setIsProcessing(false);
            router.back();
          },
        },
      ]
    );
  };

  // Permission not determined
  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted && step === 'capture') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <View style={styles.iconContainer}>
            <CameraIcon size={48} color={colors.accent} />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to scan your face and find your photos.
          </Text>
          <Button onPress={requestPermission} fullWidth style={{ marginTop: spacing.lg }}>
            Allow Camera Access
          </Button>
          <Button variant="ghost" onPress={() => router.back()} fullWidth style={{ marginTop: spacing.sm }}>
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Consent screen
  if (step === 'consent') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable 
            onPress={() => router.back()} 
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Face Scan</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.consentContent}>
          <View style={styles.iconContainer}>
            <CameraIcon size={48} color={colors.accent} />
          </View>

          <Text style={styles.consentTitle}>Find Your Photos</Text>
          <Text style={styles.consentDescription}>
            We'll capture your face from 5 angles for accurate matching. Your privacy is our priority.
          </Text>

          <Card style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>How it works:</Text>
            <View style={styles.privacyItem}>
              <Check size={16} color={colors.success} />
              <Text style={styles.privacyText}>
                Your face data is encrypted and stored securely
              </Text>
            </View>
            <View style={styles.privacyItem}>
              <Check size={16} color={colors.success} />
              <Text style={styles.privacyText}>
                Only you can access your matched photos
              </Text>
            </View>
            <View style={styles.privacyItem}>
              <Check size={16} color={colors.success} />
              <Text style={styles.privacyText}>
                Delete your face data anytime from settings
              </Text>
            </View>
          </Card>

          <Button onPress={handleConsent} fullWidth size="lg">
            I Agree, Start Scanning
          </Button>

          <Pressable 
            onPress={() => router.back()} 
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Camera capture screen with position guide
  if (step === 'capture') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
        >
          <SafeAreaView style={styles.cameraOverlay}>
            {/* Header */}
            <View style={styles.cameraHeader}>
              <Pressable 
                onPress={handleCancelCapture} 
                style={({ pressed }) => [styles.cameraBackButton, pressed && { opacity: 0.7 }]}
              >
                <ArrowLeft size={24} color="#fff" />
              </Pressable>
              <View style={styles.positionProgress}>
                <Text style={styles.positionProgressText}>
                  {currentPositionIndex + 1} / {HEAD_POSITIONS.length}
                </Text>
              </View>
              <Pressable 
                onPress={toggleCameraFacing} 
                style={({ pressed }) => [styles.cameraFlipButton, pressed && { opacity: 0.7 }]}
              >
                <RefreshCw size={24} color="#fff" />
              </Pressable>
            </View>

            {/* Position indicators */}
            <View style={styles.positionIndicators}>
              {HEAD_POSITIONS.map((pos, index) => (
                <View 
                  key={pos.id}
                  style={[
                    styles.positionDot,
                    index < currentPositionIndex && styles.positionDotCompleted,
                    index === currentPositionIndex && styles.positionDotActive,
                  ]}
                />
              ))}
            </View>

            {/* Face guide */}
            <View style={styles.faceGuideContainer}>
              <View style={styles.faceGuide}>
                {/* Head illustration based on current position */}
                <View style={[
                  styles.headOval,
                  currentPosition.id === 'left' && { transform: [{ rotate: '-15deg' }] },
                  currentPosition.id === 'right' && { transform: [{ rotate: '15deg' }] },
                  currentPosition.id === 'up' && { transform: [{ translateY: -10 }] },
                  currentPosition.id === 'down' && { transform: [{ translateY: 10 }] },
                ]} />
              </View>
              
              <View style={styles.instructionBadge}>
                <Text style={styles.positionLabel}>{currentPosition.label}</Text>
              </View>
              <Text style={styles.faceGuideText}>
                {currentPosition.instruction}
              </Text>
            </View>

            {/* Captured thumbnails */}
            {capturedPositions.length > 0 && (
              <View style={styles.capturedThumbnails}>
                {capturedPositions.map((capture) => (
                  <Image
                    key={capture.id}
                    source={{ uri: capture.uri }}
                    style={styles.capturedThumb}
                  />
                ))}
              </View>
            )}

            {/* Capture button */}
            <View style={styles.captureContainer}>
              <Pressable 
                onPress={takePicture} 
                style={({ pressed }) => [
                  styles.captureButton,
                  pressed && styles.captureButtonPressed,
                ]}
              >
                <View style={styles.captureButtonInner} />
              </Pressable>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

  // Processing screen
  if (step === 'processing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          {capturedPositions.length > 0 && capturedPositions[0].uri && (
            <Image source={{ uri: capturedPositions[0].uri }} style={styles.processingImage} />
          )}
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.lg }} />
          <Text style={styles.processingTitle}>Searching for your photos...</Text>
          <Text style={styles.processingText}>
            Analyzing {capturedPositions.length > 0 ? `${capturedPositions.length} captures` : 'your photo'}
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.cancelSearchButton,
              pressed && styles.pressed,
            ]}
            onPress={handleCancelSearch}
          >
            <Text style={styles.cancelSearchText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Error screen
  if (step === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable 
            onPress={() => router.back()} 
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Face Scan</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <X size={48} color={colors.destructive} />
          </View>
          <Text style={styles.errorTitle}>No Match Found</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Button onPress={retryCapture} fullWidth style={{ marginTop: spacing.lg }}>
            Try Again
          </Button>
          <Button variant="ghost" onPress={() => router.back()} fullWidth style={{ marginTop: spacing.sm }}>
            Go Back
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  // Results screen
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable 
          onPress={() => router.back()} 
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Your Photos</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.resultsContent}>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            Found {matchedPhotos.length} photo{matchedPhotos.length !== 1 ? 's' : ''}
          </Text>
          <Pressable 
            onPress={retryCapture}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.scanAgain}>Scan Again</Text>
          </Pressable>
        </View>

        <View style={styles.photoGrid}>
          {matchedPhotos.map((photo) => (
            <Pressable
              key={photo.id}
              style={({ pressed }) => [
                styles.photoItem,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push(`/photo/${photo.id}`)}
            >
              <Image source={{ uri: photo.thumbnailUrl }} style={styles.photoImage} />
              {photo.price > 0 && (
                <View style={styles.priceTag}>
                  <Text style={styles.priceText}>${photo.price.toFixed(2)}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>

        {matchedPhotos.length > 0 && (
          <Card style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>Save to Photo Passport</Text>
            <Text style={styles.ctaText}>
              Purchase these photos to add them to your collection and download anytime.
            </Text>
            <Button
              onPress={() => router.push('/(attendee)/')}
              fullWidth
              style={{ marginTop: spacing.md }}
            >
              View Photo Passport
            </Button>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  permissionTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.lg,
  },
  permissionText: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  consentContent: {
    padding: spacing.lg,
  },
  consentTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
  },
  consentDescription: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 24,
  },
  privacyCard: {
    marginBottom: spacing.lg,
  },
  privacyTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  privacyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  privacyText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  cancelButton: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  cameraBackButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionProgress: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  positionProgressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cameraFlipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  positionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  positionDotActive: {
    backgroundColor: colors.accent,
    width: 24,
  },
  positionDotCompleted: {
    backgroundColor: '#10b981',
  },
  faceGuideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGuide: {
    width: 220,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headOval: {
    width: 200,
    height: 260,
    borderRadius: 100,
    borderWidth: 3,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  instructionBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: spacing.md,
  },
  positionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  faceGuideText: {
    fontSize: 16,
    color: '#fff',
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  capturedThumbnails: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
  },
  capturedThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  captureContainer: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonPressed: {
    transform: [{ scale: 0.95 }],
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },
  processingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  processingImage: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  processingTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.lg,
  },
  processingText: {
    fontSize: fontSize.base,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  cancelSearchButton: {
    marginTop: spacing.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.destructive + '10',
  },
  cancelSearchText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.destructive,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  errorIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.destructive + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 24,
  },
  resultsContent: {
    padding: spacing.lg,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  resultsCount: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
  },
  scanAgain: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '500',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  priceTag: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  priceText: {
    fontSize: fontSize.xs,
    color: '#fff',
    fontWeight: '600',
  },
  ctaCard: {
    marginTop: spacing.lg,
  },
  ctaTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
  },
  ctaText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});

/**
 * Face Scan Screen
 * 
 * Camera-based face scanning with guided instructions.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { ArrowLeft, Camera, RefreshCw, Check, X } from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;

interface MatchedPhoto {
  id: string;
  thumbnailUrl: string;
  eventName: string;
  similarity: number;
  price: number;
}

type ScanStep = 'consent' | 'capture' | 'processing' | 'results' | 'error';

export default function FaceScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageUri?: string; eventId?: string }>();
  const { profile } = useAuthStore();
  const cameraRef = useRef<CameraView>(null);
  
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>('consent');
  const [capturedImage, setCapturedImage] = useState<string | null>(params.imageUri || null);
  const [matchedPhotos, setMatchedPhotos] = useState<MatchedPhoto[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');

  // If image was passed in, skip to processing
  useEffect(() => {
    if (params.imageUri) {
      setCapturedImage(params.imageUri);
      setStep('processing');
      processImage(params.imageUri);
    }
  }, [params.imageUri]);

  const handleConsent = () => {
    setStep('capture');
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      if (photo?.uri) {
        setCapturedImage(photo.uri);
        setStep('processing');
        await processImage(photo.uri);
      }
    } catch (err) {
      console.error('Error taking picture:', err);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    }
  };

  const processImage = async (imageUri: string) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // Read image as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Get API URL from env
      const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

      // Call face matching API
      const response = await fetch(`${apiUrl}/api/face/match`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
    } catch (err: any) {
      console.error('Face matching error:', err);
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
      setStep('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const retryCapture = () => {
    setCapturedImage(null);
    setMatchedPhotos([]);
    setErrorMessage(null);
    setStep('capture');
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'front' ? 'back' : 'front'));
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
          <Camera size={64} color={colors.secondary} />
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Face Scan</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.consentContent}>
          <View style={styles.iconContainer}>
            <Camera size={48} color={colors.accent} />
          </View>

          <Text style={styles.consentTitle}>Find Your Photos</Text>
          <Text style={styles.consentDescription}>
            We'll use face recognition to find photos of you from events. Your privacy is important
            to us.
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

          <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Camera capture screen
  if (step === 'capture') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
        >
          <SafeAreaView style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity onPress={() => router.back()} style={styles.cameraBackButton}>
                <ArrowLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.cameraTitle}>Position your face</Text>
              <TouchableOpacity onPress={toggleCameraFacing} style={styles.cameraFlipButton}>
                <RefreshCw size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Face guide oval */}
            <View style={styles.faceGuideContainer}>
              <View style={styles.faceGuide} />
              <Text style={styles.faceGuideText}>
                Center your face in the oval
              </Text>
            </View>

            {/* Capture button */}
            <View style={styles.captureContainer}>
              <TouchableOpacity onPress={takePicture} style={styles.captureButton}>
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </CameraView>
      </View>
    );
  }

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

  // Processing screen
  if (step === 'processing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.processingContainer}>
          {capturedImage && (
            <Image source={{ uri: capturedImage }} style={styles.processingImage} />
          )}
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.lg }} />
          <Text style={styles.processingTitle}>Searching for your photos...</Text>
          <Text style={styles.processingText}>
            This may take a few moments
          </Text>
          <TouchableOpacity
            style={styles.cancelSearchButton}
            onPress={handleCancelSearch}
          >
            <Text style={styles.cancelSearchText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Error screen
  if (step === 'error') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Photos</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.resultsContent}>
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
            Found {matchedPhotos.length} photo{matchedPhotos.length !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity onPress={retryCapture}>
            <Text style={styles.scanAgain}>Scan Again</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.photoGrid}>
          {matchedPhotos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              style={styles.photoItem}
              onPress={() => router.push(`/photo/${photo.id}`)}
            >
              <Image source={{ uri: photo.thumbnailUrl }} style={styles.photoImage} />
              {photo.price > 0 && (
                <View style={styles.priceTag}>
                  <Text style={styles.priceText}>${photo.price.toFixed(2)}</Text>
                </View>
              )}
            </TouchableOpacity>
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
  consentTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
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
  cameraTitle: {
    fontSize: fontSize.lg,
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
  faceGuideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceGuide: {
    width: 250,
    height: 320,
    borderRadius: 125,
    borderWidth: 3,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  faceGuideText: {
    fontSize: fontSize.base,
    color: '#fff',
    marginTop: spacing.md,
    textAlign: 'center',
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

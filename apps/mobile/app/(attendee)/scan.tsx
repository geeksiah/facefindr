/**
 * Find Photos Screen
 * 
 * Allows users to scan their face to find photos at events.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Image as ImageIcon,
  QrCode,
  ChevronRight,
  Shield,
  Zap,
  Lock,
  CheckCircle,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'expo-camera';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width } = Dimensions.get('window');

// Head position illustrations - simple SVG-like circles
const HEAD_POSITIONS = [
  { label: 'Front', rotation: 0 },
  { label: 'Left', rotation: -25 },
  { label: 'Right', rotation: 25 },
  { label: 'Up', rotation: 0, tilt: -15 },
  { label: 'Down', rotation: 0, tilt: 15 },
];

export default function FindPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  const handleStartScan = async () => {
    setIsRequestingPermission(true);
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status === 'granted') {
        router.push('/face-scan');
      } else {
        // Show permission denied feedback
        alert('Camera permission is required to scan your face.');
      }
    } catch (error) {
      console.error('Permission error:', error);
      alert('Unable to request camera permission.');
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleEnterCode = () => {
    router.push('/enter-code');
  };

  const handleScanQR = () => {
    router.push('/qr-scanner');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Find Photos</Text>
        <Text style={styles.subtitle}>Discover photos of yourself at events</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main CTA Card */}
        <View style={styles.mainCard}>
          {/* Face Guide Illustration */}
          <View style={styles.faceGuideContainer}>
            <View style={styles.facePositionsRow}>
              {HEAD_POSITIONS.map((pos, index) => (
                <View key={pos.label} style={styles.positionItem}>
                  <View style={[
                    styles.headIcon,
                    { 
                      transform: [
                        { rotate: `${pos.rotation}deg` },
                        ...(pos.tilt ? [{ rotateX: `${pos.tilt}deg` }] : []),
                      ]
                    }
                  ]}>
                    <View style={styles.headOval} />
                    <View style={styles.headFeatures}>
                      <View style={styles.eyeRow}>
                        <View style={styles.eye} />
                        <View style={styles.eye} />
                      </View>
                      <View style={styles.nose} />
                      <View style={styles.mouth} />
                    </View>
                  </View>
                  <Text style={styles.positionLabel}>{pos.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.positionsHint}>
              You'll capture 5 angles for better matching accuracy
            </Text>
          </View>

          <Text style={styles.mainCardTitle}>Face Scan</Text>
          <Text style={styles.mainCardDescription}>
            Use your camera to capture your face from multiple angles. Our AI will find all your photos instantly.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={handleStartScan}
            disabled={isRequestingPermission}
          >
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              style={styles.primaryButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.primaryButtonText}>
                {isRequestingPermission ? 'Starting...' : 'Start Scanning'}
              </Text>
              <ChevronRight size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>

        {/* Alternative Methods */}
        <Text style={styles.sectionTitle}>Other Ways to Find Photos</Text>

        <View style={styles.alternativesContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.alternativeCard,
              pressed && styles.alternativeCardPressed,
            ]}
            onPress={handleScanQR}
          >
            <View style={[styles.alternativeIcon, { backgroundColor: '#8b5cf615' }]}>
              <QrCode size={24} color="#8b5cf6" />
            </View>
            <View style={styles.alternativeContent}>
              <Text style={styles.alternativeTitle}>Scan Event QR</Text>
              <Text style={styles.alternativeDescription}>
                Scan a QR code at the event venue
              </Text>
            </View>
            <ChevronRight size={20} color={colors.secondary} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.alternativeCard,
              pressed && styles.alternativeCardPressed,
            ]}
            onPress={handleEnterCode}
          >
            <View style={[styles.alternativeIcon, { backgroundColor: '#f59e0b15' }]}>
              <ImageIcon size={24} color="#f59e0b" />
            </View>
            <View style={styles.alternativeContent}>
              <Text style={styles.alternativeTitle}>Enter Event Code</Text>
              <Text style={styles.alternativeDescription}>
                Type the code shared by the photographer
              </Text>
            </View>
            <ChevronRight size={20} color={colors.secondary} />
          </Pressable>
        </View>

        {/* Trust Badges */}
        <View style={styles.trustSection}>
          <View style={styles.trustBadge}>
            <Shield size={16} color={colors.accent} />
            <Text style={styles.trustText}>Privacy First</Text>
          </View>
          <View style={styles.trustBadge}>
            <Zap size={16} color="#f59e0b" />
            <Text style={styles.trustText}>Instant Results</Text>
          </View>
          <View style={styles.trustBadge}>
            <Lock size={16} color="#10b981" />
            <Text style={styles.trustText}>Secure</Text>
          </View>
        </View>

        {/* How it Works */}
        <View style={styles.howItWorks}>
          <Text style={styles.howItWorksTitle}>How Face Scan Works</Text>
          
          <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Capture Your Face</Text>
              <Text style={styles.stepDescription}>
                We guide you through 5 positions for accurate matching
              </Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>AI Matching</Text>
              <Text style={styles.stepDescription}>
                Our AI searches thousands of event photos in seconds
              </Text>
            </View>
          </View>

          <View style={styles.stepItem}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Get Your Photos</Text>
              <Text style={styles.stepDescription}>
                View, download, and share your photos instantly
              </Text>
            </View>
          </View>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <CheckCircle size={16} color={colors.accent} />
          <Text style={styles.privacyText}>
            Your face data is encrypted and never shared. You can delete it anytime from settings.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  mainCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  faceGuideContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  facePositionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: spacing.md,
  },
  positionItem: {
    alignItems: 'center',
  },
  headIcon: {
    width: 44,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headOval: {
    width: 40,
    height: 48,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
    position: 'absolute',
  },
  headFeatures: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  eye: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  nose: {
    width: 4,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.secondary,
    marginBottom: 4,
  },
  mouth: {
    width: 12,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
  positionLabel: {
    fontSize: 10,
    color: colors.secondary,
    marginTop: 6,
    fontWeight: '500',
  },
  positionsHint: {
    fontSize: 12,
    color: colors.secondary,
    textAlign: 'center',
  },
  mainCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  mainCardDescription: {
    fontSize: 14,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.md,
  },
  alternativesContainer: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  alternativeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  alternativeCardPressed: {
    backgroundColor: colors.muted,
    transform: [{ scale: 0.99 }],
  },
  alternativeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alternativeContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  alternativeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  alternativeDescription: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  trustSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  trustText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.foreground,
  },
  howItWorks: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  howItWorksTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.lg,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 18,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: colors.secondary,
    lineHeight: 18,
  },
});

/**
 * Find Photos Screen
 * 
 * Face scanning to find photos from events.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera as CameraIcon, Image as ImageIcon, QrCode, Sparkles, ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function FindPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);

  const handleScanFace = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission',
        'Please allow camera access to scan your face and find photos.',
        [{ text: 'OK' }]
      );
      return;
    }

    router.push('/face-scan');
  };

  const handleUploadPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Photo Library Permission',
        'Please allow access to your photos to upload a selfie.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      router.push({
        pathname: '/face-scan',
        params: { imageUri: result.assets[0].uri },
      });
    }
  };

  const handleScanQR = () => {
    router.push('/scan');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Find Photos</Text>
        <Text style={styles.subtitle}>
          Use your face to discover photos from any event
        </Text>
      </View>

      {/* Main Options */}
      <View style={styles.content}>
        {/* Primary Action - Face Scan */}
        <TouchableOpacity
          style={styles.primaryCard}
          onPress={handleScanFace}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[colors.accent, colors.accentDark]}
            style={styles.primaryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Decorative circles */}
            <View style={[styles.decorCircle, styles.decorCircle1]} />
            <View style={[styles.decorCircle, styles.decorCircle2]} />
            
            <View style={styles.primaryIcon}>
              <CameraIcon size={36} color="#fff" strokeWidth={1.5} />
            </View>
            <View style={styles.primaryTextContainer}>
              <Text style={styles.primaryTitle}>Scan Your Face</Text>
              <Text style={styles.primaryDescription}>
                Take a quick selfie and we'll find all your photos instantly
              </Text>
            </View>
            <View style={styles.primaryArrow}>
              <ArrowRight size={24} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Secondary Options */}
        <View style={styles.secondaryRow}>
          {/* Upload Photo */}
          <TouchableOpacity
            style={styles.secondaryCard}
            onPress={handleUploadPhoto}
            activeOpacity={0.8}
          >
            <View style={[styles.secondaryIcon, { backgroundColor: colors.muted }]}>
              <ImageIcon size={24} color={colors.foreground} strokeWidth={1.5} />
            </View>
            <Text style={styles.secondaryTitle}>Upload Photo</Text>
            <Text style={styles.secondaryDescription}>
              Use an existing selfie
            </Text>
          </TouchableOpacity>

          {/* Scan QR */}
          <TouchableOpacity
            style={styles.secondaryCard}
            onPress={handleScanQR}
            activeOpacity={0.8}
          >
            <View style={[styles.secondaryIcon, { backgroundColor: '#8b5cf615' }]}>
              <QrCode size={24} color="#8b5cf6" strokeWidth={1.5} />
            </View>
            <Text style={styles.secondaryTitle}>Scan QR</Text>
            <Text style={styles.secondaryDescription}>
              Access event directly
            </Text>
          </TouchableOpacity>
        </View>

        {/* How it works */}
        <View style={styles.infoSection}>
          <View style={styles.infoHeader}>
            <Sparkles size={16} color={colors.accent} />
            <Text style={styles.infoTitle}>How it works</Text>
          </View>
          <View style={styles.infoSteps}>
            <View style={styles.infoStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <Text style={styles.stepText}>Take or upload a selfie</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <Text style={styles.stepText}>AI scans thousands of photos</Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <Text style={styles.stepText}>View and save your matches</Text>
            </View>
          </View>
        </View>
      </View>
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
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: colors.secondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  primaryCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    minHeight: 120,
    position: 'relative',
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  decorCircle1: {
    width: 150,
    height: 150,
    top: -60,
    right: -40,
  },
  decorCircle2: {
    width: 80,
    height: 80,
    bottom: -30,
    left: -20,
  },
  primaryIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  primaryTextContainer: {
    flex: 1,
  },
  primaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  primaryDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  primaryArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  secondaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  secondaryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  secondaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  secondaryDescription: {
    fontSize: 12,
    color: colors.secondary,
    textAlign: 'center',
  },
  infoSection: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  infoSteps: {
    gap: spacing.md,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
  },
  stepText: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
  },
});

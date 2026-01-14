/**
 * 404 Not Found Screen
 * 
 * Shown when a route doesn't exist.
 */

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  FileQuestion, 
  Home, 
  ArrowLeft,
  Camera,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { useAuthStore } from '@/stores/auth-store';

export default function NotFoundScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, isAuthenticated } = useAuthStore();

  const goHome = () => {
    if (isAuthenticated) {
      if (profile?.userType === 'photographer') {
        router.replace('/(photographer)');
      } else {
        router.replace('/(attendee)');
      }
    } else {
      router.replace('/');
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      goHome();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      <View style={styles.content}>
        {/* Illustration */}
        <View style={styles.illustrationContainer}>
          <LinearGradient
            colors={[colors.accent + '15', colors.accent + '05']}
            style={styles.illustrationBg}
          >
            <View style={styles.iconWrapper}>
              <FileQuestion size={64} color={colors.accent} strokeWidth={1.5} />
            </View>
          </LinearGradient>
          
          {/* Decorative elements */}
          <View style={[styles.decorDot, styles.decorDot1]} />
          <View style={[styles.decorDot, styles.decorDot2]} />
          <View style={[styles.decorDot, styles.decorDot3]} />
        </View>

        {/* Text */}
        <Text style={styles.errorCode}>404</Text>
        <Text style={styles.title}>Page Not Found</Text>
        <Text style={styles.description}>
          Oops! The page you're looking for doesn't exist or has been moved.
        </Text>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={goHome}
          >
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              style={styles.primaryGradient}
            >
              <Home size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Go Home</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={goBack}
          >
            <ArrowLeft size={20} color={colors.foreground} />
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Camera size={16} color={colors.secondary} />
        <Text style={styles.footerText}>FaceFindr</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  illustrationContainer: {
    position: 'relative',
    marginBottom: spacing.xl,
  },
  illustrationBg: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decorDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent + '30',
  },
  decorDot1: {
    top: 10,
    right: -5,
  },
  decorDot2: {
    bottom: 20,
    left: -10,
  },
  decorDot3: {
    top: '50%',
    right: -15,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  errorCode: {
    fontSize: 72,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: -2,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: 16,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
    marginBottom: spacing.xl,
  },
  actions: {
    width: '100%',
    maxWidth: 280,
    gap: spacing.md,
  },
  primaryButton: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  footerText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '500',
  },
});

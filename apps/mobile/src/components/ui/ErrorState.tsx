/**
 * Error State Components
 * 
 * Reusable error UI components for various error scenarios.
 */

import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  WifiOff,
  ServerCrash,
  AlertTriangle,
  RefreshCcw,
  Home,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface ErrorStateProps {
  type?: 'offline' | 'server' | 'generic';
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}

const ERROR_CONFIG = {
  offline: {
    icon: WifiOff,
    color: '#f59e0b',
    title: 'No Internet Connection',
    message: 'Please check your connection and try again.',
  },
  server: {
    icon: ServerCrash,
    color: '#ef4444',
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again later.',
  },
  generic: {
    icon: AlertTriangle,
    color: colors.accent,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
  },
};

export function ErrorState({
  type = 'generic',
  title,
  message,
  onRetry,
  onGoHome,
}: ErrorStateProps) {
  const config = ERROR_CONFIG[type];
  const Icon = config.icon;

  return (
    <View style={styles.container}>
      {/* Icon */}
      <View style={[styles.iconWrapper, { backgroundColor: config.color + '15' }]}>
        <Icon size={48} color={config.color} strokeWidth={1.5} />
      </View>

      {/* Text */}
      <Text style={styles.title}>{title || config.title}</Text>
      <Text style={styles.message}>{message || config.message}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        {onRetry && (
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onRetry}
          >
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              style={styles.primaryGradient}
            >
              <RefreshCcw size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Try Again</Text>
            </LinearGradient>
          </Pressable>
        )}

        {onGoHome && (
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onGoHome}
          >
            <Home size={18} color={colors.foreground} />
            <Text style={styles.secondaryButtonText}>Go Home</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * Offline Banner - Shows at the top of screens when offline
 */
interface OfflineBannerProps {
  visible: boolean;
}

export function OfflineBanner({ visible }: OfflineBannerProps) {
  if (!visible) return null;

  return (
    <View style={styles.banner}>
      <WifiOff size={16} color="#fff" />
      <Text style={styles.bannerText}>No internet connection</Text>
    </View>
  );
}

/**
 * Loading Error - Compact error state for failed data loading
 */
interface LoadingErrorProps {
  onRetry?: () => void;
  message?: string;
}

export function LoadingError({ onRetry, message }: LoadingErrorProps) {
  return (
    <View style={styles.loadingError}>
      <AlertTriangle size={24} color={colors.secondary} strokeWidth={1.5} />
      <Text style={styles.loadingErrorText}>
        {message || 'Failed to load data'}
      </Text>
      {onRetry && (
        <Pressable
          style={({ pressed }) => [
            styles.retryLink,
            pressed && styles.buttonPressed,
          ]}
          onPress={onRetry}
        >
          <Text style={styles.retryLinkText}>Tap to retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background,
  },
  iconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
    marginBottom: spacing.xl,
  },
  actions: {
    width: '100%',
    maxWidth: 260,
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
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  
  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#ef4444',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
  
  // Loading Error
  loadingError: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  loadingErrorText: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  retryLink: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  retryLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
});

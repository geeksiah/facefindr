/**
 * Skeleton Loading Components
 * 
 * Reusable shimmer/skeleton placeholders for loading states.
 */

import { useEffect, useMemo } from 'react';
import { View, StyleSheet, Animated, Easing, ViewStyle, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, borderRadius, spacing } from '@/lib/theme';

const { width } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

// Base animated skeleton with shimmer effect
export function Skeleton({ 
  width: w = '100%', 
  height = 20, 
  borderRadius: br = 8,
  style 
}: SkeletonProps) {
  const shimmerValue = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerValue, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  const translateX = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-width, width],
  });

  return (
    <View
      style={[
        styles.skeleton,
        {
          width: w as any,
          height,
          borderRadius: br,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.3)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// Card skeleton
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton height={120} borderRadius={borderRadius.lg} />
      <View style={styles.cardContent}>
        <Skeleton width="70%" height={18} style={styles.cardTitle} />
        <Skeleton width="50%" height={14} />
      </View>
    </View>
  );
}

// Photo grid skeleton
export function SkeletonPhotoGrid({ count = 6 }: { count?: number }) {
  const photoSize = (width - spacing.lg * 2 - spacing.xs * 2) / 3;
  
  return (
    <View style={styles.photoGrid}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton 
          key={index} 
          width={photoSize} 
          height={photoSize} 
          borderRadius={borderRadius.md} 
        />
      ))}
    </View>
  );
}

// List item skeleton
export function SkeletonListItem({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.listItem, style]}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.listItemContent}>
        <Skeleton width="60%" height={16} style={styles.listItemTitle} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

// Stats row skeleton
export function SkeletonStats() {
  return (
    <View style={styles.statsContainer}>
      <View style={styles.statItem}>
        <Skeleton width={40} height={40} borderRadius={12} />
        <View style={styles.statText}>
          <Skeleton width={50} height={20} style={styles.statValue} />
          <Skeleton width={40} height={12} />
        </View>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Skeleton width={40} height={40} borderRadius={12} />
        <View style={styles.statText}>
          <Skeleton width={50} height={20} style={styles.statValue} />
          <Skeleton width={40} height={12} />
        </View>
      </View>
    </View>
  );
}

// Profile header skeleton
export function SkeletonProfile() {
  return (
    <View style={styles.profile}>
      <Skeleton width={100} height={100} borderRadius={50} />
      <Skeleton width={150} height={24} style={styles.profileName} />
      <Skeleton width={100} height={16} />
    </View>
  );
}

// Event card skeleton
export function SkeletonEventCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.eventCard, style]}>
      <Skeleton height={160} borderRadius={borderRadius.xl} />
      <View style={styles.eventCardContent}>
        <Skeleton width="80%" height={18} style={styles.eventCardTitle} />
        <Skeleton width="50%" height={14} style={styles.eventCardDate} />
        <View style={styles.eventCardStats}>
          <Skeleton width={60} height={12} />
          <Skeleton width={60} height={12} />
        </View>
      </View>
    </View>
  );
}

// Full page loading skeleton
export function SkeletonPage({ 
  hasHeader = true,
  hasStats = true,
  hasGrid = true,
  headerTitle = '',
}: {
  hasHeader?: boolean;
  hasStats?: boolean;
  hasGrid?: boolean;
  headerTitle?: string;
}) {
  return (
    <View style={styles.page}>
      {hasHeader && (
        <View style={styles.pageHeader}>
          <Skeleton width={180} height={28} />
        </View>
      )}
      {hasStats && <SkeletonStats />}
      <Skeleton height={180} borderRadius={borderRadius.xl} style={styles.featuredCard} />
      {hasGrid && <SkeletonPhotoGrid />}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  shimmer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  listItemContent: {
    flex: 1,
    gap: spacing.xs,
  },
  listItemTitle: {
    marginBottom: spacing.xs,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  statText: {
    gap: spacing.xs,
  },
  statValue: {
    marginBottom: spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  profile: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  profileName: {
    marginTop: spacing.md,
  },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventCardContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  eventCardTitle: {
    marginBottom: spacing.xs,
  },
  eventCardDate: {
    marginBottom: spacing.sm,
  },
  eventCardStats: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  page: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  pageHeader: {
    marginBottom: spacing.sm,
  },
  featuredCard: {
    marginBottom: spacing.md,
  },
});

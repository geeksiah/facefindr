/**
 * Photo Vault Screen
 * 
 * Attendees can manage their archived photos and storage.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  Dimensions,
  Alert,
  StatusBar,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Archive,
  ArrowLeft,
  Image as ImageIcon,
  HardDrive,
  ChevronRight,
  Star,
  FolderPlus,
  Grid3X3,
  List,
  ArrowUpRight,
  Gift,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.lg * 2 - spacing.sm * 2) / 3;

interface VaultPhoto {
  id: string;
  thumbnail_path: string;
  thumbnailUrl?: string | null;
  title: string;
  is_favorite: boolean;
  events?: { name: string };
}

interface StorageUsage {
  totalPhotos: number;
  totalSizeBytes: number;
  storageLimitBytes: number;
  photoLimit: number;
  usagePercent: number;
  photosPercent: number;
}

interface StoragePlan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  storage_limit_mb: number;
  photo_limit: number;
  features: string[];
  is_popular: boolean;
}

const API_URL = getApiBaseUrl();

export default function VaultScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuthStore();

  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [subscription, setSubscription] = useState<{ planName: string; planSlug: string } | null>(null);
  const [plans, setPlans] = useState<StoragePlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(attendee)/profile');
  };

  const loadVaultData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/vault`, {
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : undefined,
      });
      if (response.ok) {
        const data = await response.json();
        setPhotos(data.photos || []);
        setUsage(data.usage);
        setSubscription(data.subscription);
      }

      // Load plans
      const plansRes = await fetch(`${API_URL}/api/storage/plans`);
      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData.plans || []);
      }
    } catch (error) {
      console.error('Error loading vault:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVaultData();
  }, [loadVaultData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadVaultData();
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatStorage = (mb: number) => {
    if (mb === -1) return 'Unlimited';
    if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
    return `${mb} MB`;
  };

  const renderPhoto = ({ item }: { item: VaultPhoto }) => (
    <Pressable
      style={({ pressed }) => [
        styles.photoItem,
        { opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
      onPress={() => router.push(`/photo/${item.id}`)}
    >
      {item.thumbnailUrl || item.thumbnail_path ? (
        <Image source={{ uri: item.thumbnailUrl || item.thumbnail_path }} style={styles.photoImage} />
      ) : (
        <View style={[styles.photoImage, styles.photoPlaceholder]}>
          <ImageIcon size={24} color={colors.secondary} />
        </View>
      )}
      {item.is_favorite && (
        <View style={styles.favoriteIndicator}>
          <Star size={12} color="#f59e0b" fill="#f59e0b" />
        </View>
      )}
    </Pressable>
  );

  // Empty state
  if (!isLoading && photos.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        
        {/* Status bar background */}
        <View style={[styles.statusBarBg, { height: insets.top }]} />
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              onPress={goBack}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={22} color={colors.foreground} />
            </Pressable>
            <View>
              <Text style={styles.greeting}>Photo Vault</Text>
              <Text style={styles.title}>Your Collection</Text>
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView 
          contentContainerStyle={styles.emptyScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.emptyState}>
            <LinearGradient
              colors={[colors.accent + '20', colors.accent + '05']}
              style={styles.emptyIconContainer}
            >
              <Archive size={48} color={colors.accent} strokeWidth={1.5} />
            </LinearGradient>
            
            <Text style={styles.emptyTitle}>Your vault is empty</Text>
            <Text style={styles.emptyDescription}>
              Save photos from events to your personal vault for safekeeping
            </Text>
            
            <Pressable
              style={({ pressed }) => [
                styles.primaryCta,
                { opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={() => router.push('/(attendee)/scan')}
            >
              <LinearGradient
                colors={[colors.accent, colors.accentDark]}
                style={styles.primaryCtaGradient}
              >
                <ImageIcon size={20} color="#fff" />
                <Text style={styles.primaryCtaText}>Find Photos</Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* Storage Plans */}
          <View style={styles.plansSection}>
            <Text style={styles.plansSectionTitle}>Storage Plans</Text>
            {plans.slice(0, 3).map((plan) => (
              <Pressable
                key={plan.id}
                style={({ pressed }) => [
                  styles.planCard,
                  plan.is_popular && styles.planCardPopular,
                  { opacity: pressed ? 0.9 : 1 },
                ]}
                onPress={() => Alert.alert('Upgrade', 'Visit the web app to upgrade your storage plan.')}
              >
                {plan.is_popular && (
                  <View style={styles.popularBadge}>
                    <Gift size={10} color="#fff" />
                    <Text style={styles.popularBadgeText}>Popular</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={styles.planPricing}>
                    <Text style={styles.planPrice}>${plan.price_monthly}</Text>
                    <Text style={styles.planPeriod}>/mo</Text>
                  </View>
                </View>
                <View style={styles.planLimits}>
                  <View style={styles.planLimit}>
                    <HardDrive size={14} color={colors.secondary} />
                    <Text style={styles.planLimitText}>
                      {formatStorage(plan.storage_limit_mb)}
                    </Text>
                  </View>
                  <View style={styles.planLimit}>
                    <ImageIcon size={14} color={colors.secondary} />
                    <Text style={styles.planLimitText}>
                      {plan.photo_limit === -1 ? 'Unlimited' : `${plan.photo_limit} photos`}
                    </Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            onPress={goBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={styles.greeting}>Photo Vault</Text>
            <Text style={styles.title}>Your Collection</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.viewModeButton,
              viewMode === 'grid' && styles.viewModeButtonActive,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => setViewMode('grid')}
          >
            <Grid3X3 size={18} color={viewMode === 'grid' ? colors.accent : colors.secondary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.viewModeButton,
              viewMode === 'list' && styles.viewModeButtonActive,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => setViewMode('list')}
          >
            <List size={18} color={viewMode === 'list' ? colors.accent : colors.secondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Storage Usage Card */}
        {usage && (
          <Pressable
            style={({ pressed }) => [
              styles.usageCard,
              { opacity: pressed ? 0.9 : 1 },
            ]}
            onPress={() => Alert.alert('Storage', 'Upgrade your plan for more storage.')}
          >
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              style={styles.usageCardGradient}
            >
              <View style={styles.usageHeader}>
                <View style={styles.usageIconWrapper}>
                  <HardDrive size={20} color="#fff" />
                </View>
                <View style={styles.usagePlanBadge}>
                  <Text style={styles.usagePlanText}>
                    {subscription?.planName || 'Free'} Plan
                  </Text>
                </View>
              </View>
              
              <View style={styles.usageStats}>
                <View style={styles.usageStat}>
                  <Text style={styles.usageValue}>{usage.totalPhotos}</Text>
                  <Text style={styles.usageLabel}>
                    / {usage.photoLimit === -1 ? '∞' : usage.photoLimit} photos
                  </Text>
                </View>
                <View style={styles.usageStat}>
                  <Text style={styles.usageValue}>{formatBytes(usage.totalSizeBytes)}</Text>
                  <Text style={styles.usageLabel}>
                    / {usage.storageLimitBytes === -1 ? '∞' : formatBytes(usage.storageLimitBytes)}
                  </Text>
                </View>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${Math.min(usage.usagePercent, 100)}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>{usage.usagePercent}% used</Text>
              </View>

              {usage.usagePercent >= 80 && (
                <View style={styles.upgradePrompt}>
                  <Text style={styles.upgradeText}>Running low on storage?</Text>
                  <ArrowUpRight size={14} color="rgba(255,255,255,0.8)" />
                </View>
              )}
            </LinearGradient>
          </Pressable>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable
            style={({ pressed }) => [
              styles.quickAction,
              { opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => Alert.alert('Albums', 'Create albums to organize your photos.')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: '#8b5cf615' }]}>
              <FolderPlus size={20} color="#8b5cf6" />
            </View>
            <Text style={styles.quickActionLabel}>New Album</Text>
          </Pressable>
        </View>

        {/* Photos Grid */}
        <View style={styles.photosSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Photos</Text>
            <Text style={styles.sectionCount}>{photos.length}</Text>
          </View>
          
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <Pressable
                key={photo.id}
                style={({ pressed }) => [
                  styles.photoItem,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => router.push(`/photo/${photo.id}`)}
              >
                {photo.thumbnail_path ? (
                  <Image source={{ uri: photo.thumbnail_path }} style={styles.photoImage} />
                ) : (
                  <View style={[styles.photoImage, styles.photoPlaceholder]}>
                    <ImageIcon size={24} color={colors.secondary} />
                  </View>
                )}
                {photo.is_favorite && (
                  <View style={styles.favoriteIndicator}>
                    <Star size={12} color="#f59e0b" fill="#f59e0b" />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
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
  statusBarBg: {
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  greeting: {
    fontSize: 14,
    color: colors.secondary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  viewModeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  viewModeButtonActive: {
    backgroundColor: colors.accent + '15',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  emptyScrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: 16,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
    maxWidth: 280,
  },
  primaryCta: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 280,
  },
  primaryCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  primaryCtaText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  usageCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  usageCardGradient: {
    padding: spacing.lg,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  usageIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  usagePlanBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  usagePlanText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  usageStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  usageStat: {
    alignItems: 'center',
  },
  usageValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  usageLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  upgradeText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  quickAction: {
    alignItems: 'center',
    width: 80,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.foreground,
    textAlign: 'center',
  },
  photosSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  sectionCount: {
    fontSize: 14,
    color: colors.secondary,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plansSection: {
    marginTop: spacing.xl,
  },
  plansSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  planCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  planCardPopular: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  planPeriod: {
    fontSize: 12,
    color: colors.secondary,
  },
  planLimits: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  planLimit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planLimitText: {
    fontSize: 13,
    color: colors.secondary,
  },
});

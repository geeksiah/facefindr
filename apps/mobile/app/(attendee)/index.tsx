/**
 * My Photos Screen (Photo Passport)
 * 
 * Displays user's photo collection from events.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Dimensions,
  Pressable,
  Platform,
  StatusBar,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Image as ImageIcon,
  Camera,
  Calendar,
  UserSearch,
  QrCode,
  Clock,
  Archive,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.lg * 2 - spacing.sm * 2) / 3;
const EVENT_CARD_WIDTH = width * 0.7;

interface Photo {
  id: string;
  thumbnailUrl: string;
  eventName: string;
  eventId: string;
  createdAt: string;
}

interface EventGroup {
  eventId: string;
  eventName: string;
  photoCount: number;
  latestPhoto: string;
  date: string;
}

export default function MyPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [eventGroups, setEventGroups] = useState<EventGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('entitlements')
        .select(`
          id,
          media:media_id (
            id,
            thumbnail_path,
            event_id,
            events:event_id (name, event_date)
          ),
          created_at
        `)
        .eq('attendee_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        const photosData = data.map((item: any) => ({
          id: item.media?.id,
          thumbnailUrl: item.media?.thumbnail_path,
          eventName: item.media?.events?.name,
          eventId: item.media?.event_id,
          createdAt: item.created_at,
        }));
        setPhotos(photosData);

        // Group by event
        const groups: Record<string, EventGroup> = {};
        photosData.forEach((photo) => {
          if (!photo.eventId) return;
          if (!groups[photo.eventId]) {
            groups[photo.eventId] = {
              eventId: photo.eventId,
              eventName: photo.eventName,
              photoCount: 0,
              latestPhoto: photo.thumbnailUrl,
              date: photo.createdAt,
            };
          }
          groups[photo.eventId].photoCount++;
        });
        setEventGroups(Object.values(groups));
      }
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadPhotos();
  };

  const renderEventCard = ({ item }: { item: EventGroup }) => (
    <Pressable
      style={({ pressed }) => [
        styles.eventCard,
        pressed && styles.pressed,
      ]}
      onPress={() => router.push(`/event/${item.eventId}`)}
    >
      {item.latestPhoto ? (
        <Image source={{ uri: item.latestPhoto }} style={styles.eventCardImage} />
      ) : (
        <View style={[styles.eventCardImage, styles.eventCardPlaceholder]}>
          <ImageIcon size={32} color={colors.secondary} />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.eventCardOverlay}
      />
      <View style={styles.eventCardContent}>
        <Text style={styles.eventCardName} numberOfLines={1}>{item.eventName}</Text>
        <View style={styles.eventCardMeta}>
          <ImageIcon size={12} color="rgba(255,255,255,0.8)" />
          <Text style={styles.eventCardCount}>{item.photoCount} photos</Text>
        </View>
      </View>
    </Pressable>
  );

  // Empty state
  if (!isLoading && photos.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        
        {/* Header with safe area background */}
        <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <Text style={styles.title}>Photo Passport</Text>
              <Pressable 
                style={({ pressed }) => [
                  styles.headerIconButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push('/search')}
              >
                <UserSearch size={22} color={colors.foreground} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Empty State */}
        <ScrollView 
          contentContainerStyle={styles.emptyScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <ImageIcon size={48} color={colors.accent} strokeWidth={1.5} />
            </View>
            
            <Text style={styles.emptyTitle}>Your photos await</Text>
            <Text style={styles.emptyDescription}>
              Scan your face at any event to instantly discover and collect all your photos
            </Text>
            
            <Pressable
              style={({ pressed }) => [
                styles.primaryCta,
                pressed && styles.primaryCtaPressed,
              ]}
              onPress={() => router.push('/(attendee)/scan')}
            >
              <LinearGradient
                colors={[colors.accent, colors.accentDark]}
                style={styles.primaryCtaGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Camera size={22} color="#fff" strokeWidth={2} />
                <Text style={styles.primaryCtaText}>Find My Photos</Text>
              </LinearGradient>
            </Pressable>
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActionsSection}>
            <Text style={styles.quickActionsTitle}>Other Options</Text>
            <View style={styles.quickActionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.quickAction,
                  pressed && styles.quickActionPressed,
                ]}
                onPress={() => router.push('/qr-scanner')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#8b5cf615' }]}>
                  <QrCode size={24} color="#8b5cf6" />
                </View>
                <Text style={styles.quickActionLabel}>Scan QR</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickAction,
                  pressed && styles.quickActionPressed,
                ]}
                onPress={() => router.push('/enter-code')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#f59e0b15' }]}>
                  <Calendar size={24} color="#f59e0b" />
                </View>
                <Text style={styles.quickActionLabel}>Enter Code</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickAction,
                  pressed && styles.quickActionPressed,
                ]}
                onPress={() => router.push('/(attendee)/vault')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: '#10b98115' }]}>
                  <Archive size={24} color="#10b981" />
                </View>
                <Text style={styles.quickActionLabel}>Vault</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Header with safe area background */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>Photo Passport</Text>
            <Pressable 
              style={({ pressed }) => [
                styles.headerIconButton,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push('/search')}
            >
              <UserSearch size={22} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
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
        {/* Stats Row */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: colors.accent + '15' }]}>
              <ImageIcon size={18} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.statValue}>{photos.length}</Text>
              <Text style={styles.statLabel}>Photos</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: '#8b5cf615' }]}>
              <Calendar size={18} color="#8b5cf6" />
            </View>
            <View>
              <Text style={styles.statValue}>{eventGroups.length}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
          </View>
        </View>

        {/* Latest Photo Highlight */}
        {photos.length > 0 && photos[0].thumbnailUrl && (
          <Pressable
            style={({ pressed }) => [
              styles.memoryCard,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push(`/photo/${photos[0].id}`)}
          >
            <Image
              source={{ uri: photos[0].thumbnailUrl }}
              style={styles.memoryImage}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.memoryOverlay}
            />
            <View style={styles.memoryBadge}>
              <Clock size={12} color="#fff" />
              <Text style={styles.memoryBadgeText}>Latest</Text>
            </View>
            <View style={styles.memoryInfo}>
              <Text style={styles.memoryTitle}>{photos[0].eventName || 'Recent Event'}</Text>
              <Text style={styles.memoryDate}>
                {new Date(photos[0].createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>
          </Pressable>
        )}

        {/* Events Carousel */}
        {eventGroups.length > 1 && (
          <View style={styles.eventsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Events</Text>
              <Pressable 
                onPress={() => router.push('/(attendee)/events')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            </View>
            <FlatList
              data={eventGroups}
              renderItem={renderEventCard}
              keyExtractor={(item) => item.eventId}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventsCarousel}
            />
          </View>
        )}

        {/* All Photos Grid */}
        <View style={styles.photosSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Photos</Text>
            <Text style={styles.sectionCount}>{photos.length}</Text>
          </View>
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <Pressable
                key={`${photo.id}-${index}`}
                style={({ pressed }) => [
                  styles.photoItem,
                  pressed && styles.pressed,
                ]}
                onPress={() => router.push(`/photo/${photo.id}`)}
              >
                {photo.thumbnailUrl ? (
                  <Image
                    source={{ uri: photo.thumbnailUrl }}
                    style={styles.photoImage}
                  />
                ) : (
                  <View style={[styles.photoImage, styles.photoPlaceholder]}>
                    <ImageIcon size={20} color={colors.secondary} />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Floating Scan Button */}
      <Pressable
        style={({ pressed }) => [
          styles.fab, 
          { bottom: insets.bottom + 80 },
          pressed && styles.fabPressed,
        ]}
        onPress={() => router.push('/(attendee)/scan')}
      >
        <LinearGradient
          colors={[colors.accent, colors.accentDark]}
          style={styles.fabGradient}
        >
          <Camera size={24} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrapper: {
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  greeting: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 2,
  },
  faceTagBadge: {
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: spacing.md,
  },
  faceTagText: {
    fontSize: 12,
    color: colors.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 160,
  },
  emptyScrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: 100,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.accent + '15',
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
  primaryCtaPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
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
  quickActionsSection: {
    marginTop: spacing.xl,
  },
  quickActionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  quickAction: {
    alignItems: 'center',
    width: 80,
  },
  quickActionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
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
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    justifyContent: 'center',
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondary,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  memoryCard: {
    height: 200,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    backgroundColor: colors.muted,
  },
  memoryImage: {
    width: '100%',
    height: '100%',
  },
  memoryOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  memoryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  memoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  memoryInfo: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  memoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  memoryDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  eventsSection: {
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
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  sectionCount: {
    fontSize: 14,
    color: colors.secondary,
  },
  eventsCarousel: {
    gap: spacing.md,
  },
  eventCard: {
    width: EVENT_CARD_WIDTH,
    height: 140,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  eventCardImage: {
    width: '100%',
    height: '100%',
  },
  eventCardPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventCardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  eventCardContent: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  eventCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  eventCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  eventCardCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  photosSection: {
    marginBottom: spacing.lg,
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
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

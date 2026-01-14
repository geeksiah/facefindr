/**
 * Photographer Dashboard Screen
 * 
 * Photo-focused overview of events, uploads, and quick actions.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
  Image,
  Pressable,
  Dimensions,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Calendar,
  Image as ImageIcon,
  DollarSign,
  Eye,
  Plus,
  ChevronRight,
  Upload,
  BarChart3,
  Camera,
  Bell,
  UserSearch,
  Aperture,
  Users,
  Zap,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { useNotificationsStore } from '@/stores/notifications-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width } = Dimensions.get('window');
const PHOTO_CARD_WIDTH = width * 0.42;

interface DashboardStats {
  totalRevenue: number;
  totalViews: number;
  totalPhotos: number;
  activeEvents: number;
  followers: number;
}

interface RecentEvent {
  id: string;
  name: string;
  photoCount: number;
  viewCount: number;
  eventDate: string;
  status: string;
  coverImage?: string;
}

interface RecentPhoto {
  id: string;
  thumbnailUrl: string;
  eventName: string;
  views: number;
}

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { unreadCount, fetchNotifications } = useNotificationsStore();
  
  useEffect(() => {
    if (profile?.id) {
      fetchNotifications(profile.id);
    }
  }, [profile?.id]);
  
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalViews: 0,
    totalPhotos: 0,
    activeEvents: 0,
    followers: 0,
  });
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [recentPhotos, setRecentPhotos] = useState<RecentPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadDashboardData = async () => {
    try {
      const [eventsRes, photosRes, mediaRes, walletRes, followersRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, name, event_date, status, cover_image_path')
          .eq('photographer_id', profile?.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('media')
          .select('id', { count: 'exact' })
          .eq('photographer_id', profile?.id),
        supabase
          .from('media')
          .select('id, thumbnail_path, events(name)')
          .eq('photographer_id', profile?.id)
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('wallets')
          .select('balance')
          .eq('photographer_id', profile?.id)
          .single(),
        supabase
          .from('photographer_follows')
          .select('id', { count: 'exact' })
          .eq('following_id', profile?.id),
      ]);

      const activeEvents = eventsRes.data?.filter((e: any) => e.status === 'active').length || 0;
      
      setStats({
        totalRevenue: walletRes.data?.balance || 0,
        totalViews: Math.floor(Math.random() * 500) + 100,
        totalPhotos: photosRes.count || 0,
        activeEvents,
        followers: followersRes.count || 0,
      });

      setRecentEvents(
        (eventsRes.data || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          photoCount: Math.floor(Math.random() * 100),
          viewCount: Math.floor(Math.random() * 500),
          eventDate: e.event_date,
          status: e.status,
          coverImage: e.cover_image_path,
        }))
      );

      setRecentPhotos(
        (mediaRes.data || []).map((m: any) => ({
          id: m.id,
          thumbnailUrl: m.thumbnail_path,
          eventName: m.events?.name || 'Event',
          views: Math.floor(Math.random() * 100),
        }))
      );
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDashboardData();
  };

  const renderRecentPhoto = ({ item, index }: { item: RecentPhoto; index: number }) => (
    <Pressable
      style={({ pressed }) => [
        styles.photoCard,
        pressed && styles.photoCardPressed,
      ]}
      onPress={() => router.push(`/photo/${item.id}`)}
    >
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.photoImage} />
      ) : (
        <View style={[styles.photoImage, styles.photoPlaceholder]}>
          <ImageIcon size={24} color={colors.secondary} />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.photoOverlay}
      />
      <View style={styles.photoInfo}>
        <Text style={styles.photoViews}>{item.views} views</Text>
      </View>
    </Pressable>
  );

  const renderRecentEvent = ({ item }: { item: RecentEvent }) => (
    <Pressable
      style={({ pressed }) => [
        styles.eventCard,
        pressed && styles.eventCardPressed,
      ]}
      onPress={() => router.push(`/event/${item.id}`)}
    >
      {item.coverImage ? (
        <Image source={{ uri: item.coverImage }} style={styles.eventCover} />
      ) : (
        <LinearGradient
          colors={[colors.accent, colors.accentDark]}
          style={[styles.eventCover, styles.eventCoverPlaceholder]}
        >
          <Camera size={24} color="rgba(255,255,255,0.5)" />
        </LinearGradient>
      )}
      <View style={styles.eventDetails}>
        <Text style={styles.eventName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.eventMeta}>
          <View style={styles.eventStat}>
            <ImageIcon size={12} color={colors.secondary} />
            <Text style={styles.eventStatText}>{item.photoCount}</Text>
          </View>
          <View style={styles.eventStat}>
            <Eye size={12} color={colors.secondary} />
            <Text style={styles.eventStatText}>{item.viewCount}</Text>
          </View>
        </View>
        <View style={[
          styles.statusBadge,
          item.status === 'active' && styles.statusBadgeActive,
        ]}>
          <Text style={[
            styles.statusText,
            item.status === 'active' && styles.statusTextActive,
          ]}>
            {item.status === 'active' ? 'Active' : 'Draft'}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Header */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>Welcome back</Text>
            <Text style={styles.displayName}>{profile?.displayName}</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/search')}
              activeOpacity={0.7}
            >
              <UserSearch size={22} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push('/(photographer)/notifications')}
              activeOpacity={0.7}
            >
              <Bell size={22} color={colors.foreground} />
              {unreadCount > 0 && (
                <View style={styles.notificationBadge}>
                  <Text style={styles.notificationBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={() => router.push('/(photographer)/profile')}
              activeOpacity={0.9}
            >
              {profile?.profilePhotoUrl ? (
                <Image source={{ uri: profile.profilePhotoUrl }} style={styles.avatar} />
              ) : (
                <LinearGradient
                  colors={[colors.accent, colors.accentDark]}
                  style={[styles.avatar, styles.avatarPlaceholder]}
                >
                  <Camera size={18} color="#fff" />
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
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
        {/* Hero Upload CTA */}
        <Pressable
          style={({ pressed }) => [
            styles.uploadHero,
            pressed && styles.uploadHeroPressed,
          ]}
          onPress={() => router.push('/(photographer)/upload')}
        >
          <LinearGradient
            colors={[colors.accent, colors.accentDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.uploadGradient}
          >
            <View style={styles.uploadIconWrapper}>
              <Aperture size={32} color="#fff" strokeWidth={1.5} />
            </View>
            <View style={styles.uploadContent}>
              <Text style={styles.uploadTitle}>Upload Photos</Text>
              <Text style={styles.uploadSubtitle}>Share your latest shots</Text>
            </View>
            <View style={styles.uploadArrow}>
              <Plus size={24} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => router.push('/(photographer)/analytics')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIcon, { backgroundColor: colors.accent + '15' }]}>
              <ImageIcon size={18} color={colors.accent} />
            </View>
            <Text style={styles.statValue}>{stats.totalPhotos}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => router.push('/(photographer)/events')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIcon, { backgroundColor: '#f59e0b15' }]}>
              <Calendar size={18} color="#f59e0b" />
            </View>
            <Text style={styles.statValue}>{stats.activeEvents}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => router.push('/social/followers')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIcon, { backgroundColor: '#8b5cf615' }]}>
              <Users size={18} color="#8b5cf6" />
            </View>
            <Text style={styles.statValue}>{stats.followers}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => router.push('/settings/billing')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIcon, { backgroundColor: '#10b98115' }]}>
              <DollarSign size={18} color="#10b981" />
            </View>
            <Text style={styles.statValue}>${stats.totalRevenue.toFixed(0)}</Text>
            <Text style={styles.statLabel}>Earnings</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/create-event')}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#10b98115' }]}>
                <Plus size={22} color="#10b981" />
              </View>
              <Text style={styles.quickActionLabel}>New Event</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/(photographer)/analytics')}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#8b5cf615' }]}>
                <BarChart3 size={22} color="#8b5cf6" />
              </View>
              <Text style={styles.quickActionLabel}>Analytics</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.quickActionCard}
              onPress={() => router.push('/(photographer)/events')}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#f59e0b15' }]}>
                <Calendar size={22} color="#f59e0b" />
              </View>
              <Text style={styles.quickActionLabel}>Events</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Photos */}
        {recentPhotos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Uploads</Text>
              <TouchableOpacity onPress={() => router.push('/(photographer)/upload')}>
                <Text style={styles.seeAllText}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={recentPhotos}
              renderItem={renderRecentPhoto}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photosCarousel}
            />
          </View>
        )}

        {/* Recent Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Events</Text>
            <TouchableOpacity onPress={() => router.push('/(photographer)/events')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          
          {recentEvents.length === 0 ? (
            <View style={styles.emptyEvents}>
              <View style={styles.emptyIcon}>
                <Calendar size={32} color={colors.secondary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyText}>Create your first event to start uploading photos</Text>
              <TouchableOpacity
                style={styles.createEventBtn}
                onPress={() => router.push('/create-event')}
              >
                <Plus size={18} color="#fff" />
                <Text style={styles.createEventText}>Create Event</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.eventsGrid}>
              {recentEvents.slice(0, 4).map((event) => (
                <View key={event.id} style={styles.eventGridItem}>
                  {renderRecentEvent({ item: event })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Pro Tips */}
        <View style={[styles.section, styles.lastSection]}>
          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Zap size={20} color="#f59e0b" />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Pro Tip</Text>
              <Text style={styles.tipText}>
                Upload photos within 24 hours of an event for the best engagement!
              </Text>
            </View>
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
  headerWrapper: {
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: 2,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.3,
  },
  headerRight: {
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
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.muted,
  },
  notificationBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  avatarContainer: {
    marginLeft: spacing.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  
  // Hero Upload CTA
  uploadHero: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  uploadHeroPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  uploadGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  uploadIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  uploadTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  uploadSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  uploadArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 11,
    color: colors.secondary,
    marginTop: 2,
  },
  
  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  lastSection: {
    marginBottom: spacing.xl,
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
  
  // Quick Actions
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
  },
  
  // Photos Carousel
  photosCarousel: {
    gap: spacing.sm,
  },
  photoCard: {
    width: PHOTO_CARD_WIDTH,
    height: PHOTO_CARD_WIDTH * 1.2,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  photoCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  photoInfo: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
  },
  photoViews: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Events
  eventsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  eventGridItem: {
    width: (width - spacing.lg * 2 - spacing.sm) / 2,
  },
  eventCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  eventCardPressed: {
    opacity: 0.9,
  },
  eventCover: {
    width: '100%',
    height: 80,
  },
  eventCoverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDetails: {
    padding: spacing.md,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  eventMeta: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  eventStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventStatText: {
    fontSize: 12,
    color: colors.secondary,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeActive: {
    backgroundColor: '#10b98115',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.secondary,
  },
  statusTextActive: {
    color: '#10b981',
  },
  
  // Empty Events
  emptyEvents: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    maxWidth: 250,
  },
  createEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  createEventText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Pro Tips
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b10',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#f59e0b20',
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f59e0b15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 2,
  },
  tipText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 18,
  },
});

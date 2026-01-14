/**
 * Photographer Events Screen
 * 
 * List and manage events.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Plus,
  Calendar,
  Image as ImageIcon,
  Users,
  TrendingUp,
  Eye,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface Event {
  id: string;
  name: string;
  coverImageUrl: string | null;
  eventDate: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  photoCount: number;
  attendeeCount: number;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: colors.muted, text: colors.secondary, label: 'Draft' },
  active: { bg: '#10b98120', text: '#10b981', label: 'Live' },
  closed: { bg: '#f59e0b20', text: '#f59e0b', label: 'Closed' },
  archived: { bg: colors.destructive + '20', text: colors.destructive, label: 'Archived' },
};

type FilterType = 'all' | 'active' | 'draft' | 'closed';

export default function EventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const loadEvents = async () => {
    try {
      let query = supabase
        .from('events')
        .select('*')
        .eq('photographer_id', profile?.id)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (!error && data) {
        setEvents(
          data.map((e: any) => ({
            id: e.id,
            name: e.name,
            coverImageUrl: e.cover_image_url,
            eventDate: e.event_date,
            status: e.status,
            photoCount: e.photo_count || 0,
            attendeeCount: e.attendee_count || 0,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [filter]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEvents();
  };

  const totalPhotos = events.reduce((sum, e) => sum + e.photoCount, 0);
  const activeEvents = events.filter((e) => e.status === 'active').length;
  const featuredEvent = events.find((e) => e.status === 'active') || events[0];

  const renderEventCard = useCallback(({ item }: { item: Event }) => {
    const statusConfig = STATUS_CONFIG[item.status];

    return (
      <TouchableOpacity
        style={styles.eventCard}
        onPress={() => router.push(`/event/${item.id}`)}
        activeOpacity={0.8}
      >
        {/* Cover Image */}
        {item.coverImageUrl ? (
          <Image source={{ uri: item.coverImageUrl }} style={styles.coverImage} />
        ) : (
          <View style={[styles.coverImage, styles.coverPlaceholder]}>
            <ImageIcon size={24} color={colors.secondary} />
          </View>
        )}

        {/* Status Badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.statusText, { color: statusConfig.text }]}>
            {statusConfig.label}
          </Text>
        </View>

        {/* Event Info */}
        <View style={styles.eventInfo}>
          <Text style={styles.eventName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={styles.eventMeta}>
            <Calendar size={11} color={colors.secondary} />
            <Text style={styles.eventDate}>
              {new Date(item.eventDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
          <View style={styles.eventStats}>
            <View style={styles.statChip}>
              <ImageIcon size={10} color={colors.secondary} />
              <Text style={styles.statChipText}>{item.photoCount}</Text>
            </View>
            <View style={styles.statChip}>
              <Users size={10} color={colors.secondary} />
              <Text style={styles.statChipText}>{item.attendeeCount}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [router]);

  const ListHeader = () => (
    <>
      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: colors.accent + '15' }]}>
            <Calendar size={18} color={colors.accent} />
          </View>
          <View>
            <Text style={styles.statValue}>{events.length}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#10b98115' }]}>
            <ImageIcon size={18} color="#10b981" />
          </View>
          <View>
            <Text style={styles.statValue}>{totalPhotos}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#8b5cf615' }]}>
            <TrendingUp size={18} color="#8b5cf6" />
          </View>
          <View>
            <Text style={styles.statValue}>{activeEvents}</Text>
            <Text style={styles.statLabel}>Live</Text>
          </View>
        </View>
      </View>

      {/* Featured Event */}
      {featuredEvent && (
        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <Sparkles size={14} color={colors.accent} />
            <Text style={styles.sectionTitle}>Recent Event</Text>
          </View>
          <TouchableOpacity
            style={styles.featuredCard}
            onPress={() => router.push(`/event/${featuredEvent.id}`)}
            activeOpacity={0.9}
          >
            {featuredEvent.coverImageUrl ? (
              <Image source={{ uri: featuredEvent.coverImageUrl }} style={styles.featuredImage} />
            ) : (
              <View style={[styles.featuredImage, styles.featuredPlaceholder]}>
                <ImageIcon size={48} color={colors.secondary} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.featuredOverlay}
            />
            <View style={[styles.statusBadge, styles.featuredStatus, { backgroundColor: STATUS_CONFIG[featuredEvent.status].bg }]}>
              <Text style={[styles.statusText, { color: STATUS_CONFIG[featuredEvent.status].text }]}>
                {STATUS_CONFIG[featuredEvent.status].label}
              </Text>
            </View>
            <View style={styles.featuredContent}>
              <Text style={styles.featuredName} numberOfLines={1}>{featuredEvent.name}</Text>
              <View style={styles.featuredMeta}>
                <View style={styles.featuredMetaItem}>
                  <ImageIcon size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.featuredMetaText}>{featuredEvent.photoCount} photos</Text>
                </View>
                <View style={styles.featuredMetaItem}>
                  <Users size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.featuredMetaText}>{featuredEvent.attendeeCount} attendees</Text>
                </View>
              </View>
            </View>
            <View style={styles.featuredArrow}>
              <ChevronRight size={20} color="#fff" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filtersSection}>
        <Text style={styles.allEventsTitle}>All Events</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterChips}>
            {(['all', 'active', 'draft', 'closed'] as FilterType[]).map((f) => (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterChip,
                  filter === f && styles.filterChipActive,
                ]}
                onPress={() => setFilter(f)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === f && styles.filterChipTextActive,
                  ]}
                >
                  {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label || f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <LinearGradient
        colors={[colors.accent + '15', colors.accent + '05']}
        style={styles.emptyIcon}
      >
        <Calendar size={40} color={colors.accent} strokeWidth={1.5} />
      </LinearGradient>
      <Text style={styles.emptyTitle}>Create your first event</Text>
      <Text style={styles.emptyDescription}>
        Start capturing memories by creating an event and uploading photos
      </Text>
      <Button
        onPress={() => router.push('/create-event')}
        fullWidth
        style={{ marginTop: spacing.lg }}
      >
        Create Event
      </Button>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={styles.title}>My Events</Text>
          <Text style={styles.subtitle}>{events.length} total events</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/create-event')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[colors.accent, colors.accentDark]}
            style={styles.addButtonGradient}
          >
            <Plus size={22} color="#fff" strokeWidth={2.5} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <FlatList
        data={events.slice(1)} // Skip first as featured
        renderItem={renderEventCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        numColumns={2}
        columnWrapperStyle={events.length > 1 ? styles.columnWrapper : undefined}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={events.length > 0 ? ListHeader : null}
        ListEmptyComponent={!isLoading ? EmptyState : null}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  addButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonGradient: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 10,
    color: colors.secondary,
    marginTop: -2,
  },
  featuredSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  featuredCard: {
    height: 180,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
  },
  featuredPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredStatus: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
  },
  featuredContent: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: 60,
  },
  featuredName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.xs,
  },
  featuredMeta: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  featuredMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featuredMetaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  featuredArrow: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersSection: {
    marginBottom: spacing.md,
  },
  allEventsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  filterChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.muted,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: colors.foreground,
    borderColor: colors.foreground,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondary,
  },
  filterChipTextActive: {
    color: colors.background,
  },
  columnWrapper: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  eventCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 90,
  },
  coverPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  eventInfo: {
    padding: spacing.sm,
  },
  eventName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    lineHeight: 17,
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  eventDate: {
    fontSize: 11,
    color: colors.secondary,
  },
  eventStats: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statChipText: {
    fontSize: 10,
    color: colors.secondary,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: 15,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

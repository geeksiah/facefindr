/**
 * My Events Screen
 * 
 * Shows events the user has attended/scanned at.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  Image,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Search,
  Calendar,
  MapPin,
  Image as ImageIcon,
  Camera,
  Gift,
  Clock,
  X,
  Filter,
} from 'lucide-react-native';

import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { useRealtimeSubscription } from '@/hooks/use-realtime';
import { getCoverImageUrl } from '@/lib/storage-urls';

const { width } = Dimensions.get('window');
const FEATURED_CARD_WIDTH = width - spacing.lg * 2;

interface Event {
  id: string;
  name: string;
  coverImageUrl: string | null;
  eventDate: string;
  location: string | null;
  photoCount: number;
}

type FilterType = 'all' | 'recent' | 'photos';

export default function MyEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const loadEvents = async () => {
    try {
      // Load events user has joined
      const { data: joinedEvents, error: joinedError } = await supabase
        .from('event_attendees')
        .select(`
          event:event_id (
            id,
            name,
            cover_image_url,
            event_date,
            location
          )
        `)
        .eq('attendee_id', profile?.id)
        .order('created_at', { ascending: false });

      // Load publicly listed events
      const { data: publicEvents, error: publicError } = await supabase
        .from('events')
        .select('id, name, cover_image_url, event_date, location')
        .eq('is_publicly_listed', true)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      const joinedEventsList = (joinedEvents || []).map((item: any) => ({
        id: item.event?.id,
        name: item.event?.name,
        coverImageUrl: item.event?.cover_image_url
          ? getCoverImageUrl(item.event.cover_image_url)
          : null,
        eventDate: item.event?.event_date,
        location: item.event?.location,
        photoCount: 0,
      }));

      const publicEventsList = (publicEvents || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        coverImageUrl: item.cover_image_url
          ? getCoverImageUrl(item.cover_image_url)
          : null,
        eventDate: item.event_date,
        location: item.location,
        photoCount: 0,
      }));

      // Combine and deduplicate by event ID
      const allEventsMap = new Map<string, Event>();
      [...joinedEventsList, ...publicEventsList].forEach(event => {
        if (event.id && !allEventsMap.has(event.id)) {
          allEventsMap.set(event.id, event);
        }
      });

      const mergedEvents = Array.from(allEventsMap.values());
      mergedEvents.forEach((event) => {
        if (event.coverImageUrl) {
          Image.prefetch(event.coverImageUrl);
        }
      });
      const eventsWithCounts = await Promise.all(
        mergedEvents.map(async (event) => {
          if (!event.id) return event;
          const { count } = await supabase
            .from('photo_drop_matches')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', event.id)
            .eq('attendee_id', profile?.id);
          return {
            ...event,
            photoCount: count || 0,
          };
        })
      );

      setEvents(eventsWithCounts);

      if (joinedError) {
        console.error('Error loading joined events:', joinedError);
      }
      if (publicError) {
        console.error('Error loading public events:', publicError);
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
  }, []);

  // Subscribe to real-time updates for events
  useRealtimeSubscription({
    table: 'events',
    onChange: () => {
      loadEvents();
    },
  });

  useRealtimeSubscription({
    table: 'photo_drop_matches',
    filter: profile?.id ? `attendee_id=eq.${profile.id}` : undefined,
    onChange: () => {
      loadEvents();
    },
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEvents();
  };

  const filteredEvents = events.filter((event) => {
    const matchesSearch = event.name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    
    if (activeFilter === 'recent') {
      const eventDate = new Date(event.eventDate);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return eventDate >= thirtyDaysAgo;
    }
    if (activeFilter === 'photos') {
      return event.photoCount > 0;
    }
    return true;
  });

  const featuredEvent = events[0];

  const renderEventCard = useCallback(({ item }: { item: Event }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => router.push(`/event/${item.id}`)}
      activeOpacity={0.7}
    >
      {item.coverImageUrl ? (
        <Image
          source={{ uri: item.coverImageUrl }}
          style={styles.eventImage}
        />
      ) : (
        <View style={[styles.eventImage, styles.eventImagePlaceholder]}>
          <ImageIcon size={28} color={colors.secondary} />
        </View>
      )}
      <View style={styles.eventInfo}>
        <Text style={styles.eventName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.eventMetaRow}>
          <View style={styles.eventMeta}>
            <Calendar size={12} color={colors.secondary} />
            <Text style={styles.eventMetaText}>
              {new Date(item.eventDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
          {item.location && (
            <View style={styles.eventMeta}>
              <MapPin size={12} color={colors.secondary} />
              <Text style={styles.eventMetaText} numberOfLines={1}>
                {item.location.split(',')[0]}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  ), [router]);

  const ListHeader = () => (
    <>
      {/* Featured Event */}
      {featuredEvent && (
        <View style={styles.featuredSection}>
          <View style={styles.sectionHeader}>
            <Gift size={16} color={colors.accent} />
            <Text style={styles.sectionTitle}>Most Recent</Text>
          </View>
          <TouchableOpacity
            style={styles.featuredCard}
            onPress={() => router.push(`/event/${featuredEvent.id}`)}
            activeOpacity={0.9}
          >
            {featuredEvent.coverImageUrl ? (
              <Image
                source={{ uri: featuredEvent.coverImageUrl }}
                style={styles.featuredImage}
              />
            ) : (
              <View style={[styles.featuredImage, styles.featuredPlaceholder]}>
                <ImageIcon size={48} color={colors.secondary} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.featuredOverlay}
            />
            <View style={styles.featuredContent}>
              <Text style={styles.featuredName} numberOfLines={2}>
                {featuredEvent.name}
              </Text>
              <View style={styles.featuredMeta}>
                <View style={styles.featuredMetaItem}>
                  <Calendar size={14} color="#fff" />
                  <Text style={styles.featuredMetaText}>
                    {new Date(featuredEvent.eventDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                {featuredEvent.location && (
                  <View style={styles.featuredMetaItem}>
                    <MapPin size={14} color="#fff" />
                    <Text style={styles.featuredMetaText} numberOfLines={1}>
                      {featuredEvent.location}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Chips */}
      <View style={styles.filtersContainer}>
        <View style={styles.sectionHeader}>
          <Filter size={16} color={colors.secondary} />
          <Text style={styles.sectionTitle}>All Events</Text>
          <Text style={styles.eventCount}>{filteredEvents.length}</Text>
        </View>
        <View style={styles.filterChips}>
          {(['all', 'recent', 'photos'] as FilterType[]).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                activeFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(filter)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter === 'all' ? 'All' : filter === 'recent' ? 'Last 30 Days' : 'With Photos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
      <Text style={styles.emptyTitle}>No events yet</Text>
      <Text style={styles.emptyDescription}>
        Scan your face at events to start building your photo collection
      </Text>
      <Button
        onPress={() => router.push('/(attendee)/scan')}
        fullWidth
        style={{ marginTop: spacing.lg }}
      >
        Find My Photos
      </Button>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Events</Text>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={18} color={colors.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            placeholderTextColor={colors.secondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={colors.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filteredEvents.slice(1)} // Skip first as it's featured
        renderItem={renderEventCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
      />
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
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.foreground,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  featuredSection: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  eventCount: {
    fontSize: 14,
    color: colors.secondary,
  },
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: 200,
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
  featuredContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
  },
  featuredName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: spacing.sm,
  },
  featuredMeta: {
    gap: spacing.xs,
  },
  featuredMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featuredMetaText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  filtersContainer: {
    marginBottom: spacing.md,
  },
  filterChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.muted,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterChipActive: {
    backgroundColor: colors.accent + '15',
    borderColor: colors.accent,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondary,
  },
  filterChipTextActive: {
    color: colors.accent,
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
  eventImage: {
    width: '100%',
    height: 100,
  },
  eventImagePlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    padding: spacing.md,
  },
  eventName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
    lineHeight: 18,
  },
  eventMetaRow: {
    gap: 4,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventMetaText: {
    fontSize: 11,
    color: colors.secondary,
    flex: 1,
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

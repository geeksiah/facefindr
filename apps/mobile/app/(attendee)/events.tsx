/**
 * My Events Screen
 * 
 * Shows events the user has attended/scanned at.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Image,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search, Calendar, MapPin, Image as ImageIcon } from 'lucide-react-native';

import { Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface Event {
  id: string;
  name: string;
  coverImageUrl: string | null;
  eventDate: string;
  location: string | null;
  photoCount: number;
}

export default function MyEventsScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadEvents = async () => {
    try {
      // Get events where user has photos
      const { data, error } = await supabase
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

      if (!error && data) {
        setEvents(
          data.map((item: any) => ({
            id: item.event?.id,
            name: item.event?.name,
            coverImageUrl: item.event?.cover_image_url,
            eventDate: item.event?.event_date,
            location: item.event?.location,
            photoCount: 0, // Would need a separate count query
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
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEvents();
  };

  const filteredEvents = events.filter((event) =>
    event.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderEventCard = ({ item }: { item: Event }) => (
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
          <ImageIcon size={32} color={colors.secondary} />
        </View>
      )}
      <View style={styles.eventInfo}>
        <Text style={styles.eventName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.eventMeta}>
          <Calendar size={14} color={colors.secondary} />
          <Text style={styles.eventMetaText}>
            {new Date(item.eventDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
        {item.location && (
          <View style={styles.eventMeta}>
            <MapPin size={14} color={colors.secondary} />
            <Text style={styles.eventMetaText} numberOfLines={1}>
              {item.location}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Events</Text>
        <View style={styles.searchContainer}>
          <Search size={20} color={colors.secondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events..."
            placeholderTextColor={colors.secondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredEvents}
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
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyDescription}>
                Events you scan photos at will appear here
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
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
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  eventImage: {
    width: 100,
    height: 100,
  },
  eventImagePlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
  },
  eventName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
  },
  eventMetaText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['2xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
  },
  emptyDescription: {
    fontSize: fontSize.base,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
});

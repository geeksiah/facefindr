/**
 * Photographer Events Screen
 * 
 * List and manage events.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Plus,
  Search,
  Calendar,
  Image as ImageIcon,
  MoreHorizontal,
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
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: colors.muted, text: colors.secondary },
  active: { bg: colors.success + '20', text: colors.success },
  closed: { bg: colors.warning + '20', text: colors.warning },
  archived: { bg: colors.destructive + '20', text: colors.destructive },
};

export default function EventsScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'closed'>('all');

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
            photoCount: 0, // Would need separate count
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

  const renderEventCard = ({ item }: { item: Event }) => {
    const statusStyle = STATUS_COLORS[item.status];

    return (
      <TouchableOpacity
        onPress={() => router.push(`/event/${item.id}`)}
        activeOpacity={0.7}
      >
        <Card style={styles.eventCard} padding="none">
          {/* Cover Image */}
          {item.coverImageUrl ? (
            <Image
              source={{ uri: item.coverImageUrl }}
              style={styles.coverImage}
            />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <ImageIcon size={32} color={colors.secondary} />
            </View>
          )}

          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusStyle.bg },
            ]}
          >
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>

          {/* Event Info */}
          <View style={styles.eventInfo}>
            <Text style={styles.eventName} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.eventMeta}>
              <Calendar size={14} color={colors.secondary} />
              <Text style={styles.eventDate}>
                {new Date(item.eventDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <View style={styles.photoBadge}>
                <ImageIcon size={12} color={colors.secondary} />
                <Text style={styles.photoCount}>{item.photoCount}</Text>
              </View>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Events</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/create-event')}
        >
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        {(['all', 'active', 'draft', 'closed'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterButton,
              filter === f && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Events List */}
      <FlatList
        data={events}
        renderItem={renderEventCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
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
              <Calendar size={48} color={colors.secondary} />
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyDescription}>
                Create your first event to start uploading photos
              </Text>
              <Button
                onPress={() => router.push('/create-event')}
                style={{ marginTop: spacing.lg }}
              >
                Create Event
              </Button>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
  },
  filterButtonActive: {
    backgroundColor: colors.foreground,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.secondary,
  },
  filterTextActive: {
    color: colors.background,
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  columnWrapper: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  eventCard: {
    flex: 1,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: 120,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  eventInfo: {
    padding: spacing.sm,
  },
  eventName: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  eventDate: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    flex: 1,
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  photoCount: {
    fontSize: fontSize.xs,
    color: colors.secondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing['2xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.md,
  },
  emptyDescription: {
    fontSize: fontSize.base,
    color: colors.secondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});

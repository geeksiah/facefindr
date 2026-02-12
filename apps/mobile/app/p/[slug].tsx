/**
 * Public Photographer Profile Screen
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  TouchableOpacity,
  FlatList,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  Share2,
  Camera,
  Calendar,
  MapPin,
  Users,
  Heart,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EVENT_CARD_WIDTH = SCREEN_WIDTH * 0.7;

interface PhotographerProfile {
  id: string;
  displayName: string;
  faceTag: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  coverPhotoUrl: string | null;
  eventCount: number;
  photoCount: number;
  followerCount: number;
  isFollowing: boolean;
}

interface Event {
  id: string;
  name: string;
  coverImageUrl: string | null;
  eventDate: string;
  photoCount: number;
}

export default function PhotographerProfileScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { profile: currentUser } = useAuthStore();

  const [photographer, setPhotographer] = useState<PhotographerProfile | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [slug]);

  const loadProfile = async () => {
    try {
      // Load photographer profile
      const { data: photographerData } = await supabase
        .from('photographers')
        .select('*')
        .or(`id.eq.${slug},face_tag.eq.@${slug}`)
        .single();

      if (!photographerData) {
        return;
      }

      // Load counts
      const [eventsRes, followersRes, followingRes] = await Promise.all([
        supabase
          .from('events')
          .select('id', { count: 'exact' })
          .eq('photographer_id', photographerData.id)
          .eq('status', 'active'),
        supabase
          .from('photographer_follows')
          .select('id', { count: 'exact' })
          .eq('photographer_id', photographerData.id),
        currentUser?.id
          ? supabase
              .from('photographer_follows')
              .select('id')
              .eq('photographer_id', photographerData.id)
              .eq('follower_id', currentUser.id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      setPhotographer({
        id: photographerData.id,
        displayName: photographerData.display_name,
        faceTag: photographerData.face_tag,
        bio: photographerData.bio,
        profilePhotoUrl: photographerData.profile_photo_url,
        coverPhotoUrl: photographerData.cover_photo_url,
        eventCount: eventsRes.count || 0,
        photoCount: 0,
        followerCount: followersRes.count || 0,
        isFollowing: !!followingRes.data,
      });
      setIsFollowing(!!followingRes.data);

      // Load recent events
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, name, cover_image_url, event_date')
        .eq('photographer_id', photographerData.id)
        .eq('status', 'active')
        .order('event_date', { ascending: false })
        .limit(10);

      if (eventsData) {
        setEvents(
          eventsData.map((e: any) => ({
            id: e.id,
            name: e.name,
            coverImageUrl: e.cover_image_url,
            eventDate: e.event_date,
            photoCount: 0,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading photographer profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUser?.id || !photographer) return;

    setIsFollowing(!isFollowing);

    try {
      if (isFollowing) {
        await supabase
          .from('photographer_follows')
          .delete()
          .eq('photographer_id', photographer.id)
          .eq('follower_id', currentUser.id);
      } else {
        await supabase.from('photographer_follows').insert({
          photographer_id: photographer.id,
          follower_id: currentUser.id,
        });
      }
    } catch (err) {
      console.error('Follow error:', err);
      setIsFollowing(!isFollowing); // Revert
    }
  };

  const renderEventCard = ({ item }: { item: Event }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => router.push(`/event/${item.id}`)}
    >
      {item.coverImageUrl ? (
        <Image source={{ uri: item.coverImageUrl }} style={styles.eventImage} />
      ) : (
        <View style={[styles.eventImage, styles.eventImagePlaceholder]}>
          <Camera size={32} color={colors.secondary} />
        </View>
      )}
      <View style={styles.eventInfo}>
        <Text style={styles.eventName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.eventDate}>
          {new Date(item.eventDate).toLocaleDateString()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading || !photographer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerTransparent: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <ArrowLeft size={24} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity style={styles.headerButton}>
              <Share2 size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView style={styles.container}>
        {/* Cover Image */}
        {photographer.coverPhotoUrl ? (
          <Image
            source={{ uri: photographer.coverPhotoUrl }}
            style={styles.coverImage}
          />
        ) : (
          <View style={[styles.coverImage, styles.coverPlaceholder]} />
        )}

        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {photographer.profilePhotoUrl ? (
              <Image
                source={{ uri: photographer.profilePhotoUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Camera size={32} color={colors.secondary} />
              </View>
            )}
          </View>

          <Text style={styles.displayName}>{photographer.displayName}</Text>
          <Text style={styles.faceTag}>{photographer.faceTag}</Text>

          {photographer.bio && (
            <Text style={styles.bio}>{photographer.bio}</Text>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{photographer.eventCount}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{photographer.followerCount}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
          </View>

          {/* Follow Button */}
          {currentUser?.id !== photographer.id && (
            <Button
              onPress={handleFollow}
              variant={isFollowing ? 'outline' : 'primary'}
              fullWidth
            >
              <Heart
                size={18}
                color={isFollowing ? colors.accent : '#fff'}
                fill={isFollowing ? colors.accent : 'transparent'}
              />
              {isFollowing ? ' Following' : ' Follow'}
            </Button>
          )}
        </View>

        {/* Events Section */}
        {events.length > 0 && (
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>Recent Events</Text>
            <FlatList
              data={events}
              renderItem={renderEventCard}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.eventsList}
            />
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: 180,
  },
  coverPlaceholder: {
    backgroundColor: colors.accent,
  },
  profileSection: {
    alignItems: 'center',
    padding: spacing.lg,
    marginTop: -50,
  },
  avatarContainer: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: colors.background,
  },
  avatarPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
  },
  faceTag: {
    fontSize: fontSize.base,
    color: colors.accent,
    fontFamily: 'monospace',
    marginTop: spacing.xs,
  },
  bio: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginVertical: spacing.lg,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  eventsSection: {
    paddingVertical: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  eventsList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  eventCard: {
    width: EVENT_CARD_WIDTH,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventImage: {
    width: '100%',
    height: 140,
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
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  eventDate: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
});

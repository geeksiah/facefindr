/**
 * Followers List Screen
 * 
 * Shows list of users following the photographer.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  User,
  ChevronRight,
  Users,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';
import { openProfile } from '@/lib/open-profile';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = getApiBaseUrl();

interface FollowerItem {
  id: string;
  follower_id: string;
  follower_type?: 'attendee' | 'creator' | 'photographer';
  created_at: string;
  attendees?: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
  } | null;
  photographers?: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    public_profile_slug?: string | null;
  } | null;
}

export default function FollowersScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuthStore();
  
  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [total, setTotal] = useState(0);

  const loadFollowers = useCallback(async () => {
    if (!profile?.id) return;
    
    try {
      const isAttendee = profile.userType === 'attendee';
      const query = isAttendee
        ? `type=followers&targetType=attendee&targetId=${profile.id}`
        : `type=followers&photographerId=${profile.id}`;

      const response = await fetch(
        `${API_URL}/api/social/follow?${query}`,
        {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        }
      );
      if (response.ok) {
        const data = await response.json();
        setFollowers(data.followers || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error loading followers:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [profile?.id, session?.access_token]);

  useEffect(() => {
    loadFollowers();
  }, [loadFollowers]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadFollowers();
  };

  const goBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      if (profile?.userType === 'attendee') {
        router.replace('/(attendee)/profile' as any);
      } else {
        router.replace('/(creator)/profile' as any);
      }
    }
  };

  const renderItem = ({ item }: { item: FollowerItem }) => {
    const follower = item.attendees || item.photographers;
    if (!follower) return null;
    
    return (
      <Pressable
        style={({ pressed }) => [
          styles.itemCard,
          pressed && styles.itemPressed,
        ]}
        onPress={() =>
          // Prefer shell when possible; openProfile will choose shell vs public
          openProfile(router, item.follower_type === 'creator' || item.follower_type === 'photographer' ? (item.photographers || follower) : follower)
        }
      >
        {follower.profile_photo_url ? (
          <Image source={{ uri: follower.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <User size={24} color={colors.secondary} />
          </View>
        )}
        <View style={styles.itemInfo}>
          <Text style={styles.itemName} numberOfLines={1}>{follower.display_name}</Text>
          <Text style={styles.itemFaceTag}>{follower.face_tag}</Text>
          <Text style={styles.itemDate}>
            Following since {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <ChevronRight size={20} color={colors.secondary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <ArrowLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Followers</Text>
          <Text style={styles.headerSubtitle}>{total} follower{total !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : followers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Users size={48} color={colors.secondary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>No followers yet</Text>
          <Text style={styles.emptyDescription}>
            Share your FaceTag and profile to gain followers who want to see your work
          </Text>
        </View>
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
        />
      )}
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
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.muted,
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
  list: {
    padding: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemPressed: {
    backgroundColor: colors.muted,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  itemFaceTag: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  itemDate: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
  },
});



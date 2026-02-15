/**
 * Following List Screen
 * 
 * Shows list of photographers the user is following.
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
  Alert,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Camera,
  UserMinus,
  Bell,
  BellOff,
  ChevronRight,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

interface FollowingItem {
  id: string;
  following_id: string;
  notify_new_event: boolean;
  notify_photo_drop: boolean;
  created_at: string;
  photographers: {
    id: string;
    display_name: string;
    face_tag: string;
    profile_photo_url: string | null;
    bio: string | null;
    public_profile_slug: string | null;
  };
}

export default function FollowingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  
  const [following, setFollowing] = useState<FollowingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [total, setTotal] = useState(0);

  const loadFollowing = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/social/follow?type=following`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
      if (response.ok) {
        const data = await response.json();
        setFollowing(data.following || []);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Error loading following:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadFollowing();
  }, [loadFollowing]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadFollowing();
  };

  const goBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.replace('/(attendee)/profile');
    }
  };

  const handleUnfollow = (photographerId: string, name: string) => {
    Alert.alert(
      'Unfollow',
      `Are you sure you want to unfollow ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/social/follow?photographerId=${photographerId}`, {
                method: 'DELETE',
                headers: session?.access_token
                  ? { Authorization: `Bearer ${session.access_token}` }
                  : {},
              });
              setFollowing(prev => prev.filter(f => f.following_id !== photographerId));
              setTotal(prev => prev - 1);
            } catch (error) {
              console.error('Unfollow error:', error);
            }
          },
        },
      ]
    );
  };

  const toggleNotifications = async (followId: string, photographerId: string, field: 'notify_new_event' | 'notify_photo_drop') => {
    const item = following.find(f => f.id === followId);
    if (!item) return;
    
    const newValue = !item[field];
    
    // Optimistic update
    setFollowing(prev => prev.map(f => 
      f.id === followId ? { ...f, [field]: newValue } : f
    ));

    try {
      await fetch(`${API_URL}/api/social/follow/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          photographerId,
          [field === 'notify_new_event' ? 'notifyNewEvent' : 'notifyPhotoDrop']: newValue,
        }),
      });
    } catch (error) {
      // Revert on error
      setFollowing(prev => prev.map(f => 
        f.id === followId ? { ...f, [field]: !newValue } : f
      ));
      console.error('Toggle notifications error:', error);
    }
  };

  const renderItem = ({ item }: { item: FollowingItem }) => {
    const photographer = item.photographers;
    
    return (
      <View style={styles.itemContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.itemContent,
            pressed && styles.itemPressed,
          ]}
          onPress={() => router.push(`/p/${photographer.public_profile_slug || photographer.id}`)}
        >
          {photographer.profile_photo_url ? (
            <Image source={{ uri: photographer.profile_photo_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Camera size={24} color={colors.secondary} />
            </View>
          )}
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{photographer.display_name}</Text>
            <Text style={styles.itemFaceTag}>{photographer.face_tag}</Text>
            {photographer.bio && (
              <Text style={styles.itemBio} numberOfLines={1}>{photographer.bio}</Text>
            )}
          </View>
          <ChevronRight size={20} color={colors.secondary} />
        </Pressable>

        <View style={styles.itemActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              item.notify_new_event && styles.actionButtonActive,
            ]}
            onPress={() => toggleNotifications(item.id, item.following_id, 'notify_new_event')}
          >
            {item.notify_new_event ? (
              <Bell size={16} color={colors.accent} />
            ) : (
              <BellOff size={16} color={colors.secondary} />
            )}
            <Text style={[
              styles.actionButtonText,
              item.notify_new_event && styles.actionButtonTextActive,
            ]}>
              Events
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionButton,
              item.notify_photo_drop && styles.actionButtonActive,
            ]}
            onPress={() => toggleNotifications(item.id, item.following_id, 'notify_photo_drop')}
          >
            {item.notify_photo_drop ? (
              <Bell size={16} color={colors.accent} />
            ) : (
              <BellOff size={16} color={colors.secondary} />
            )}
            <Text style={[
              styles.actionButtonText,
              item.notify_photo_drop && styles.actionButtonTextActive,
            ]}>
              Photos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.unfollowButton}
            onPress={() => handleUnfollow(item.following_id, photographer.display_name)}
          >
            <UserMinus size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
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
          <Text style={styles.headerTitle}>Following</Text>
          <Text style={styles.headerSubtitle}>{total} photographer{total !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : following.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIcon}>
            <Camera size={48} color={colors.secondary} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>Not following anyone</Text>
          <Text style={styles.emptyDescription}>
            Follow photographers to get updates about their events and new photos
          </Text>
          <TouchableOpacity
            style={styles.searchButton}
            onPress={() => router.push('/search')}
          >
            <Text style={styles.searchButtonText}>Find Photographers</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={following}
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
    marginBottom: spacing.lg,
  },
  searchButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
  },
  searchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  list: {
    padding: spacing.md,
  },
  itemContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
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
  itemBio: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.muted,
    gap: 6,
  },
  actionButtonActive: {
    backgroundColor: colors.accent + '15',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.secondary,
  },
  actionButtonTextActive: {
    color: colors.accent,
  },
  unfollowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ef444415',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

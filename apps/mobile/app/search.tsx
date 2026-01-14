/**
 * Search Screen
 * 
 * Search for photographers and users by FaceTag or name.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  Pressable,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  ArrowLeft,
  User,
  Camera,
  X,
  UserPlus,
  UserCheck,
  AtSign,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { useAuthStore } from '@/stores/auth-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

interface SearchResult {
  id: string;
  display_name: string;
  face_tag: string;
  profile_photo_url: string | null;
  bio?: string;
  follower_count?: number;
  public_profile_slug?: string;
  is_public_profile?: boolean;
}

interface SearchResults {
  photographers: SearchResult[];
  users: SearchResult[];
}

type SearchType = 'all' | 'photographers' | 'users';

export default function SearchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const inputRef = useRef<TextInput>(null);
  
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [results, setResults] = useState<SearchResults>({ photographers: [], users: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Load following list
  useEffect(() => {
    loadFollowingList();
  }, []);

  const loadFollowingList = async () => {
    if (!profile?.id) return;
    try {
      const response = await fetch(`${API_URL}/api/social/follow?type=following`);
      if (response.ok) {
        const data = await response.json();
        const ids = new Set(data.following?.map((f: any) => f.following_id) || []);
        setFollowingIds(ids);
      }
    } catch (error) {
      console.log('Error loading following list:', error);
    }
  };

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults({ photographers: [], users: [] });
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    try {
      const response = await fetch(
        `${API_URL}/api/social/search?q=${encodeURIComponent(searchQuery)}&type=${searchType}&limit=30`
      );
      
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      } else {
        setResults({ photographers: [], users: [] });
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults({ photographers: [], users: [] });
    } finally {
      setIsLoading(false);
    }
  }, [searchType]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const goBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.replace('/(attendee)');
    }
  };

  const handleFollow = async (photographerId: string) => {
    try {
      const isCurrentlyFollowing = followingIds.has(photographerId);
      
      if (isCurrentlyFollowing) {
        // Unfollow
        await fetch(`${API_URL}/api/social/follow?photographerId=${photographerId}`, {
          method: 'DELETE',
        });
        setFollowingIds(prev => {
          const next = new Set(prev);
          next.delete(photographerId);
          return next;
        });
      } else {
        // Follow
        await fetch(`${API_URL}/api/social/follow`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photographerId }),
        });
        setFollowingIds(prev => new Set(prev).add(photographerId));
      }
    } catch (error) {
      console.error('Follow/unfollow error:', error);
    }
  };

  const renderPhotographer = ({ item }: { item: SearchResult }) => {
    const isFollowing = followingIds.has(item.id);
    
    return (
      <Pressable
        style={({ pressed }) => [
          styles.resultCard,
          pressed && styles.resultCardPressed,
        ]}
        onPress={() => router.push(`/p/${item.public_profile_slug || item.id}`)}
      >
        {item.profile_photo_url ? (
          <Image source={{ uri: item.profile_photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Camera size={24} color={colors.secondary} />
          </View>
        )}
        <View style={styles.resultInfo}>
          <Text style={styles.resultName} numberOfLines={1}>{item.display_name}</Text>
          {item.face_tag && (
            <Text style={styles.resultFaceTag}>{item.face_tag}</Text>
          )}
          {item.bio && (
            <Text style={styles.resultBio} numberOfLines={1}>{item.bio}</Text>
          )}
          {item.follower_count !== undefined && (
            <Text style={styles.resultStats}>
              {item.follower_count} follower{item.follower_count !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
        {item.id !== profile?.id && (
          <TouchableOpacity
            style={[
              styles.followButton,
              isFollowing && styles.followButtonActive,
            ]}
            onPress={() => handleFollow(item.id)}
          >
            {isFollowing ? (
              <UserCheck size={18} color={colors.accent} />
            ) : (
              <UserPlus size={18} color="#fff" />
            )}
          </TouchableOpacity>
        )}
      </Pressable>
    );
  };

  const renderUser = ({ item }: { item: SearchResult }) => (
    <Pressable
      style={({ pressed }) => [
        styles.resultCard,
        pressed && styles.resultCardPressed,
      ]}
      onPress={() => router.push(`/u/${item.public_profile_slug || item.id}`)}
    >
      {item.profile_photo_url ? (
        <Image source={{ uri: item.profile_photo_url }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <User size={24} color={colors.secondary} />
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultName} numberOfLines={1}>{item.display_name}</Text>
        {item.face_tag && (
          <Text style={styles.resultFaceTag}>{item.face_tag}</Text>
        )}
      </View>
    </Pressable>
  );

  const totalResults = results.photographers.length + results.users.length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Safe area background for status bar */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <ArrowLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        
        <View style={styles.searchInputContainer}>
          <Search size={20} color={colors.secondary} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search by name or @FaceTag"
            placeholderTextColor={colors.secondary}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={20} color={colors.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['all', 'photographers', 'users'] as SearchType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterTab, searchType === type && styles.filterTabActive]}
            onPress={() => setSearchType(type)}
          >
            <Text style={[styles.filterTabText, searchType === type && styles.filterTabTextActive]}>
              {type === 'all' ? 'All' : type === 'photographers' ? 'Photographers' : 'Users'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Results */}
      {isLoading ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        </TouchableWithoutFeedback>
      ) : !hasSearched ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <AtSign size={48} color={colors.secondary} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>Search FaceFindr</Text>
            <Text style={styles.emptyDescription}>
              Find photographers and users by their name or FaceTag
            </Text>
          </View>
        </TouchableWithoutFeedback>
      ) : totalResults === 0 ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptyDescription}>
              Try a different search term or check the spelling
            </Text>
          </View>
        </TouchableWithoutFeedback>
      ) : (
        <FlatList
          data={[
            ...(searchType !== 'users' ? results.photographers.map(p => ({ ...p, type: 'photographer' })) : []),
            ...(searchType !== 'photographers' ? results.users.map(u => ({ ...u, type: 'user' })) : []),
          ]}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={({ item }) => 
            item.type === 'photographer' 
              ? renderPhotographer({ item }) 
              : renderUser({ item })
          }
          contentContainerStyle={styles.resultsList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          ListHeaderComponent={
            <Text style={styles.resultsCount}>
              {totalResults} result{totalResults !== 1 ? 's' : ''}
            </Text>
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
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.muted,
  },
  filterTabActive: {
    backgroundColor: colors.accent,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.secondary,
  },
  filterTabTextActive: {
    color: '#fff',
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
  resultsList: {
    padding: spacing.md,
  },
  resultsCount: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: spacing.md,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  resultCardPressed: {
    backgroundColor: colors.muted,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  resultFaceTag: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  resultBio: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  resultStats: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
  },
  followButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  followButtonActive: {
    backgroundColor: colors.accent + '20',
    borderWidth: 1,
    borderColor: colors.accent,
  },
});

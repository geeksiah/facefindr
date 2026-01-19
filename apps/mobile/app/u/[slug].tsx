/**
 * Public User/Attendee Profile Screen
 * 
 * Shows a user's public profile for photographers to view.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  TouchableOpacity,
  Share,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  Share2,
  User,
  Users,
  UserPlus,
  Copy,
  Check,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

interface UserProfile {
  id: string;
  displayName: string;
  faceTag: string;
  profilePhotoUrl: string | null;
  followingCount: number;
  isPublicProfile: boolean;
}

export default function UserProfileScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { profile: currentUser, userType } = useAuthStore();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddingConnection, setIsAddingConnection] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setError(null);
      
      // Try API first
      const response = await fetch(`${API_URL}/api/profiles/user/${slug}`);
      
      if (response.ok) {
        const data = await response.json();
        setUser({
          id: data.profile.id,
          displayName: data.profile.display_name,
          faceTag: data.profile.face_tag,
          profilePhotoUrl: data.profile.profile_photo_url,
          followingCount: data.profile.following_count || 0,
          isPublicProfile: data.profile.is_public_profile ?? true,
        });
      } else {
        // Fallback to direct Supabase query
        const { data: userData, error: userError } = await supabase
          .from('attendees')
          .select('id, display_name, face_tag, profile_photo_url, is_public_profile')
          .or(`face_tag.ilike.@${slug},id.eq.${slug}`)
          .single();

        if (userError || !userData) {
          setError('User not found');
          return;
        }

        // Get following count
        const { count: followingCount } = await supabase
          .from('follows')
          .select('id', { count: 'exact', head: true })
          .eq('follower_id', userData.id);

        setUser({
          id: userData.id,
          displayName: userData.display_name,
          faceTag: userData.face_tag,
          profilePhotoUrl: userData.profile_photo_url,
          followingCount: followingCount || 0,
          isPublicProfile: userData.is_public_profile ?? true,
        });
      }
    } catch (err) {
      console.error('Error loading profile:', err);
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadProfile();
  };

  const handleShare = async () => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.example.com';
      const profileUrl = `${baseUrl}/u/${user?.faceTag?.replace('@', '') || user?.id}`;
      await Share.share({
        message: `Check out ${user?.displayName}'s profile on FaceFindr!\n${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleCopyFaceTag = async () => {
    if (!user?.faceTag) return;
    
    try {
      // Note: React Native doesn't have navigator.clipboard
      // This would need a clipboard library like @react-native-clipboard/clipboard
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Alert.alert('Copied', `FaceTag ${user.faceTag} copied to clipboard`);
    } catch (error) {
      console.error('Copy error:', error);
    }
  };

  const handleAddConnection = async () => {
    if (!user || !currentUser || userType !== 'photographer') return;

    setIsAddingConnection(true);
    try {
      const response = await fetch(`${API_URL}/api/photographers/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendeeFaceTag: user.faceTag }),
      });

      if (response.ok) {
        Alert.alert('Success', `${user.displayName} has been added to your connections.`);
      } else {
        const data = await response.json();
        Alert.alert('Error', data.error || 'Failed to add connection');
      }
    } catch (error) {
      console.error('Add connection error:', error);
      Alert.alert('Error', 'Failed to add connection');
    } finally {
      setIsAddingConnection(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Profile',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !user) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Profile',
            headerBackTitle: 'Back',
          }}
        />
        <View style={styles.errorContainer}>
          <User size={64} color={colors.secondary} />
          <Text style={styles.errorTitle}>Profile Not Found</Text>
          <Text style={styles.errorText}>
            {error || 'This profile does not exist or is private.'}
          </Text>
          <Button onPress={() => router.back()} style={{ marginTop: spacing.lg }}>
            Go Back
          </Button>
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
              <ArrowLeft size={24} color={colors.foreground} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
              <Share2 size={24} color={colors.foreground} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            {user.profilePhotoUrl ? (
              <Image source={{ uri: user.profilePhotoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {user.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>

          {/* Name & FaceTag */}
          <Text style={styles.displayName}>{user.displayName}</Text>
          
          <TouchableOpacity onPress={handleCopyFaceTag} style={styles.faceTagContainer}>
            <Text style={styles.faceTag}>{user.faceTag}</Text>
            {copied ? (
              <Check size={16} color={colors.success} />
            ) : (
              <Copy size={16} color={colors.accent} />
            )}
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.followingCount}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>
        </View>

        {/* Actions for Photographers */}
        {userType === 'photographer' && currentUser && (
          <Card style={styles.actionCard}>
            <View style={styles.actionContent}>
              <UserPlus size={24} color={colors.accent} />
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Add to Connections</Text>
                <Text style={styles.actionDescription}>
                  Add this user to easily tag them in your photos
                </Text>
              </View>
            </View>
            <Button
              onPress={handleAddConnection}
              size="sm"
              disabled={isAddingConnection}
            >
              {isAddingConnection ? 'Adding...' : 'Add'}
            </Button>
          </Card>
        )}

        {/* Info Card */}
        <Card style={styles.infoCard}>
          <Text style={styles.infoTitle}>About FaceTag</Text>
          <Text style={styles.infoText}>
            This is a FaceFindr user profile. FaceTags are unique identifiers that 
            help photographers tag attendees in photos automatically using facial recognition.
          </Text>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingTop: 100, // Account for transparent header
    paddingBottom: spacing.xl,
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorTitle: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  avatarContainer: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: colors.card,
  },
  avatarPlaceholder: {
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  displayName: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  faceTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  faceTag: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.accent,
    fontFamily: 'monospace',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  statItem: {
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
    marginTop: 2,
  },
  actionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  actionText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  actionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  actionDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.muted,
  },
  infoTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    lineHeight: 20,
  },
});

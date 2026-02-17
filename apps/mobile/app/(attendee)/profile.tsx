/**
 * Attendee Profile Screen
 * 
 * Shows user profile with FaceTag, stats, and settings.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Platform,
  StatusBar,
  Share,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import {
  User,
  Copy,
  Share2,
  QrCode,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  ChevronRight,
  LogOut,
  Image as ImageIcon,
  Calendar,
  Check,
  Info,
  Archive,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';
import { alertMissingPublicAppUrl, buildPublicUrl } from '@/lib/runtime-config';

const API_URL = getApiBaseUrl();

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, session, signOut } = useAuthStore();
  const [copiedRecently, setCopiedRecently] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);

  // Load social counts
  useEffect(() => {
    const loadSocialCounts = async () => {
      try {
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }

        const [followingResponse, followersResponse] = await Promise.all([
          fetch(`${API_URL}/api/social/follow?type=following&includeAttendees=true`, { headers }),
          fetch(
            `${API_URL}/api/social/follow?type=followers&targetType=attendee&targetId=${profile?.id}`,
            { headers }
          ),
        ]);

        if (followingResponse.ok) {
          const data = await followingResponse.json();
          setFollowingCount(data.total || 0);
        }

        if (followersResponse.ok) {
          const data = await followersResponse.json();
          setFollowersCount(data.total || 0);
        }
      } catch (error) {
        console.log('Error loading social counts:', error);
      }
    };
    if (profile?.id) {
      loadSocialCounts();
    }
  }, [profile?.id, session?.access_token]);

  const profileUrl = buildPublicUrl(`/u/${profile?.faceTag?.replace('@', '')}`);

  const handleCopyFaceTag = async () => {
    if (profile?.faceTag) {
      await Clipboard.setStringAsync(profile.faceTag);
      setCopiedRecently(true);
      setTimeout(() => setCopiedRecently(false), 2000);
    }
  };

  const handleShare = async () => {
    if (!profileUrl) {
      alertMissingPublicAppUrl();
      return;
    }

    try {
      await Share.share({
        message: `Connect with me on Ferchr!\n\nMy FaceTag: ${profile?.faceTag}\n${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: Archive,
      label: 'Photo Vault',
      color: colors.accent,
      onPress: () => router.push('/(attendee)/vault'),
    },
    {
      icon: Settings,
      label: 'Edit Profile',
      color: colors.foreground,
      onPress: () => router.push('/settings/profile'),
    },
    {
      icon: Bell,
      label: 'Notifications',
      color: colors.foreground,
      onPress: () => router.push('/settings/notifications'),
    },
    {
      icon: Shield,
      label: 'Privacy & Security',
      color: colors.foreground,
      onPress: () => router.push('/settings/privacy'),
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      color: colors.foreground,
      onPress: () => router.push('/settings/help'),
    },
    {
      icon: Info,
      label: 'About App',
      color: colors.foreground,
      onPress: () => router.push('/settings/about'),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Header with safe area background */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Avatar */}
          <Pressable
            style={({ pressed }) => [
              styles.avatarContainer,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/settings/profile')}
          >
            {profile?.profilePhotoUrl ? (
              <Image 
                source={{ uri: profile.profilePhotoUrl }} 
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <User size={40} color={colors.secondary} />
              </View>
            )}
          </Pressable>

          {/* Name & Email */}
          <Text style={styles.profileName}>
            {profile?.displayName || 'User'}
          </Text>
          <Text style={styles.profileEmail}>{profile?.email}</Text>

          {/* Social Stats */}
          <View style={styles.socialStatsRow}>
            <Pressable
              style={({ pressed }) => [
                styles.socialStatPill,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push('/social/following')}
            >
              <Text style={styles.followingCount}>{followingCount}</Text>
              <Text style={styles.followingLabel}>Following</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.socialStatPill,
                pressed && styles.pressed,
              ]}
              onPress={() => router.push('/social/followers')}
            >
              <Text style={styles.followingCount}>{followersCount}</Text>
              <Text style={styles.followingLabel}>Followers</Text>
            </Pressable>
          </View>

        </View>

        {/* FaceTag Card - Matching Creator Design */}
        {profile?.faceTag && (
          <View style={styles.faceTagCard}>
            <LinearGradient
              colors={[colors.accent + '10', colors.accent + '05']}
              style={styles.faceTagGradient}
            >
              <View style={styles.faceTagHeader}>
                <View style={styles.faceTagInfo}>
                  <Text style={styles.faceTagLabel}>Your FaceTag</Text>
                  <Text style={styles.faceTag}>{profile.faceTag}</Text>
                </View>
                <View style={styles.faceTagActions}>
                  <TouchableOpacity 
                    onPress={handleCopyFaceTag} 
                    style={styles.iconButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    {copiedRecently ? (
                      <Check size={16} color="#10b981" />
                    ) : (
                      <Copy size={16} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={handleShare} 
                    style={styles.iconButton}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Share2 size={16} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              </View>
              
              <Text style={styles.faceTagHint}>
                Share your FaceTag so photographers can find you at events
              </Text>

              <TouchableOpacity
                style={styles.qrButton}
                onPress={() => router.push('/profile/qr-code')}
                activeOpacity={0.8}
              >
                <QrCode size={18} color="#fff" />
                <Text style={styles.qrButtonText}>Show QR Code</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.accent + '15' }]}>
              <ImageIcon size={18} color={colors.accent} />
            </View>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#8b5cf615' }]}>
              <Calendar size={18} color="#8b5cf6" />
            </View>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Settings</Text>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
                index === menuItems.length - 1 && styles.menuItemLast,
              ]}
              onPress={item.onPress}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.color + '10' }]}>
                <item.icon size={20} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <ChevronRight size={20} color={colors.secondary} />
            </Pressable>
          ))}
        </View>

        {/* Sign Out */}
        <Pressable
          style={({ pressed }) => [
            styles.signOutButton,
            pressed && styles.signOutButtonPressed,
          ]}
          onPress={handleSignOut}
        >
          <LogOut size={20} color="#ef4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} The Ferchr Team
          </Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
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
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarContainer: {
    marginBottom: spacing.md,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  profileName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: spacing.sm,
  },
  socialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  socialStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
  },
  followingCount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    marginRight: spacing.xs,
  },
  followingLabel: {
    fontSize: 14,
    color: colors.secondary,
  },
  faceTagCard: {
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.accent + '20',
  },
  faceTagGradient: {
    padding: spacing.lg,
  },
  faceTagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  faceTagInfo: {
    flex: 1,
    marginRight: -8,
  },
  faceTagLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  faceTag: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  faceTagActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  faceTagHint: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: borderRadius.lg,
  },
  qrButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  menuSection: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  menuSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemPressed: {
    backgroundColor: colors.muted,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: spacing.xl,
  },
  signOutButtonPressed: {
    backgroundColor: '#fee2e2',
    transform: [{ scale: 0.98 }],
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  footerText: {
    fontSize: 12,
    color: colors.secondary,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 11,
    color: colors.muted,
  },
});

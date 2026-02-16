/**
 * Creator Profile Screen
 * 
 * Profile, FaceTag, and account management.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Share,
  Alert,
  StatusBar,
  Linking,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Share2,
  Copy,
  QrCode,
  ExternalLink,
  Shield,
  Camera,
  Info,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';
import { alertMissingPublicAppUrl, buildPublicUrl } from '@/lib/runtime-config';

const API_URL = getApiBaseUrl();

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, session, signOut } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);

  // Load followers count
  useEffect(() => {
    const loadFollowersCount = async () => {
      try {
        const response = await fetch(`${API_URL}/api/social/follow?type=followers`, {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        });
        if (response.ok) {
          const data = await response.json();
          setFollowersCount(data.total || 0);
        }
      } catch (error) {
        console.log('Error loading followers count:', error);
      }
    };
    loadFollowersCount();
  }, [session?.access_token]);

  const handleCopyFaceTag = async () => {
    if (profile?.faceTag) {
      await Clipboard.setStringAsync(profile.faceTag);
      Alert.alert('Copied!', 'FaceTag copied to clipboard');
    }
  };

  const handleShare = async () => {
    const profileUrl = buildPublicUrl(`/c/${profile?.faceTag?.replace('@', '')}`);
    if (!profileUrl) {
      alertMissingPublicAppUrl();
      return;
    }

    try {
      await Share.share({
        message: `Check out my photography on Ferchr!\n${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleOpenWebDashboard = () => {
    const dashboardUrl = buildPublicUrl('/dashboard');
    if (!dashboardUrl) {
      alertMissingPublicAppUrl();
      return;
    }

    Alert.alert(
      'Open Web Dashboard',
      'For advanced features like watermark settings, billing, and detailed analytics, use the web dashboard.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: () => Linking.openURL(dashboardUrl) },
      ]
    );
  };

  const menuItems = [
    {
      icon: User,
      label: 'Edit Profile',
      description: 'Update your name and photo',
      onPress: () => router.push('/settings/profile'),
      color: '#3b82f6',
    },
    {
      icon: CreditCard,
      label: 'Billing & Payouts',
      description: 'Manage payment methods',
      onPress: () => router.push('/settings/billing'),
      color: '#10b981',
    },
    {
      icon: Bell,
      label: 'Notifications',
      description: 'Configure alerts',
      onPress: () => router.push('/settings/notifications'),
      color: '#f59e0b',
    },
    {
      icon: Shield,
      label: 'Privacy & Security',
      description: 'Account security settings',
      onPress: () => router.push('/settings/privacy'),
      color: '#8b5cf6',
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      description: 'Get assistance',
      onPress: () => router.push('/settings/help'),
      color: '#ec4899',
    },
    {
      icon: Info,
      label: 'About App',
      description: 'Version and legal info',
      onPress: () => router.push('/settings/about'),
      color: colors.secondary,
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background - fixed at top */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => router.push('/settings/profile')}
            activeOpacity={0.9}
          >
            {profile?.profilePhotoUrl ? (
              <Image
                source={{ uri: profile.profilePhotoUrl }}
                style={styles.avatar}
              />
            ) : (
              <LinearGradient
                colors={[colors.accent, colors.accentDark]}
                style={[styles.avatar, styles.avatarPlaceholder]}
              >
                <Text style={styles.avatarText}>
                  {profile?.displayName?.charAt(0).toUpperCase() || 'P'}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.editAvatarBadge}>
              <Camera size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.displayName}>{profile?.displayName}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          
          {/* Followers Count - TikTok/Instagram style */}
          <Pressable
            style={({ pressed }) => [
              styles.followersRow,
              pressed && styles.pressed,
            ]}
            onPress={() => router.push('/social/followers')}
          >
            <Text style={styles.followersCount}>{followersCount}</Text>
            <Text style={styles.followersLabel}>Followers</Text>
          </Pressable>
          
          <View style={styles.roleBadge}>
            <Camera size={12} color={colors.accent} />
            <Text style={styles.roleBadgeText}>Creator</Text>
          </View>
        </View>

        {/* FaceTag Card */}
        <View style={styles.faceTagCard}>
          <LinearGradient
            colors={[colors.accent + '10', colors.accent + '05']}
            style={styles.faceTagGradient}
          >
            <View style={styles.faceTagHeader}>
              <View style={styles.faceTagInfo}>
                <Text style={styles.faceTagLabel}>Your FaceTag</Text>
                <Text style={styles.faceTag}>{profile?.faceTag || '@ferchr'}</Text>
              </View>
              <View style={styles.faceTagActions}>
                <TouchableOpacity 
                  onPress={handleCopyFaceTag} 
                  style={styles.iconButton}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Copy size={16} color={colors.accent} />
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
              Share your FaceTag so attendees can find and follow you
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

        {/* Web Dashboard Link */}
        <TouchableOpacity
          style={styles.webDashboardCard}
          onPress={handleOpenWebDashboard}
          activeOpacity={0.8}
        >
          <View style={styles.webDashboardIcon}>
            <ExternalLink size={20} color="#8b5cf6" />
          </View>
          <View style={styles.webDashboardText}>
            <Text style={styles.webDashboardTitle}>Web Dashboard</Text>
            <Text style={styles.webDashboardSubtitle}>
              Advanced settings & full analytics
            </Text>
          </View>
          <ChevronRight size={20} color={colors.secondary} />
        </TouchableOpacity>

        {/* Menu Section */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Account</Text>
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index === menuItems.length - 1 && styles.menuItemLast,
                ]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.menuItemIcon, { backgroundColor: item.color + '15' }]}>
                  <item.icon size={18} color={item.color} />
                </View>
                <View style={styles.menuItemContent}>
                  <Text style={styles.menuItemLabel}>{item.label}</Text>
                  <Text style={styles.menuItemDescription}>{item.description}</Text>
                </View>
                <ChevronRight size={18} color={colors.secondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={isLoggingOut}
          activeOpacity={0.7}
        >
          <LogOut size={18} color={colors.destructive} />
          <Text style={styles.logoutText}>
            {isLoggingOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        {/* App Version */}
        <View style={styles.footer}>
          <Text style={styles.version}>Ferchr v1.0.0</Text>
          <Text style={styles.copyright}>Â© {new Date().getFullYear()} The Ferchr Team</Text>
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
  statusBarBg: {
    backgroundColor: colors.background,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  followersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  followersCount: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    marginRight: spacing.xs,
  },
  followersLabel: {
    fontSize: 14,
    color: colors.secondary,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.accent + '15',
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  faceTagCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
  webDashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: '#8b5cf610',
    borderWidth: 1,
    borderColor: '#8b5cf620',
  },
  webDashboardIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#8b5cf615',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  webDashboardText: {
    flex: 1,
  },
  webDashboardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  webDashboardSubtitle: {
    fontSize: 12,
    color: colors.secondary,
  },
  menuSection: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  menuSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  menuItemDescription: {
    fontSize: 12,
    color: colors.secondary,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.destructive + '10',
    borderWidth: 1,
    borderColor: colors.destructive + '20',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.destructive,
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  version: {
    fontSize: 12,
    color: colors.secondary,
    marginBottom: 4,
  },
  copyright: {
    fontSize: 11,
    color: colors.muted,
  },
});

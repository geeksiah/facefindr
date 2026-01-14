/**
 * Profile Screen
 * 
 * User profile with FaceTag, settings, and account management.
 */

import { useState } from 'react';
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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  User,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  Share2,
  Copy,
  QrCode,
  Camera,
  Image as ImageIcon,
  Calendar,
  Users,
  Sparkles,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const APP_URL = process.env.EXPO_PUBLIC_APP_URL || 'https://app.example.com';

  const handleCopyFaceTag = async () => {
    if (profile?.faceTag) {
      await Clipboard.setStringAsync(profile.faceTag);
      Alert.alert('Copied!', 'FaceTag copied to clipboard');
    }
  };

  const handleShare = async () => {
    try {
      const profileUrl = `${APP_URL}/u/${profile?.faceTag?.replace('@', '')}`;
      await Share.share({
        message: `Find me on FaceFindr!\n\n${profile?.displayName}\n${profile?.faceTag}\n\n${profileUrl}`,
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

  const menuItems = [
    {
      icon: User,
      label: 'Edit Profile',
      description: 'Update your name and photo',
      onPress: () => router.push('/settings/profile'),
      color: colors.accent,
    },
    {
      icon: Bell,
      label: 'Notifications',
      description: 'Manage push notifications',
      onPress: () => router.push('/settings/notifications'),
      color: '#f59e0b',
    },
    {
      icon: Shield,
      label: 'Privacy & Security',
      description: 'Control your data and visibility',
      onPress: () => router.push('/settings/privacy'),
      color: '#8b5cf6',
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      description: 'FAQs and contact us',
      onPress: () => router.push('/settings/help'),
      color: '#ec4899',
    },
  ];

  // Mock stats - in production, these would come from the backend
  const stats = {
    photos: 0,
    events: 0,
    following: 0,
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
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
                  {profile?.displayName?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </LinearGradient>
            )}
            <View style={styles.editAvatarBadge}>
              <Camera size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          
          <Text style={styles.displayName}>{profile?.displayName}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          
          <View style={styles.roleBadge}>
            <Sparkles size={12} color={colors.accent} />
            <Text style={styles.roleBadgeText}>Photo Collector</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: colors.accent + '15' }]}>
              <ImageIcon size={16} color={colors.accent} />
            </View>
            <View>
              <Text style={styles.statValue}>{stats.photos}</Text>
              <Text style={styles.statLabel}>Photos</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: '#8b5cf615' }]}>
              <Calendar size={16} color="#8b5cf6" />
            </View>
            <View>
              <Text style={styles.statValue}>{stats.events}</Text>
              <Text style={styles.statLabel}>Events</Text>
            </View>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={[styles.statIcon, { backgroundColor: '#10b98115' }]}>
              <Users size={16} color="#10b981" />
            </View>
            <View>
              <Text style={styles.statValue}>{stats.following}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
          </View>
        </View>

        {/* FaceTag Card */}
        <View style={styles.faceTagCard}>
          <LinearGradient
            colors={[colors.accent + '10', colors.accent + '05']}
            style={styles.faceTagGradient}
          >
            <View style={styles.faceTagHeader}>
              <View>
                <Text style={styles.faceTagLabel}>Your FaceTag</Text>
                <Text style={styles.faceTag}>{profile?.faceTag || '@facefindr'}</Text>
              </View>
              <View style={styles.faceTagActions}>
                <TouchableOpacity 
                  onPress={handleCopyFaceTag} 
                  style={styles.iconButton}
                  activeOpacity={0.7}
                >
                  <Copy size={18} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={handleShare} 
                  style={styles.iconButton}
                  activeOpacity={0.7}
                >
                  <Share2 size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>
            </View>
            
            <Text style={styles.faceTagHint}>
              Share this tag so photographers can add you to event photos
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

        {/* Menu Section */}
        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Settings</Text>
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

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.version}>FaceFindr v1.0.0</Text>
          <Text style={styles.copyright}>© 2025 The FaceFindr Team</Text>
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
  scrollContent: {
    paddingBottom: 120,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
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
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 11,
    color: colors.secondary,
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  faceTagCard: {
    marginHorizontal: spacing.lg,
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
  faceTagLabel: {
    fontSize: 12,
    color: colors.secondary,
    marginBottom: 4,
  },
  faceTag: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  faceTagActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
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

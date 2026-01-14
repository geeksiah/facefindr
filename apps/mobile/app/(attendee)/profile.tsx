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
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Share,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  User,
  Settings,
  Bell,
  Shield,
  HelpCircle,
  LogOut,
  ChevronRight,
  Share2,
  Copy,
  QrCode,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleCopyFaceTag = async () => {
    if (profile?.faceTag) {
      await Clipboard.setStringAsync(profile.faceTag);
      Alert.alert('Copied', 'FaceTag copied to clipboard');
    }
  };

  const handleShare = async () => {
    try {
      const profileUrl = `https://facefindr.com/u/${profile?.faceTag?.replace('@', '')}`;
      await Share.share({
        message: `Find me on FaceFindr! ${profile?.faceTag}\n${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setIsLoggingOut(true);
            await signOut();
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: User,
      label: 'Edit Profile',
      onPress: () => router.push('/settings/profile'),
    },
    {
      icon: Bell,
      label: 'Notifications',
      onPress: () => router.push('/settings/notifications'),
    },
    {
      icon: Shield,
      label: 'Privacy & Security',
      onPress: () => router.push('/settings/privacy'),
    },
    {
      icon: HelpCircle,
      label: 'Help & Support',
      onPress: () => router.push('/settings/help'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {profile?.profilePhotoUrl ? (
              <Image
                source={{ uri: profile.profilePhotoUrl }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {profile?.displayName?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.displayName}>{profile?.displayName}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
        </View>

        {/* FaceTag Card */}
        <Card style={styles.faceTagCard}>
          <View style={styles.faceTagHeader}>
            <Text style={styles.faceTagLabel}>Your FaceTag</Text>
            <View style={styles.faceTagActions}>
              <TouchableOpacity onPress={handleCopyFaceTag} style={styles.iconButton}>
                <Copy size={18} color={colors.secondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.iconButton}>
                <Share2 size={18} color={colors.secondary} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.faceTag}>{profile?.faceTag || 'Not assigned'}</Text>
          <Text style={styles.faceTagHint}>
            Share this tag so photographers can add you to events
          </Text>

          <TouchableOpacity
            style={styles.qrButton}
            onPress={() => router.push('/profile/qr-code')}
          >
            <QrCode size={20} color={colors.accent} />
            <Text style={styles.qrButtonText}>Show QR Code</Text>
          </TouchableOpacity>
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Events</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>0</Text>
            <Text style={styles.statLabel}>Following</Text>
          </Card>
        </View>

        {/* Menu */}
        <View style={styles.menu}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <item.icon size={20} color={colors.secondary} />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
              <ChevronRight size={20} color={colors.secondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={isLoggingOut}
        >
          <LogOut size={20} color={colors.destructive} />
          <Text style={styles.logoutText}>
            {isLoggingOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        {/* Version */}
        <Text style={styles.version}>FaceFindr v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: fontSize['3xl'],
    fontWeight: 'bold',
    color: '#fff',
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  faceTagCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  faceTagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  faceTagLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  faceTagActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconButton: {
    padding: spacing.xs,
  },
  faceTag: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.accent,
    fontFamily: 'monospace',
  },
  faceTagHint: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  qrButtonText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.accent,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    marginTop: 2,
  },
  menu: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
    marginLeft: spacing.md,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  logoutText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.destructive,
  },
  version: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});

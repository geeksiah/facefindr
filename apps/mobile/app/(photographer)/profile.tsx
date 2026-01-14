/**
 * Photographer Profile Screen
 * 
 * Profile, FaceTag, and account management.
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
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  Share2,
  Copy,
  QrCode,
  ExternalLink,
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
      const profileUrl = `https://facefindr.com/p/${profile?.faceTag?.replace('@', '')}`;
      await Share.share({
        message: `Check out my photography on FaceFindr!\n${profileUrl}`,
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

  const handleOpenWebDashboard = () => {
    // Open web dashboard in browser
    Alert.alert(
      'Open Web Dashboard',
      'For advanced features like watermark settings, billing, and detailed analytics, use the web dashboard.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open', onPress: () => {/* Linking.openURL('https://facefindr.com/dashboard') */} },
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
      icon: CreditCard,
      label: 'Billing & Payouts',
      onPress: () => router.push('/settings/billing'),
    },
    {
      icon: Bell,
      label: 'Notifications',
      onPress: () => router.push('/settings/notifications'),
    },
    {
      icon: Settings,
      label: 'Settings',
      onPress: () => router.push('/settings'),
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
                  {profile?.displayName?.charAt(0).toUpperCase() || 'P'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.displayName}>{profile?.displayName}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Photographer</Text>
          </View>
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
            Share this so attendees can find and follow you
          </Text>

          <TouchableOpacity
            style={styles.qrButton}
            onPress={() => router.push('/profile/qr-code')}
          >
            <QrCode size={20} color={colors.accent} />
            <Text style={styles.qrButtonText}>Show QR Code</Text>
          </TouchableOpacity>
        </Card>

        {/* Web Dashboard Link */}
        <TouchableOpacity
          style={styles.webDashboardCard}
          onPress={handleOpenWebDashboard}
        >
          <View style={styles.webDashboardContent}>
            <ExternalLink size={20} color={colors.accent} />
            <View style={styles.webDashboardText}>
              <Text style={styles.webDashboardTitle}>Web Dashboard</Text>
              <Text style={styles.webDashboardSubtitle}>
                Access advanced settings & analytics
              </Text>
            </View>
          </View>
          <ChevronRight size={20} color={colors.secondary} />
        </TouchableOpacity>

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
  badge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent + '20',
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.accent,
  },
  faceTagCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
  webDashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.accent + '10',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  webDashboardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  webDashboardText: {
    flex: 1,
  },
  webDashboardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  webDashboardSubtitle: {
    fontSize: fontSize.sm,
    color: colors.secondary,
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

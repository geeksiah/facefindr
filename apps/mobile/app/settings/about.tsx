/**
 * About App Screen
 * 
 * Displays app information, version, and links.
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Image,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Shield,
  Mail,
  Star,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { alertMissingPublicAppUrl, buildPublicUrl, getSupportEmail } from '@/lib/runtime-config';

const SUPPORT_EMAIL = getSupportEmail();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const APP_ICON = require('../../assets/logos/app-icon-512.png');

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const termsUrl = buildPublicUrl('/terms');
  const privacyUrl = buildPublicUrl('/privacy');
  const supportUrl = buildPublicUrl('/support');

  const openUrl = (url: string | null) => {
    if (!url) {
      alertMissingPublicAppUrl();
      return;
    }
    Linking.openURL(url);
  };

  const openSupportEmail = () => {
    if (!SUPPORT_EMAIL) {
      Alert.alert(
        'Configuration required',
        'EXPO_PUBLIC_SUPPORT_EMAIL is not set. Please contact support.'
      );
      return;
    }

    Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  };

  const links = [
    {
      title: 'Terms of Service',
      icon: FileText,
      onPress: () => openUrl(termsUrl),
    },
    {
      title: 'Privacy Policy',
      icon: Shield,
      onPress: () => openUrl(privacyUrl),
    },
    {
      title: 'Contact Support',
      icon: Mail,
      onPress: openSupportEmail,
    },
    {
      title: 'Rate the App',
      icon: Star,
      onPress: () => {
        // In production, link to App Store / Play Store
        const storeUrl = Platform.select({
          ios: `https://apps.apple.com/app/facefindr`,
          android: `https://play.google.com/store/apps/details?id=com.facefindr.app`,
          default: supportUrl || undefined,
        });
        if (storeUrl) {
          Linking.openURL(storeUrl);
        } else {
          alertMissingPublicAppUrl();
        }
      },
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* App Logo & Info */}
        <View style={styles.logoSection}>
          <Image
            source={APP_ICON}
            style={styles.appIcon}
          />
          <Text style={styles.appName}>FaceFindr</Text>
          <Text style={styles.appTagline}>Find yourself in every moment</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>v{appVersion}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>
            FaceFindr uses AI-powered facial recognition to help you discover and collect photos of yourself at events. 
            Connect with photographers, build your photo passport, and never miss a captured moment.
          </Text>
        </View>

        {/* Links */}
        <View style={styles.linksCard}>
          {links.map((link, index) => (
            <Pressable
              key={link.title}
              style={({ pressed }) => [
                styles.linkRow,
                index < links.length - 1 && styles.linkRowBorder,
                pressed && styles.linkRowPressed,
              ]}
              onPress={link.onPress}
            >
              <View style={styles.linkIconContainer}>
                <link.icon size={18} color={colors.accent} />
              </View>
              <Text style={styles.linkTitle}>{link.title}</Text>
              <ExternalLink size={16} color={colors.secondary} />
            </Pressable>
          ))}
        </View>

        {/* Credits */}
        <View style={styles.creditsSection}>
          <Text style={styles.teamText}>The FaceFindr Team</Text>
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} FaceFindr. All rights reserved.
          </Text>
        </View>

        {/* Technical Info */}
        <View style={styles.technicalSection}>
          <Text style={styles.technicalTitle}>Technical Details</Text>
          <View style={styles.technicalRow}>
            <Text style={styles.technicalLabel}>Platform</Text>
            <Text style={styles.technicalValue}>{Platform.OS === 'ios' ? 'iOS' : 'Android'}</Text>
          </View>
          <View style={styles.technicalRow}>
            <Text style={styles.technicalLabel}>OS Version</Text>
            <Text style={styles.technicalValue}>{Platform.Version}</Text>
          </View>
          <View style={styles.technicalRow}>
            <Text style={styles.technicalLabel}>Expo SDK</Text>
            <Text style={styles.technicalValue}>{Constants.expoConfig?.sdkVersion || 'N/A'}</Text>
          </View>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  pressed: {
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 18,
    marginBottom: spacing.md,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  appTagline: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 4,
  },
  versionBadge: {
    backgroundColor: colors.muted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: spacing.md,
  },
  versionText: {
    fontSize: 12,
    color: colors.secondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  descriptionCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  descriptionText: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 22,
  },
  linksCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  linkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkRowPressed: {
    backgroundColor: colors.muted,
  },
  linkIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  linkTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.foreground,
  },
  creditsSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  teamText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: 4,
  },
  copyright: {
    fontSize: 12,
    color: colors.secondary,
    opacity: 0.7,
  },
  technicalSection: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  technicalTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  technicalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  technicalLabel: {
    fontSize: 14,
    color: colors.secondary,
  },
  technicalValue: {
    fontSize: 14,
    color: colors.foreground,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

/**
 * Help & Support Screen
 */

import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import {
  HelpCircle,
  MessageCircle,
  Mail,
  FileText,
  Shield,
  ChevronRight,
  ExternalLink,
} from 'lucide-react-native';

import { Card } from '@/components/ui';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function HelpSupportScreen() {
  const helpOptions = [
    {
      icon: HelpCircle,
      title: 'FAQs',
      description: 'Frequently asked questions',
      onPress: () => Linking.openURL('https://facefindr.com/help/faq'),
    },
    {
      icon: FileText,
      title: 'How to Use FaceFindr',
      description: 'Step-by-step guides',
      onPress: () => Linking.openURL('https://facefindr.com/help/guides'),
    },
    {
      icon: MessageCircle,
      title: 'Contact Support',
      description: 'Get help from our team',
      onPress: () => Linking.openURL('mailto:support@facefindr.com'),
    },
    {
      icon: Mail,
      title: 'Feature Request',
      description: 'Suggest new features',
      onPress: () => Linking.openURL('mailto:feedback@facefindr.com'),
    },
  ];

  const legalOptions = [
    {
      title: 'Terms of Service',
      onPress: () => Linking.openURL('https://facefindr.com/terms'),
    },
    {
      title: 'Privacy Policy',
      onPress: () => Linking.openURL('https://facefindr.com/privacy'),
    },
    {
      title: 'Cookie Policy',
      onPress: () => Linking.openURL('https://facefindr.com/cookies'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Help Options */}
        <Text style={styles.sectionTitle}>Get Help</Text>
        
        {helpOptions.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={styles.optionRow}
            onPress={option.onPress}
          >
            <View style={styles.optionIcon}>
              <option.icon size={20} color={colors.accent} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>{option.title}</Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
            <ExternalLink size={18} color={colors.secondary} />
          </TouchableOpacity>
        ))}

        {/* About */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>About</Text>

        <Card style={styles.aboutCard}>
          <Text style={styles.appName}>FaceFindr</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appTagline}>
            Find your event photos instantly with face recognition
          </Text>
        </Card>

        {/* Legal */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Legal</Text>

        {legalOptions.map((option, index) => (
          <TouchableOpacity
            key={index}
            style={styles.legalRow}
            onPress={option.onPress}
          >
            <Text style={styles.legalText}>{option.title}</Text>
            <ChevronRight size={18} color={colors.secondary} />
          </TouchableOpacity>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ by FaceFindr Team
          </Text>
          <Text style={styles.footerCopyright}>
            © {new Date().getFullYear()} FaceFindr. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground,
  },
  optionDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  aboutCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  appName: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.accent,
  },
  appVersion: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  appTagline: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 24,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  legalText: {
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  footerCopyright: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
});

/**
 * Help & Support Screen
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  StatusBar,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  MessageCircle,
  Mail,
  FileText,
  Shield,
  HelpCircle,
  ExternalLink,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { alertMissingPublicAppUrl, buildPublicUrl, getSupportEmail } from '@/lib/runtime-config';

export default function HelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const faqItems = [
    {
      question: 'How does face recognition work?',
      answer: 'Our AI analyzes your selfie to find matching faces in event photos. Your face data is encrypted and secure.',
    },
    {
      question: 'How do I find my photos?',
      answer: 'Scan your face using the camera or upload an existing photo. You can also scan event QR codes or enter event codes.',
    },
    {
      question: 'Are my photos private?',
      answer: 'Yes, only you can see your matched photos until you choose to share them. Creators cannot access your personal data.',
    },
    {
      question: 'How do I contact a photographer?',
      answer: 'Visit the photographer\'s profile from any event or photo they\'ve uploaded. You can follow them or view their contact info.',
    },
  ];

  const supportEmail = getSupportEmail();
  const supportUrl = buildPublicUrl('/support');
  const termsUrl = buildPublicUrl('/terms');
  const privacyUrl = buildPublicUrl('/privacy');

  const openUrl = (url: string | null) => {
    if (!url) {
      alertMissingPublicAppUrl();
      return;
    }
    Linking.openURL(url);
  };

  const openSupportEmail = () => {
    if (!supportEmail) {
      Alert.alert(
        'Configuration required',
        'EXPO_PUBLIC_SUPPORT_EMAIL is not set. Please contact support.'
      );
      return;
    }

    Linking.openURL(`mailto:${supportEmail}`);
  };

  const contactOptions = [
    {
      icon: Mail,
      title: 'Email Support',
      description: supportEmail || 'Support email not configured',
      onPress: openSupportEmail,
    },
    {
      icon: MessageCircle,
      title: 'Live Chat',
      description: 'Chat with our support team',
      onPress: () => openUrl(supportUrl),
    },
  ];

  const legalLinks = [
    {
      icon: FileText,
      title: 'Terms of Service',
      onPress: () => openUrl(termsUrl),
    },
    {
      icon: Shield,
      title: 'Privacy Policy',
      onPress: () => openUrl(privacyUrl),
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Contact */}
        <Text style={styles.sectionTitle}>Contact Us</Text>
        
        <View style={styles.optionsCard}>
          {contactOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionRow,
                index < contactOptions.length - 1 && styles.optionRowBorder
              ]}
              onPress={option.onPress}
              activeOpacity={0.7}
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
        </View>

        {/* FAQ */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        
        <View style={styles.faqContainer}>
          {faqItems.map((item, index) => (
            <View key={index} style={styles.faqItem}>
              <View style={styles.faqQuestion}>
                <HelpCircle size={16} color={colors.accent} />
                <Text style={styles.faqQuestionText}>{item.question}</Text>
              </View>
              <Text style={styles.faqAnswer}>{item.answer}</Text>
            </View>
          ))}
        </View>

        {/* Legal */}
        <Text style={styles.sectionTitle}>Legal</Text>
        
        <View style={styles.optionsCard}>
          {legalLinks.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionRow,
                index < legalLinks.length - 1 && styles.optionRowBorder
              ]}
              onPress={option.onPress}
              activeOpacity={0.7}
            >
              <View style={styles.optionIcon}>
                <option.icon size={20} color={colors.secondary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>{option.title}</Text>
              </View>
              <ChevronRight size={18} color={colors.secondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* App Info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>Ferchr v1.0.0</Text>
          <Text style={styles.appCopyright}>© {new Date().getFullYear()} Ferchr. All rights reserved.</Text>
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
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  optionsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  optionDescription: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 2,
  },
  faqContainer: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  faqItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  faqAnswer: {
    fontSize: 14,
    color: colors.secondary,
    lineHeight: 20,
    marginLeft: 24,
  },
  appInfo: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  appVersion: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.secondary,
  },
  appCopyright: {
    fontSize: 12,
    color: colors.secondary,
    opacity: 0.7,
    marginTop: 4,
  },
});

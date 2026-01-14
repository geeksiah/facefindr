/**
 * Privacy & Security Settings Screen
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, Lock, Trash2, Download } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();

  const [settings, setSettings] = useState({
    profileVisible: true,
    allowPhotoTagging: true,
    showInSearch: true,
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data, photos, and purchases will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirm Deletion',
              'Type DELETE to confirm account deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'I understand, delete my account',
                  style: 'destructive',
                  onPress: async () => {
                    // In production, this would call an API to delete the account
                    await signOut();
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Your Data',
      'We will prepare a download of all your data and send it to your email address.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Export',
          onPress: () => {
            Alert.alert('Request Sent', 'You will receive an email with your data within 24 hours.');
          },
        },
      ]
    );
  };

  const privacyOptions = [
    {
      key: 'profileVisible' as const,
      icon: Eye,
      title: 'Public Profile',
      description: 'Allow others to see your profile when they search your FaceTag',
    },
    {
      key: 'allowPhotoTagging' as const,
      icon: Eye,
      title: 'Photo Tagging',
      description: 'Allow photographers to tag you in event photos',
    },
    {
      key: 'showInSearch' as const,
      icon: Eye,
      title: 'Searchable',
      description: 'Appear in search results when people look for attendees',
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Privacy Options */}
        <Text style={styles.sectionTitle}>Privacy</Text>
        
        <View style={styles.optionsCard}>
          {privacyOptions.map((option, index) => (
            <View 
              key={option.key} 
              style={[
                styles.optionRow,
                index < privacyOptions.length - 1 && styles.optionRowBorder
              ]}
            >
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Switch
                value={settings[option.key]}
                onValueChange={(value) => 
                  setSettings((prev) => ({ ...prev, [option.key]: value }))
                }
                trackColor={{ false: colors.muted, true: colors.accent + '50' }}
                thumbColor={settings[option.key] ? colors.accent : colors.secondary}
              />
            </View>
          ))}
        </View>

        {/* Data Management */}
        <Text style={styles.sectionTitle}>Your Data</Text>
        
        <View style={styles.optionsCard}>
          <TouchableOpacity
            style={[styles.actionRow, styles.optionRowBorder]}
            onPress={handleExportData}
            activeOpacity={0.7}
          >
            <View style={styles.actionIcon}>
              <Download size={20} color={colors.accent} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Export Your Data</Text>
              <Text style={styles.optionDescription}>
                Download a copy of all your data
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleDeleteAccount}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, styles.actionIconDanger]}>
              <Trash2 size={20} color={colors.destructive} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionTitle, styles.dangerText]}>Delete Account</Text>
              <Text style={styles.optionDescription}>
                Permanently delete your account and all data
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Lock size={16} color={colors.secondary} />
          <Text style={styles.infoText}>
            Your face data is encrypted and stored securely. We never share your biometric data with third parties.
          </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  optionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionInfo: {
    flex: 1,
    marginRight: spacing.md,
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
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  actionIconDanger: {
    backgroundColor: colors.destructive + '15',
  },
  dangerText: {
    color: colors.destructive,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 18,
  },
});

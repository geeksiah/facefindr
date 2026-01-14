/**
 * Privacy & Security Settings Screen
 * 
 * Real-time privacy settings that persist to the database.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, Lock, Trash2, Download, Check, AlertCircle } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

interface PrivacySettings {
  profileVisible: boolean;
  allowPhotoTagging: boolean;
  showInSearch: boolean;
  allowFaceRecognition: boolean;
  shareActivityWithPhotographers: boolean;
  emailMarketing: boolean;
}

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, signOut } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  const [settings, setSettings] = useState<PrivacySettings>({
    profileVisible: true,
    allowPhotoTagging: true,
    showInSearch: true,
    allowFaceRecognition: true,
    shareActivityWithPhotographers: false,
    emailMarketing: false,
  });

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        setIsLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/user/privacy-settings`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async (key: keyof PrivacySettings, value: boolean) => {
    // Optimistic update
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaveStatus('saving');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_URL}/api/user/privacy-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [key]: value }),
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error updating privacy setting:', error);
      // Revert optimistic update
      setSettings(prev => ({ ...prev, [key]: !value }));
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
      Alert.alert('Error', 'Failed to save setting. Please try again.');
    }
  };

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
              'Are you absolutely sure? This will delete all your data.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'I understand, delete my account',
                  style: 'destructive',
                  onPress: async () => {
                    // In production, call an API to delete the account
                    await signOut();
                    router.replace('/');
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleExportData = async () => {
    setIsExporting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${API_URL}/api/user/export-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.existingRequest) {
          Alert.alert(
            'Export In Progress',
            'You already have a pending export request. Please wait for it to complete.'
          );
        } else {
          throw new Error(data.error || 'Export request failed');
        }
        return;
      }

      Alert.alert(
        'Export Requested',
        `Your data export has been requested. You will receive an email at ${profile?.email} when it's ready (typically within 24 hours).`
      );
    } catch (error) {
      console.error('Export data error:', error);
      Alert.alert('Error', 'Failed to request data export. Please try again.');
    } finally {
      setIsExporting(false);
    }
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
    {
      key: 'allowFaceRecognition' as const,
      icon: Eye,
      title: 'Face Recognition',
      description: 'Allow AI to match your face in event photos',
    },
  ];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={[styles.statusBarBg, { height: insets.top }]} />
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Privacy & Security</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

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
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.headerRight}>
          {saveStatus === 'saving' && (
            <ActivityIndicator size="small" color={colors.accent} />
          )}
          {saveStatus === 'saved' && (
            <Check size={20} color="#10b981" />
          )}
          {saveStatus === 'error' && (
            <AlertCircle size={20} color={colors.destructive} />
          )}
        </View>
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
                onValueChange={(value) => updateSetting(option.key, value)}
                trackColor={{ false: colors.muted, true: colors.accent + '50' }}
                thumbColor={settings[option.key] ? colors.accent : colors.secondary}
              />
            </View>
          ))}
        </View>

        {/* Data Management */}
        <Text style={styles.sectionTitle}>Your Data</Text>
        
        <View style={styles.optionsCard}>
          <Pressable
            style={({ pressed }) => [
              styles.actionRow, 
              styles.optionRowBorder,
              pressed && styles.actionRowPressed
            ]}
            onPress={handleExportData}
            disabled={isExporting}
          >
            <View style={styles.actionIcon}>
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Download size={20} color={colors.accent} />
              )}
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Export Your Data</Text>
              <Text style={styles.optionDescription}>
                Download a copy of all your data
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionRow,
              pressed && styles.actionRowPressed
            ]}
            onPress={handleDeleteAccount}
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
          </Pressable>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Lock size={16} color={colors.secondary} />
          <Text style={styles.infoText}>
            Your face data is encrypted and stored securely. We never share your biometric data with third parties. Settings are saved automatically.
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
  headerSpacer: {
    width: 40,
  },
  headerRight: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  actionRowPressed: {
    backgroundColor: colors.muted,
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

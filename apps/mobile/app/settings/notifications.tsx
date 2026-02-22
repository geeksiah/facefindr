/**
 * Notification Settings Screen
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell } from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { usePushNotifications } from '@/hooks';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { updateHapticPreferenceCache } from '@/lib/haptics';

interface NotificationSettings {
  photoDrops: boolean;
  purchases: boolean;
  promotions: boolean;
  reminders: boolean;
  hapticFeedback: boolean;
}

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { isRegistered, expoPushToken, error: pushError } = usePushNotifications();
  
  const [settings, setSettings] = useState<NotificationSettings>({
    photoDrops: true,
    purchases: true,
    promotions: false,
    reminders: true,
    hapticFeedback: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', profile?.id)
        .single();

      if (data) {
        setSettings({
          photoDrops: data.photo_match_enabled ?? data.photo_drop_enabled ?? true,
          purchases: data.order_updates_enabled ?? true,
          promotions: data.marketing_updates_enabled ?? data.marketing_enabled ?? false,
          reminders: data.event_reminder_enabled ?? data.event_updates_enabled ?? true,
          hapticFeedback: data.haptic_feedback_enabled ?? true,
        });
      }
    } catch (err) {
      console.error('Error loading notification settings:', err);
    }
  };

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));

    try {
      const payload: Record<string, unknown> = {
        user_id: profile?.id,
        updated_at: new Date().toISOString(),
      };

      if (key === 'photoDrops') {
        payload.photo_match_enabled = value;
        payload.photo_drop_enabled = value; // legacy compatibility
      } else if (key === 'purchases') {
        payload.order_updates_enabled = value;
      } else if (key === 'promotions') {
        payload.marketing_updates_enabled = value;
        payload.marketing_enabled = value; // legacy compatibility
      } else if (key === 'reminders') {
        payload.event_reminder_enabled = value;
        payload.event_updates_enabled = value; // legacy compatibility
      } else if (key === 'hapticFeedback') {
        payload.haptic_feedback_enabled = value;
      }

      await supabase
        .from('user_notification_preferences')
        .upsert(payload, { onConflict: 'user_id' });

      // Update haptic preference cache if haptic feedback setting changed
      if (key === 'hapticFeedback') {
        await updateHapticPreferenceCache(value);
      }
    } catch (err) {
      console.error('Error saving notification setting:', err);
    }
  };

  const notificationOptions = [
    {
      key: 'photoDrops' as const,
      title: 'Photo Drops',
      description: 'Get notified when new photos of you are found at events',
    },
    {
      key: 'purchases' as const,
      title: 'Purchases',
      description: 'Notifications for successful purchases and downloads',
    },
    {
      key: 'reminders' as const,
      title: 'Reminders',
      description: 'Reminders about unclaimed photos and events',
    },
    {
      key: 'promotions' as const,
      title: 'Promotions',
      description: 'Special offers, discounts, and updates',
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
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Push Notification Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[
              styles.statusIconContainer,
              isRegistered && styles.statusIconActive
            ]}>
              <Bell size={20} color={isRegistered ? '#fff' : colors.secondary} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusText}>
                {isRegistered
                  ? 'Push notifications enabled'
                  : 'Push notifications disabled'}
              </Text>
              {pushError && (
                <Text style={styles.errorText}>{pushError}</Text>
              )}
              {!isRegistered && (
                <Text style={styles.hintText}>
                  Enable in device settings to receive updates
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Notification Options */}
        <Text style={styles.sectionTitle}>Notification Types</Text>
        
        <View style={styles.optionsCard}>
          {notificationOptions.map((option, index) => (
            <View 
              key={option.key} 
              style={[
                styles.optionRow,
                index < notificationOptions.length - 1 && styles.optionRowBorder
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

        {/* Haptic Feedback Toggle */}
        <Text style={styles.sectionTitle}>Feedback</Text>
        
        <View style={styles.optionsCard}>
          <View style={styles.optionRow}>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Haptic Feedback</Text>
              <Text style={styles.optionDescription}>
                Enable vibration feedback for button presses and interactions
              </Text>
            </View>
            <Switch
              value={settings.hapticFeedback}
              onValueChange={(value) => updateSetting('hapticFeedback', value)}
              trackColor={{ false: colors.muted, true: colors.accent + '50' }}
              thumbColor={settings.hapticFeedback ? colors.accent : colors.secondary}
            />
          </View>
        </View>

        {/* Test Notification */}
        {isRegistered && (
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => {
              Alert.alert('Test', 'A test notification will be sent shortly.');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.testButtonText}>Send Test Notification</Text>
          </TouchableOpacity>
        )}
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
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIconActive: {
    backgroundColor: colors.success,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
  },
  errorText: {
    fontSize: 13,
    color: colors.destructive,
    marginTop: 4,
  },
  hintText: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: 4,
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
  testButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  testButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
});

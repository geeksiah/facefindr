/**
 * Notification Settings Screen
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';

import { Button, Card } from '@/components/ui';
import { usePushNotifications } from '@/hooks';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface NotificationSettings {
  photoDrops: boolean;
  purchases: boolean;
  promotions: boolean;
  reminders: boolean;
}

export default function NotificationSettingsScreen() {
  const { profile } = useAuthStore();
  const { isRegistered, expoPushToken, error: pushError } = usePushNotifications();
  
  const [settings, setSettings] = useState<NotificationSettings>({
    photoDrops: true,
    purchases: true,
    promotions: false,
    reminders: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', profile?.id)
        .single();

      if (data) {
        setSettings({
          photoDrops: data.photo_drops ?? true,
          purchases: data.purchases ?? true,
          promotions: data.promotions ?? false,
          reminders: data.reminders ?? true,
        });
      }
    } catch (err) {
      console.error('Error loading notification settings:', err);
    }
  };

  const updateSetting = async (key: keyof NotificationSettings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));

    try {
      await supabase
        .from('notification_preferences')
        .upsert({
          user_id: profile?.id,
          [key.replace(/([A-Z])/g, '_$1').toLowerCase()]: value,
          updated_at: new Date().toISOString(),
        });
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Push Notification Status */}
        <Card style={styles.statusCard}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isRegistered && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isRegistered
                ? 'Push notifications enabled'
                : 'Push notifications disabled'}
            </Text>
          </View>
          {pushError && (
            <Text style={styles.errorText}>{pushError}</Text>
          )}
          {!isRegistered && (
            <Text style={styles.hintText}>
              Enable push notifications in your device settings to receive updates.
            </Text>
          )}
        </Card>

        {/* Notification Options */}
        <Text style={styles.sectionTitle}>Notification Types</Text>
        
        {notificationOptions.map((option) => (
          <View key={option.key} style={styles.optionRow}>
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

        {/* Test Notification */}
        {isRegistered && (
          <Button
            variant="outline"
            onPress={() => {
              Alert.alert('Test', 'A test notification will be sent shortly.');
            }}
            style={{ marginTop: spacing.xl }}
          >
            Send Test Notification
          </Button>
        )}
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
  },
  statusCard: {
    marginBottom: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.destructive,
  },
  statusDotActive: {
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.destructive,
    marginTop: spacing.sm,
  },
  hintText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: spacing.sm,
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
  optionInfo: {
    flex: 1,
    marginRight: spacing.md,
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
});

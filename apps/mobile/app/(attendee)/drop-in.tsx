/**
 * Drop-In Page (Two-Tabbed)
 * 
 * Combined page for sending drop-ins (upload) and checking drop-ins (discover)
 */

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Upload, Eye, Wallet, Plus } from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { useAuthStore } from '@/stores/auth-store';
import { getApiBaseUrl } from '@/lib/api-base';
import DropInUploadScreen from './drop-in/upload';
import DropInDiscoverScreen from './drop-in/discover';

export default function DropInPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'send' | 'check'>('send');
  const [credits, setCredits] = useState<number>(0);
  const [currency, setCurrency] = useState('USD');
  const [creditUnit, setCreditUnit] = useState<number>(0);
  const [uploadCreditsRequired, setUploadCreditsRequired] = useState<number>(1);
  const [giftCreditsRequired, setGiftCreditsRequired] = useState<number>(1);
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);

  const loadCredits = useCallback(async () => {
    setIsLoadingCredits(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/runtime/drop-in/pricing`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load Drop-In credits');

      setCredits(Number(data.attendeeCredits || 0));
      setCurrency(String(data.currency || 'USD'));
      setCreditUnit(Number(data.creditUnit || 0));
      setUploadCreditsRequired(Number(data.uploadCreditsRequired || 1));
      setGiftCreditsRequired(Number(data.giftCreditsRequired || 1));
    } catch (error) {
      // Keep screen usable even if credit summary fails.
    } finally {
      setIsLoadingCredits(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits, activeTab]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Credit Summary */}
        <View style={styles.creditCard}>
          <View style={styles.creditInfo}>
            <View style={styles.creditHeader}>
              <Wallet size={16} color={colors.accent} />
              <Text style={styles.creditHeaderText}>Remaining Credits</Text>
            </View>
            {isLoadingCredits ? (
              <View style={styles.creditLoading}>
                <ActivityIndicator size="small" color={colors.accent} />
              </View>
            ) : (
              <>
                <Text style={styles.creditValue}>{credits}</Text>
                <Text style={styles.creditMeta}>
                  Upload {uploadCreditsRequired} | Gift {giftCreditsRequired}
                  {creditUnit > 0 ? ` | 1 credit ≈ ${currency} ${creditUnit.toFixed(2)}` : ''}
                </Text>
              </>
            )}
          </View>
          <TouchableOpacity
            style={styles.addCreditsButton}
            onPress={() => router.push('/settings/billing')}
            activeOpacity={0.85}
          >
            <Plus size={16} color="#fff" />
            <Text style={styles.addCreditsButtonText}>Add Credits</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabSelector}>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'send' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('send')}
            activeOpacity={0.7}
          >
            <Upload
              size={18}
              color={activeTab === 'send' ? colors.accent : colors.secondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'send' && styles.tabButtonTextActive,
              ]}
            >
              Send Drop-In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'check' && styles.tabButtonActive,
            ]}
            onPress={() => setActiveTab('check')}
            activeOpacity={0.7}
          >
            <Eye
              size={18}
              color={activeTab === 'check' ? colors.accent : colors.secondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'check' && styles.tabButtonTextActive,
              ]}
            >
              Check Drop-Ins
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content - Render component directly with noHeader prop */}
        <View style={styles.content}>
          {activeTab === 'send' ? (
            <DropInUploadScreen noHeader={true} onCreditsChanged={loadCredits} />
          ) : (
            <DropInDiscoverScreen noHeader={true} onCreditsChanged={loadCredits} />
          )}
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  creditCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  creditInfo: {
    flex: 1,
  },
  creditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  creditHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  creditLoading: {
    marginTop: spacing.sm,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  creditValue: {
    marginTop: spacing.xs,
    fontSize: 22,
    fontWeight: '800',
    color: colors.foreground,
  },
  creditMeta: {
    marginTop: 2,
    fontSize: fontSize.xs,
    color: colors.secondary,
  },
  addCreditsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  addCreditsButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#fff',
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  tabButtonActive: {
    backgroundColor: colors.accent + '20',
  },
  tabButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.secondary,
  },
  tabButtonTextActive: {
    color: colors.accent,
  },
  content: {
    flex: 1,
  },
});

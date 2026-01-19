/**
 * Drop-In Page (Two-Tabbed)
 * 
 * Combined page for sending drop-ins (upload) and checking drop-ins (discover)
 */

import { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Upload, Eye } from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import DropInUploadScreen from './drop-in/upload';
import DropInDiscoverScreen from './drop-in/discover';

export default function DropInPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'send' | 'check'>('send');

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
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
            <DropInUploadScreen noHeader={true} />
          ) : (
            <DropInDiscoverScreen noHeader={true} />
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
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
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

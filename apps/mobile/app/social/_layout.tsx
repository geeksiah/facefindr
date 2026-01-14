/**
 * Social Stack Layout
 */

import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

export default function SocialLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="following" />
      <Stack.Screen name="followers" />
    </Stack>
  );
}

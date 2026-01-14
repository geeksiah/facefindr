/**
 * Root Layout
 * 
 * Sets up authentication, theme, and navigation.
 */

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { useAuthStore } from '@/stores/auth-store';
import { colors } from '@/lib/theme';

// Keep splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoading, isInitialized, initialize, user, profile } = useAuthStore();

  // Initialize auth on app start
  useEffect(() => {
    initialize();
  }, []);

  // Hide splash screen when initialized
  useEffect(() => {
    if (isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized]);

  // Handle auth-based routing
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inPhotographerGroup = segments[0] === '(photographer)';
    const inAttendeeGroup = segments[0] === '(attendee)';

    if (!user) {
      // Not signed in - go to welcome or auth
      if (inPhotographerGroup || inAttendeeGroup) {
        router.replace('/');
      }
    } else if (profile) {
      // Signed in with profile - route to correct dashboard
      if (inAuthGroup || segments[0] === undefined || segments.length === 0) {
        if (profile.userType === 'photographer') {
          router.replace('/(photographer)/');
        } else {
          router.replace('/(attendee)/');
        }
      }
    }
  }, [isInitialized, user, profile, segments]);

  // Show loading screen
  if (!isInitialized || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(photographer)" options={{ headerShown: false }} />
        <Stack.Screen name="(attendee)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="event/[id]" 
          options={{ 
            headerShown: true,
            presentation: 'modal',
          }} 
        />
        <Stack.Screen 
          name="scan" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
      </Stack>
    </>
  );
}

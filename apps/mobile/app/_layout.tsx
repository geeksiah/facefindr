/**
 * Root Layout
 * 
 * Sets up authentication, theme, and navigation.
 */

import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, Pressable, Image } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/auth-store';
import { colors } from '@/lib/theme';

// Keep splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const rootSegment = segments[0] as string | undefined;
  const rootNavigationState = useRootNavigationState();
  const { isLoading, isInitialized, initialize, user, profile } = useAuthStore();
  const [navigationReady, setNavigationReady] = useState(false);
  const hasNavigated = useRef(false);

  // Initialize auth on app start
  useEffect(() => {
    initialize();
  }, []);

  // Track when navigation is ready
  useEffect(() => {
    if (rootNavigationState?.key) {
      setNavigationReady(true);
    }
  }, [rootNavigationState?.key]);

  // Hide splash screen when initialized
  useEffect(() => {
    if (isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [isInitialized]);

  // Handle auth-based routing - only after navigation is ready
  useEffect(() => {
    if (!isInitialized || !navigationReady) return;

    const inAuthGroup = rootSegment === '(auth)';
    const inCreatorGroup = rootSegment === '(creator)' || rootSegment === '(photographer)';
    const inAttendeeGroup = rootSegment === '(attendee)';
    const isRootIndex = rootSegment === undefined;

    if (!user) {
      // Not signed in - go to welcome if on protected route
      if (inCreatorGroup || inAttendeeGroup) {
        router.replace('/' as any);
      }
      // Reset navigation tracking when signed out
      hasNavigated.current = false;
    } else if (profile) {
      // Signed in with profile - route to correct dashboard (only once per session)
      if ((inAuthGroup || isRootIndex) && !hasNavigated.current) {
        hasNavigated.current = true;
        if (profile.userType === 'creator') {
          router.replace('/(creator)' as any);
        } else {
          router.replace('/(attendee)' as any);
        }
      }
    }
  }, [isInitialized, navigationReady, user, profile, rootSegment]);

  // Show loading screen
  if (!isInitialized || isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const profileQuickAccessExcluded = new Set([
    'notifications',
    'privacy',
    'help',
    'about',
    'profile',
    'qr-scanner',
    'face-scan',
    'enter-code',
  ]);

  const isAuthOrLanding =
    rootSegment === '(auth)' || rootSegment === undefined || rootSegment === 'index';
  const containsExcludedSegment = segments.some((segment) =>
    profileQuickAccessExcluded.has(segment)
  );
  const shouldShowProfileQuickAccess =
    !!user &&
    !!profile &&
    !isAuthOrLanding &&
    !containsExcludedSegment;

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
        <Stack.Screen name="(creator)" options={{ headerShown: false }} />
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
          name="qr-scanner" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="face-scan" 
          options={{ 
            headerShown: false,
            presentation: 'fullScreenModal',
          }} 
        />
        <Stack.Screen 
          name="enter-code" 
          options={{ 
            headerShown: false,
            presentation: 'modal',
          }} 
        />
        <Stack.Screen 
          name="search" 
          options={{ 
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="create-event" 
          options={{ 
            headerShown: false,
            presentation: 'modal',
          }} 
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      {shouldShowProfileQuickAccess && (
        <Pressable
          onPress={() =>
            router.push(
              (profile?.userType === 'creator' ? '/(creator)/profile' : '/(attendee)/profile') as any
            )
          }
          style={({ pressed }) => ({
            position: 'absolute',
            top: insets.top + 12,
            right: 16,
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.75 : 1,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          })}
        >
          {profile?.profilePhotoUrl ? (
            <Image
              source={{ uri: profile.profilePhotoUrl }}
              style={{ width: 38, height: 38, borderRadius: 19 }}
            />
          ) : (
            <User size={18} color={colors.secondary} />
          )}
        </Pressable>
      )}
    </>
  );
}

/**
 * Attendee Tab Layout
 * 
 * Bottom tab navigation for attendees (Photo Passport).
 */

import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Image, Scan, Calendar, Bell, Archive, Gift, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, View, Text, StyleSheet } from 'react-native';

import { colors, fontSize } from '@/lib/theme';
import { useNotificationsStore } from '@/stores/notifications-store';
import { useAuthStore } from '@/stores/auth-store';

// Notification badge component
function NotificationBadge({ count }: { count: number }) {
  if (count === 0) return null;
  
  return (
    <View style={badgeStyles.container}>
      <Text style={badgeStyles.text}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: colors.background,
  },
  text: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});

export default function AttendeeLayout() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  const { unreadCount, fetchNotifications } = useNotificationsStore();
  
  // Fetch notifications on mount
  useEffect(() => {
    if (profile?.id) {
      fetchNotifications(profile.id);
    }
  }, [profile?.id]);
  
  // Calculate proper tab bar height with safe area
  const tabBarHeight = Platform.select({
    ios: 50 + insets.bottom,
    android: 60 + insets.bottom,
    default: 60,
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.secondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          // Ensure proper positioning
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
        // Add content padding to avoid overlap with tab bar
        sceneStyle: {
          paddingBottom: tabBarHeight,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Photos',
          tabBarIcon: ({ color, size }) => <Image size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Find',
          tabBarIcon: ({ color, size }) => <Scan size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ color, size }) => <Calendar size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Bell size={22} color={color} />
              <NotificationBadge count={unreadCount} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="drop-in"
        options={{
          title: 'Drop-In',
          tabBarIcon: ({ color, size }) => <Gift size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="drop-in/upload"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="drop-in/discover"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null, // Hide from tab bar, accessible via header avatar
        }}
      />
      <Tabs.Screen
        name="vault"
        options={{
          href: null, // Hide from tab bar, accessible via navigation
        }}
      />
    </Tabs>
  );
}

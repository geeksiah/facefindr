/**
 * Push Notifications Hook
 * 
 * Handles push notification registration and handling.
 */

import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { isCreatorUserType } from '@/lib/user-type';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

interface NotificationData {
  type: string;
  eventId?: string;
  photoId?: string;
  [key: string]: any;
}

export function useNotifications() {
  const router = useRouter();
  const { user, profile } = useAuthStore();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications().then((token) => {
      if (token) {
        setExpoPushToken(token);
        // Save token to database
        savePushToken(token);
      }
    });

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      setNotification(notification);
    });

    // Listen for notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [user]);

  const registerForPushNotifications = async (): Promise<string | null> => {
    if (!Device.isDevice) {
      console.log('Push notifications only work on physical devices');
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    const projectId =
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
      Constants.expoConfig?.extra?.eas?.projectId ||
      undefined;

    if (!projectId) {
      console.warn('Missing EAS project ID for push notifications. Set EXPO_PUBLIC_EAS_PROJECT_ID.');
      return null;
    }

    // Get Expo push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0ea5e9',
      });
    }

    return token.data;
  };

  const savePushToken = async (token: string) => {
    if (!user) return;

    try {
      await supabase
        .from('push_tokens')
        .upsert({
          user_id: user.id,
          token,
          platform: Platform.OS,
          device_name: Device.deviceName,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,token',
        });
    } catch (error) {
      console.error('Error saving push token:', error);
    }
  };

  const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as NotificationData;

    // Navigate based on notification type
    switch (data.type) {
      case 'photo_drop':
        if (data.eventId) {
          router.push(`/event/${data.eventId}` as any);
        }
        break;
      case 'purchase_complete':
        router.push('/(attendee)' as any);
        break;
      case 'payout_success':
        router.push('/(creator)' as any);
        break;
      default:
        // Default to notifications screen
        if (isCreatorUserType(profile?.userType)) {
          router.push('/(creator)' as any);
        } else {
          router.push('/(attendee)/notifications' as any);
        }
    }
  };

  const sendLocalNotification = async (
    title: string,
    body: string,
    data?: Record<string, any>
  ) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null, // Immediate
    });
  };

  const clearBadge = async () => {
    await Notifications.setBadgeCountAsync(0);
  };

  return {
    expoPushToken,
    notification,
    sendLocalNotification,
    clearBadge,
  };
}

/**
 * Push Notifications Hook
 * 
 * Handles push notification registration and permissions.
 */

import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationState {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  isRegistered: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const { user, profile } = useAuthStore();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    // Register for push notifications
    registerForPushNotifications();

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        setNotification(notification);
      }
    );

    // Listen for notification responses (taps)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationResponse(response);
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Save token to database when user is logged in
  useEffect(() => {
    if (user && expoPushToken) {
      savePushToken(expoPushToken);
    }
  }, [user, expoPushToken]);

  const registerForPushNotifications = async () => {
    try {
      if (!Device.isDevice) {
        setError('Push notifications only work on physical devices');
        return;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permissions if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setError('Push notification permission not granted');
        return;
      }

      // Get Expo push token
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      
      // Skip if projectId is not configured (development mode without EAS)
      if (!projectId) {
        console.log('Push notifications: No EAS projectId configured, skipping registration');
        setError('Push notifications require EAS projectId configuration');
        return;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });

      setExpoPushToken(token.data);
      setIsRegistered(true);

      // Configure Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0ea5e9',
        });

        await Notifications.setNotificationChannelAsync('photo_drops', {
          name: 'Photo Drops',
          description: 'Notifications when new photos of you are found',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#0ea5e9',
        });

        await Notifications.setNotificationChannelAsync('purchases', {
          name: 'Purchases',
          description: 'Notifications for photo purchases and downloads',
          importance: Notifications.AndroidImportance.DEFAULT,
        });

        await Notifications.setNotificationChannelAsync('promotions', {
          name: 'Promotions',
          description: 'Special offers and discounts',
          importance: Notifications.AndroidImportance.LOW,
        });
      }
    } catch (err) {
      console.error('Push notification registration error:', err);
      setError('Failed to register for push notifications');
    }
  };

  const savePushToken = async (token: string) => {
    try {
      const { error: upsertError } = await supabase
        .from('push_tokens')
        .upsert(
          {
            user_id: user?.id,
            token,
            platform: Platform.OS,
            device_name: Device.modelName || 'Unknown',
            last_active: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,token',
          }
        );

      if (upsertError) {
        console.error('Failed to save push token:', upsertError);
      }
    } catch (err) {
      console.error('Error saving push token:', err);
    }
  };

  const handleNotificationResponse = (
    response: Notifications.NotificationResponse
  ) => {
    const data = response.notification.request.content.data;

    // Handle navigation based on notification type
    // This would typically use the router
    console.log('Notification tapped:', data);
  };

  const scheduleLocalNotification = async (
    title: string,
    body: string,
    data?: Record<string, unknown>,
    trigger?: Notifications.NotificationTriggerInput
  ) => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: trigger || null,
    });
  };

  const clearBadge = async () => {
    await Notifications.setBadgeCountAsync(0);
  };

  const getBadgeCount = async () => {
    return await Notifications.getBadgeCountAsync();
  };

  return {
    expoPushToken,
    notification,
    isRegistered,
    error,
    scheduleLocalNotification,
    clearBadge,
    getBadgeCount,
  };
}

// Utility function to send push notification via API
export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}

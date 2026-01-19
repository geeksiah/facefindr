/**
 * Haptic Feedback Utilities
 * 
 * Provides consistent haptic feedback across the mobile app
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

/**
 * Haptic feedback types
 */
export enum HapticType {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
  Selection = 'selection',
}

/**
 * Cache key for haptic feedback preference
 */
const HAPTIC_PREFERENCE_KEY = 'haptic_feedback_enabled';

/**
 * Get haptic feedback preference
 * Checks SecureStore cache first, then database if needed
 */
async function getHapticPreference(): Promise<boolean> {
  try {
    // Check cache first
    const cached = await SecureStore.getItemAsync(HAPTIC_PREFERENCE_KEY);
    if (cached !== null) {
      return cached === 'true';
    }

    // Get user ID from auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      // Default to enabled if not logged in
      await SecureStore.setItemAsync(HAPTIC_PREFERENCE_KEY, 'true');
      return true;
    }

    // Fetch from database
    const { data } = await supabase
      .from('user_notification_preferences')
      .select('haptic_feedback_enabled')
      .eq('user_id', user.id)
      .single();

    const enabled = data?.haptic_feedback_enabled ?? true;
    
    // Cache the preference
    await SecureStore.setItemAsync(HAPTIC_PREFERENCE_KEY, enabled.toString());
    
    return enabled;
  } catch (error) {
    // Default to enabled on error
    console.debug('Error getting haptic preference:', error);
    return true;
  }
}

/**
 * Update haptic feedback preference cache
 * Called when user changes the setting
 */
export async function updateHapticPreferenceCache(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(HAPTIC_PREFERENCE_KEY, enabled.toString());
  } catch (error) {
    console.debug('Error updating haptic preference cache:', error);
  }
}

/**
 * Trigger haptic feedback
 * Only works on physical devices (iOS/Android)
 * Checks user preference before triggering
 */
export async function haptic(type: HapticType = HapticType.Light): Promise<void> {
  // Skip on web
  if (Platform.OS === 'web') return;

  // Check if haptic feedback is enabled
  const enabled = await getHapticPreference();
  if (!enabled) return;

  try {
    switch (type) {
      case HapticType.Light:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case HapticType.Medium:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case HapticType.Heavy:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case HapticType.Success:
        // Success: light impact + notification
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case HapticType.Warning:
        // Warning: medium impact + warning notification
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case HapticType.Error:
        // Error: heavy impact + error notification
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case HapticType.Selection:
        await Haptics.selectionAsync();
        break;
    }
  } catch (error) {
    // Silently fail if haptics are not available
    console.debug('Haptic feedback not available:', error);
  }
}

/**
 * Trigger haptic feedback for button press
 */
export async function buttonPress(): Promise<void> {
  await haptic(HapticType.Light);
}

/**
 * Trigger haptic feedback for successful action
 */
export async function success(): Promise<void> {
  await haptic(HapticType.Success);
}

/**
 * Trigger haptic feedback for error
 */
export async function error(): Promise<void> {
  await haptic(HapticType.Error);
}

/**
 * Trigger haptic feedback for warning
 */
export async function warning(): Promise<void> {
  await haptic(HapticType.Warning);
}

/**
 * Trigger haptic feedback for selection change
 */
export async function selection(): Promise<void> {
  await haptic(HapticType.Selection);
}

/**
 * Trigger haptic feedback for face detection
 */
export async function faceDetected(): Promise<void> {
  await haptic(HapticType.Light);
}

/**
 * Trigger haptic feedback when match found
 */
export async function matchFound(): Promise<void> {
  await haptic(HapticType.Success);
}

/**
 * Trigger haptic feedback when no match found
 */
export async function noMatch(): Promise<void> {
  await haptic(HapticType.Medium);
}

/**
 * Trigger haptic feedback for photo download
 */
export async function downloadComplete(): Promise<void> {
  await haptic(HapticType.Success);
}

/**
 * Trigger haptic feedback for notification
 */
export async function notification(): Promise<void> {
  await haptic(HapticType.Light);
}

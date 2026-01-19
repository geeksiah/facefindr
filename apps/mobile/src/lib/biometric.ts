/**
 * Biometric Authentication Utilities
 * 
 * Provides biometric (Face ID, Touch ID, Fingerprint) authentication
 * for secure app access.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Keys for secure storage
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const BIOMETRIC_ENROLLED_KEY = 'biometric_enrolled';

/**
 * Check if biometric authentication is available on this device
 */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return false;
  }
}

/**
 * Get the type of biometric authentication available
 */
export async function getBiometricType(): Promise<'face' | 'fingerprint' | 'iris' | 'none'> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'face';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'iris';
    }
    
    return 'none';
  } catch (error) {
    console.error('Error getting biometric type:', error);
    return 'none';
  }
}

/**
 * Get human-readable name for the biometric type
 */
export async function getBiometricName(): Promise<string> {
  const type = await getBiometricType();
  
  switch (type) {
    case 'face':
      return Platform.OS === 'ios' ? 'Face ID' : 'Face Recognition';
    case 'fingerprint':
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    case 'iris':
      return 'Iris Scan';
    default:
      return 'Biometric';
  }
}

/**
 * Check if user has enabled biometric authentication
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const enabled = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('Error checking biometric enabled:', error);
    return false;
  }
}

/**
 * Enable or disable biometric authentication
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled.toString());
    
    if (enabled) {
      // Mark as enrolled when enabled
      await SecureStore.setItemAsync(BIOMETRIC_ENROLLED_KEY, 'true');
    }
  } catch (error) {
    console.error('Error setting biometric enabled:', error);
    throw error;
  }
}

/**
 * Authenticate using biometrics
 * Returns true if successful, false otherwise
 */
export async function authenticateWithBiometric(
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if biometrics are available
    const available = await isBiometricAvailable();
    if (!available) {
      return { success: false, error: 'Biometric authentication not available' };
    }
    
    // Get biometric name for the prompt
    const biometricName = await getBiometricName();
    
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason || `Authenticate with ${biometricName}`,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false, // Allow PIN/password fallback
      fallbackLabel: 'Use Passcode',
    });
    
    if (result.success) {
      return { success: true };
    }
    
    // Handle different error cases
    if (result.error === 'user_cancel') {
      return { success: false, error: 'Authentication cancelled' };
    }
    if (result.error === 'user_fallback') {
      return { success: false, error: 'User chose passcode fallback' };
    }
    if (result.error === 'lockout') {
      return { success: false, error: 'Too many failed attempts. Please try again later.' };
    }
    if (result.error === 'not_enrolled') {
      return { success: false, error: 'No biometrics enrolled on this device' };
    }
    
    return { success: false, error: result.error || 'Authentication failed' };
  } catch (error: any) {
    console.error('Biometric authentication error:', error);
    return { success: false, error: error.message || 'Authentication failed' };
  }
}

/**
 * Authenticate for app unlock
 * Uses biometrics if enabled, otherwise returns true (no auth required)
 */
export async function authenticateForAppUnlock(): Promise<boolean> {
  try {
    const enabled = await isBiometricEnabled();
    if (!enabled) {
      return true; // No biometric auth required
    }
    
    const result = await authenticateWithBiometric('Unlock FaceFindr');
    return result.success;
  } catch (error) {
    console.error('App unlock authentication error:', error);
    return false;
  }
}

/**
 * Authenticate for sensitive action (e.g., viewing payment info)
 */
export async function authenticateForSensitiveAction(
  actionDescription: string
): Promise<boolean> {
  try {
    const available = await isBiometricAvailable();
    if (!available) {
      return true; // Allow action if biometrics not available
    }
    
    const result = await authenticateWithBiometric(actionDescription);
    return result.success;
  } catch (error) {
    console.error('Sensitive action authentication error:', error);
    return false;
  }
}

/**
 * Prompt user to enable biometric authentication
 * Returns true if user enabled it
 */
export async function promptEnableBiometric(): Promise<boolean> {
  try {
    const available = await isBiometricAvailable();
    if (!available) {
      return false;
    }
    
    // Try to authenticate to verify biometrics work
    const result = await authenticateWithBiometric('Enable biometric login');
    
    if (result.success) {
      await setBiometricEnabled(true);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error enabling biometric:', error);
    return false;
  }
}

/**
 * Get security level of biometric authentication
 */
export async function getSecurityLevel(): Promise<LocalAuthentication.SecurityLevel> {
  try {
    return await LocalAuthentication.getEnrolledLevelAsync();
  } catch (error) {
    console.error('Error getting security level:', error);
    return LocalAuthentication.SecurityLevel.NONE;
  }
}

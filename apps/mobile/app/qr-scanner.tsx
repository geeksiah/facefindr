/**
 * QR Code Scanner Screen
 * 
 * Scans event QR codes for quick access.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  BackHandler,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, CameraView } from 'expo-camera';
import { X, Flashlight, FlashlightOff, AlertCircle } from 'lucide-react-native';

import { isSupportedAppScheme } from '@/lib/deep-link';
import { getApiBaseUrl } from '@/lib/api-base';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { buttonPress, matchFound, error as hapticError } from '@/lib/haptics';

const { width, height } = Dimensions.get('window');
const SCAN_AREA_SIZE = width * 0.7;
const API_URL = getApiBaseUrl();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ScanScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Navigate back - use router.back() for natural navigation
  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // Fallback to attendee home if no history
      router.replace('/(attendee)');
    }
  }, [router]);

  // Handle Android back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showError) {
        setShowError(false);
        setScanned(false);
        return true;
      }
      goBack();
      return true;
    });
    return () => backHandler.remove();
  }, [goBack, showError]);

  const handleTryAgain = async () => {
    await buttonPress();
    setShowError(false);
    setScanned(false);
  };

  const handleCancel = async () => {
    await buttonPress();
    setShowError(false);
    // Use setTimeout to ensure modal is closed before navigation
    setTimeout(() => {
      goBack();
    }, 100);
  };

  const resolveEventId = useCallback(async (eventKey: string, code?: string) => {
    const trimmed = eventKey.trim();
    if (!trimmed) {
      return null;
    }

    if (UUID_PATTERN.test(trimmed)) {
      return trimmed;
    }

    try {
      const params = new URLSearchParams();
      if (code) params.set('code', code);
      const qs = params.toString();
      const res = await fetch(
        `${API_URL}/api/events/public/${encodeURIComponent(trimmed)}${qs ? `?${qs}` : ''}`
      );
      if (!res.ok) return null;
      const payload = await res.json();
      return payload?.event?.id || null;
    } catch (error) {
      console.error('Failed to resolve event from QR payload:', error);
      return null;
    }
  }, []);

  const navigateFromEventKey = useCallback(
    async (eventKey: string, accessCode?: string) => {
      const resolvedId = await resolveEventId(eventKey, accessCode);
      if (resolvedId) {
        await matchFound();
        router.replace(`/event/${resolvedId}` as any);
        return true;
      }

      if (/^\d{6}$/.test(eventKey)) {
        await matchFound();
        router.replace({
          pathname: '/enter-code',
          params: { code: eventKey },
        } as any);
        return true;
      }

      return false;
    },
    [resolveEventId, router]
  );

  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    // Parse the QR code data
    // Expected formats:
    // - https://{domain}/e/[slug]
    // - https://{domain}/s/[code]
    // - ferchr://event/[id] (legacy: facefindr://event/[id])
    // - Any URL with /e/ or /s/ path patterns

    try {
      const payload = (data || '').trim();
      if (!payload) {
        throw new Error('Empty QR payload');
      }

      // Allow direct six-digit event codes.
      if (/^\d{6}$/.test(payload)) {
        await matchFound();
        router.replace({
          pathname: '/enter-code',
          params: { code: payload },
        } as any);
        return;
      }

      const url = new URL(payload);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const isCustomScheme = isSupportedAppScheme(url.protocol);
      const host = url.hostname.toLowerCase();
      const code = url.searchParams.get('code') || undefined;
      
      // Event slug link - /e/[slug]
      if (pathParts[0] === 'e' && pathParts[1]) {
        const ok = await navigateFromEventKey(pathParts[1], code);
        if (ok) return;
      }

      // Short link - /s/[code]
      if (pathParts[0] === 's' && pathParts[1]) {
        const ok = await navigateFromEventKey(pathParts[1], code);
        if (ok) return;
      }

      // Direct event path - /event/[id|slug]
      if (pathParts[0] === 'event' && pathParts[1]) {
        const ok = await navigateFromEventKey(pathParts[1], code);
        if (ok) return;
      }

      // Custom scheme: ferchr://event/[id|slug]
      if (isCustomScheme && host === 'event' && pathParts[0]) {
        const ok = await navigateFromEventKey(pathParts[0], code);
        if (ok) return;
      }

      // Custom scheme: ferchr://s/[code]
      if (isCustomScheme && host === 's' && pathParts[0]) {
        const ok = await navigateFromEventKey(pathParts[0], code);
        if (ok) return;
      }

      // Custom scheme: ferchr://e/[slug]
      if (isCustomScheme && host === 'e' && pathParts[0]) {
        const ok = await navigateFromEventKey(pathParts[0], code);
        if (ok) return;
      }

      // Custom scheme fallback: ferchr://<eventIdOrSlug>
      if (isCustomScheme && pathParts[0]) {
        const ok = await navigateFromEventKey(pathParts[0], code);
        if (ok) return;
      }

      // Standard URL fallback: try host as marker, then first path segment.
      if (!isCustomScheme && pathParts[0]) {
        const ok = await navigateFromEventKey(pathParts[0], code);
        if (ok) return;
      }

      throw new Error('Invalid QR code');
    } catch (primaryError) {
      try {
        // Secondary fallback for plain slugs or short codes that are not valid URLs.
        const plainPayload = (data || '').trim();
        const ok = await navigateFromEventKey(plainPayload);
        if (ok) {
          return;
        }
      } catch (fallbackError) {
        console.error('QR fallback parsing error:', fallbackError);
      }

      await hapticError(); // Haptic feedback for error
      setShowError(true);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          Camera access is required to scan QR codes.
        </Text>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={goBack}
        >
          <Text style={styles.permissionButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={flashEnabled}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top */}
        <View style={styles.overlaySection} />
        
        {/* Middle */}
        <View style={styles.middleRow}>
          <View style={styles.overlaySection} />
          <View style={styles.scanArea}>
            {/* Corner Markers */}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.overlaySection} />
        </View>
        
        {/* Bottom */}
        <View style={styles.overlaySection}>
          <Text style={styles.instructionText}>
            Point your camera at an event QR code
          </Text>
        </View>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={goBack}
        >
          <X size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setFlashEnabled(!flashEnabled)}
        >
          {flashEnabled ? (
            <Flashlight size={24} color="#fff" />
          ) : (
            <FlashlightOff size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Error Modal - Custom component instead of system Alert */}
      <Modal
        visible={showError}
        transparent
        animationType="fade"
        onRequestClose={handleTryAgain}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIcon}>
              <AlertCircle size={32} color="#ef4444" />
            </View>
            <Text style={styles.modalTitle}>Invalid QR Code</Text>
            <Text style={styles.modalMessage}>
              This QR code is not recognized. Please scan a valid event QR code.
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonSecondary,
                  pressed && styles.modalButtonPressed,
                ]}
                onPress={handleCancel}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  styles.modalButtonPrimary,
                  pressed && styles.modalButtonPressed,
                ]}
                onPress={handleTryAgain}
              >
                <Text style={styles.modalButtonTextPrimary}>Try Again</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  overlaySection: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  middleRow: {
    flexDirection: 'row',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.accent,
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  instructionText: {
    color: '#fff',
    fontSize: fontSize.base,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  permissionText: {
    color: '#fff',
    fontSize: fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  permissionButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ef444415',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent,
  },
  modalButtonSecondary: {
    backgroundColor: colors.muted,
  },
  modalButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  modalButtonTextPrimary: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: '#fff',
  },
  modalButtonTextSecondary: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
});

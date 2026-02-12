/**
 * QR Code Profile Screen
 * 
 * Displays user's FaceTag as a QR code for easy sharing.
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Share,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ArrowLeft, Share2, Copy, Check, Download } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import Svg, { Rect, SvgXml } from 'react-native-svg';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

// QR Logo SVG content (embedded for reliable loading)
const QR_LOGO_SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg width="100%" height="100%" viewBox="0 0 4267 4267" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;"><g><path d="M1208.02,3293.746c-0.087,77.6 3.32,88.936 -10.073,89.006c-19.762,0.104 -277.383,0.661 -277.383,0.661l-0.644,-120.186l-101.474,0.427c0,0 0.329,-468.722 -0.215,-1194.902c-0.196,-261.074 -0.005,-656.41 0.431,-658.356c3.378,-15.067 97.354,3.42 100.313,-12.443c2.439,-13.072 -4.619,-166.55 4.13,-170.419c6.826,-3.018 97.024,4.187 100.322,-4.367c2.97,-7.701 -2.678,-128.238 3.486,-133.8c4.632,-4.18 107.388,1.625 112.568,-4.031c4.452,-4.861 -2.934,-93.6 5.047,-98.131c6.429,-3.651 139.433,4.825 142.743,-5.185c3.558,-10.761 -5.219,-86.298 6.208,-89.257c12.139,-3.143 231.07,4.852 236.243,-3.84c3.826,-6.43 -5.633,-77.077 5.957,-81.516c0.016,-0.006 1359.117,-0.128 1583.069,0.063c70.997,0.06 170.221,-0.182 170.221,-0.182l4.142,87.057l154.549,2.519c0,0 -0.218,185.133 0.011,242.721c0.008,1.942 0.089,22.328 -4.336,23.887c-8.647,3.048 -1776.327,-2.511 -1780.88,2.82c-5.305,6.21 3.508,82.938 -5.961,86.364c-10.348,3.744 -222.615,-4.472 -228.681,3.98c-4.581,6.383 6.589,79.739 -8.914,80.248c-46.161,1.516 -109.301,-5.328 -109.729,6.69c-1.099,30.876 3.572,136.764 -3.55,140.746c-7.104,3.972 -94.174,-2.748 -97.299,6.033c-2.97,8.344 -0.518,1659.12 -0.303,1803.391Z" style="fill:#232322;"/><path d="M1975.495,2689.589c0.086,42.497 -0.131,603.617 -0.131,603.617l-88.2,2.806l0.213,86.878c0,0 -82.985,0.035 -118.627,0.036c-162.066,0.006 -164.734,-0.32 -165.9,-6.025c-0.093,-0.457 -0.492,-836.673 -0.492,-836.673l80.997,-2.534l-3.651,-168.01c0,0 100.374,0.159 100.744,-0.334c0.363,-0.485 1.865,-97.089 1.865,-97.089c0,0 69.897,-0.733 232.271,-0.748c466.666,0.056 887.502,-1.382 1354.166,0.167c15.821,0.053 11.265,75.741 11.265,75.741l67.854,4.797c0,0 1.711,271.687 -2.899,276.168c-5.863,5.7 -1460.417,-1.652 -1467.025,3.901c-3.551,2.984 -2.407,35.096 -2.449,57.3Z" style="fill:#232323;"/><path d="M2818.756,1521.097c371.557,-0.254 371.253,0.582 512.497,-0.061c101.12,-0.46 115.127,-1.35 115.994,6.177c0.118,1.022 0.514,228.631 0.514,228.631l-125.663,2.338l-0.834,109.762c0,0 -363.943,-0.097 -844.179,0.151c-69.33,0.036 -846.072,0.437 -866.631,0.011c-11.635,-0.241 -7.998,-7.312 -8.863,-203.519c-0.17,-38.559 -2.48,-57.884 8.838,-58.086c31.663,-0.565 31.206,0.481 62.491,-0.199c14.512,-0.315 9.611,-32.595 9.709,-58.379c0.008,-2.198 0.099,-26.294 6.651,-26.657c3.375,-0.187 1112.699,-0.396 1129.477,-0.168Z" style="fill:#232323;"/><path d="M2368.794,3382.861c-1.376,-0.227 -13.969,3.558 -14.02,-9.911c-0.076,-20.003 -0.47,-124.236 -0.12,-250.044c0.038,-13.665 -3.482,-46.09 5.624,-46.562c29.365,-1.523 81.766,5.364 82.218,-7.72c2.215,-64.133 -4.906,-72.294 9.496,-72.478c45.623,-0.581 913.997,0.191 913.997,0.191c0,0 28.903,0.029 48.599,0.051c2.597,0.003 30.345,0.034 32.375,2.378c4.733,5.462 1.57,307.481 1.57,307.481l-82.506,2.074l-1.452,74.564c0,0 -665.242,-0.016 -995.78,-0.024Z" style="fill:#1f8efd;"/></g></svg>`;

// QR Logo component - uses embedded SVG for reliable rendering
function QRLogo({ size }: { size: number }) {
  return (
    <SvgXml 
      xml={QR_LOGO_SVG} 
      width={size} 
      height={size}
    />
  );
}

// QR Code with logo in center
function QRCodeWithLogo({ value, size }: { value: string; size: number }) {
  const cellSize = size / 25; // 25x25 grid for better detail
  const logoSize = size * 0.32; // Logo takes ~32% of QR code size (increased for better visibility)
  const logoOffset = (size - logoSize) / 2;
  
  // Generate QR pattern (simplified - use react-native-qrcode-svg in production)
  const pattern = [];
  const clearZone = { 
    start: Math.floor(25 * 0.32), 
    end: Math.ceil(25 * 0.68) 
  };

  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      // Skip center area for logo
      if (x >= clearZone.start && x <= clearZone.end && 
          y >= clearZone.start && y <= clearZone.end) {
        continue;
      }

      // Position detection patterns (corners) - standard QR format
      const isFinderPattern =
        (x < 7 && y < 7) || // Top-left
        (x >= 18 && y < 7) || // Top-right
        (x < 7 && y >= 18); // Bottom-left

      if (isFinderPattern) {
        // Finder pattern logic
        const isTopLeft = x < 7 && y < 7;
        const isTopRight = x >= 18 && y < 7;
        const isBottomLeft = x < 7 && y >= 18;

        let localX = x;
        let localY = y;
        if (isTopRight) localX = x - 18;
        if (isBottomLeft) localY = y - 18;

        // Outer border
        if (localX === 0 || localX === 6 || localY === 0 || localY === 6) {
          pattern.push({ x, y });
        }
        // Inner square
        else if (localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4) {
          pattern.push({ x, y });
        }
      } else {
        // Data area - pseudo-random based on value
        const seed = value.charCodeAt(x % value.length) + 
                     value.charCodeAt(y % value.length);
        const hash = (x * 37 + y * 23 + seed) % 5;
        if (hash < 2) {
          pattern.push({ x, y });
        }
      }
    }
  }

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill="#ffffff" rx={8} />
        {pattern.map((cell, i) => (
          <Rect
            key={i}
            x={cell.x * cellSize + 2}
            y={cell.y * cellSize + 2}
            width={cellSize - 1}
            height={cellSize - 1}
            rx={2}
            fill={colors.foreground}
          />
        ))}
      </Svg>
      {/* Logo overlay in center - using qr-logo.svg */}
      <View style={[
        styles.logoContainer,
        {
          width: logoSize,
          height: logoSize,
          left: logoOffset,
          top: logoOffset,
        }
      ]}>
        <QRLogo size={logoSize * 0.9} />
      </View>
    </View>
  );
}

export default function QRCodeScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [isCopied, setIsCopied] = useState(false);
  const qrCodeRef = useRef<View>(null);

  const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.example.com';
  const profileUrl = `${baseUrl}/u/${profile?.faceTag?.replace('@', '')}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(profileUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const captureQRCodeImage = async (): Promise<string | null> => {
    if (!qrCodeRef.current) return null;
    
    try {
      const uri = await captureRef(qrCodeRef.current, {
        format: 'png',
        quality: 1.0,
        result: 'tmpfile',
      });
      return uri;
    } catch (error) {
      console.error('Failed to capture QR code:', error);
      return null;
    }
  };

  const handleShare = async () => {
    try {
      // Capture QR code with logo as image
      const qrImageUri = await captureQRCodeImage();
      
      if (qrImageUri && (await Sharing.isAvailableAsync())) {
        // Share the QR code image with logo
        await Sharing.shareAsync(qrImageUri, {
          mimeType: 'image/png',
          dialogTitle: 'Share QR Code',
        });
      } else {
        // Fallback to text sharing if image sharing is not available
        await Share.share({
          message: `Find me on FaceFindr!\n${profile?.faceTag}\n${profileUrl}`,
          url: profileUrl,
        });
      }
    } catch (error) {
      console.error('Share error:', error);
      // Fallback to text sharing on error
      try {
        await Share.share({
          message: `Find me on FaceFindr!\n${profile?.faceTag}\n${profileUrl}`,
          url: profileUrl,
        });
      } catch (fallbackError) {
        console.error('Fallback share error:', fallbackError);
      }
    }
  };

  const handleDownload = async () => {
    try {
      const qrImageUri = await captureQRCodeImage();
      if (!qrImageUri) {
        console.error('Failed to capture QR code');
        return;
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(qrImageUri, {
          mimeType: 'image/png',
          dialogTitle: 'Save QR Code',
        });
      } else {
        // On platforms where sharing isn't available, copy the file path
        await Clipboard.setStringAsync(qrImageUri);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'My QR Code',
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerLeft: () => (
            <Pressable 
              onPress={() => router.back()}
              style={({ pressed }) => pressed && styles.pressed}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={24} color={colors.foreground} />
            </Pressable>
          ),
        }}
      />

      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* QR Code Card */}
          <Card style={styles.qrCard}>
            <Text style={styles.faceTag}>{profile?.faceTag}</Text>
            <Text style={styles.userName}>{profile?.displayName}</Text>
            
            <View style={styles.qrContainer}>
              <QRCodeWithLogo value={profileUrl} size={220} />
            </View>

            <Text style={styles.hint}>
              Scan this code to view my profile
            </Text>
          </Card>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
              onPress={handleShare}
            >
              <Share2 size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Share QR Code</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
              onPress={handleDownload}
            >
              <Download size={20} color={colors.accent} />
              <Text style={styles.secondaryButtonText}>
                Download QR Code
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.secondaryButtonPressed,
              ]}
              onPress={handleCopy}
            >
              {isCopied ? (
                <Check size={20} color="#10b981" />
              ) : (
                <Copy size={20} color={colors.accent} />
              )}
              <Text style={[
                styles.secondaryButtonText,
                isCopied && { color: '#10b981' }
              ]}>
                {isCopied ? 'Copied!' : 'Copy Link'}
              </Text>
            </Pressable>
          </View>

          {/* Info */}
          <View style={styles.infoSection}>
            <Text style={styles.infoTitle}>How to use</Text>
            <Text style={styles.infoText}>
              • Share this QR code with photographers{'\n'}
              • They can scan it to add you to their events{'\n'}
              • You'll automatically receive photos of you
            </Text>
          </View>
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
  content: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCard: {
    alignItems: 'center',
    padding: spacing.xl,
    width: '100%',
    maxWidth: 320,
  },
  faceTag: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: spacing.lg,
  },
  qrContainer: {
    padding: spacing.md,
    backgroundColor: '#ffffff',
    borderRadius: borderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  logoContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  actions: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonPressed: {
    backgroundColor: colors.muted,
    transform: [{ scale: 0.98 }],
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
  infoSection: {
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 320,
  },
  infoTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    lineHeight: 22,
  },
});

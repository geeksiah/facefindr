/**
 * QR Code Profile Screen
 * 
 * Displays user's FaceTag as a QR code for easy sharing.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Share,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ArrowLeft, Share2, Copy, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect, Path, G } from 'react-native-svg';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

// FaceFindr Icon SVG component (no background)
function FaceFindrIcon({ size, color = '#1a1a1a' }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1606 1605">
      <G>
        <Path
          d="M494.238,16.691c40.408,-6.617 63.357,-16.587 168.185,-16.487c869.402,0.834 829.53,-0.583 905.12,-0.102c35.601,0.226 33.364,14.094 33.25,40.922c-0.254,60.034 0.215,59.935 0.084,119.902c-0.113,51.809 -0.016,52.043 -2.608,56.721c-8.202,14.797 -25.574,12.466 -27.877,12.465l-482.627,-0.287c-438.462,0.337 -438.529,-1.063 -485.24,3.019c-35.382,3.092 -84.218,14.889 -99.721,20.136c-111.89,37.868 -164.455,104.027 -165.526,105.179c-28.617,30.753 -48.33,69.875 -51.364,76.952c-19.777,46.123 -22.002,58.557 -30.437,97.202c-7.077,32.425 -10.901,99.218 -10.879,102.493c0.246,35.716 0.081,35.614 -0.084,71.353c-1.168,252.157 0.326,252.125 -0.13,274.044c-0.476,22.885 0.068,392.748 -0.34,561.625c-0.09,37.355 2.241,50.857 -15.993,58.778c-7.881,3.424 -19.509,4.364 -170.806,3.317c-19.855,-0.137 -54.488,4.346 -57.239,-24.978c-0.05,-0.534 0.261,-120.818 0.288,-131.324c1.611,-622.532 -0.958,-775.946 1.484,-830.02c0.965,-21.38 1.362,-21.283 4.73,-59.823c2.059,-23.563 3.16,-23.368 5.888,-45.62c5.168,-42.146 26.045,-115.098 43.887,-154.685c16.575,-36.778 65.417,-154.279 212.79,-249.841c35.031,-22.715 76.664,-42.767 87.617,-47.303c62.458,-25.867 73.967,-28.324 137.549,-43.639Zm875.266,906.144c16.67,-0.008 203.263,-0.092 211.21,0.045c11.408,0.196 21.973,7.722 24.399,19.337c0.884,4.234 0.096,114.206 0.396,165.415c0.083,14.124 4.395,42.245 -27.63,42.287c-77.874,0.102 -345.842,0.667 -811.504,-0.228c-35.518,-0.068 -33.383,29.859 -33.438,37.86c-0.532,77.592 0.247,43.446 -0.237,348.435c-0.064,40.072 2.868,57.686 -17.927,64.986c-6.452,2.265 -9.471,3.325 -85.424,3.087c-94.217,-0.294 -104.837,0.556 -117.205,-1.452c-2.466,-0.4 -20.666,-3.354 -23.232,-20.86c-0.047,-0.318 0.347,-573.164 0.108,-614.082c-0.073,-12.457 -4.354,-42.129 23.399,-44.699c3.006,-0.278 775.337,-0.144 857.085,-0.132Zm219.808,-461.109c9.218,2.221 14.838,8.236 14.838,23.008l0,177.344c0,31.521 -25.591,27.933 -57.112,27.933l-1057.976,0l0,-73.496c0,0 -9.317,-153.431 126.151,-153.305l974.099,-1.485Z"
          fill={color}
        />
        <Path
          d="M1603.118,1406.947l0,170.888c0,14.648 -11.892,26.539 -26.539,26.539l-570.092,0c-14.648,0 -26.539,-11.892 -26.539,-26.539l0,-170.888c0,-14.648 11.892,-26.539 26.539,-26.539l570.092,0c14.648,0 26.539,11.892 26.539,26.539Z"
          fill="#0a84ff"
        />
      </G>
    </Svg>
  );
}

// QR Code with logo in center
function QRCodeWithLogo({ value, size }: { value: string; size: number }) {
  const cellSize = size / 25; // 25x25 grid for better detail
  const logoSize = size * 0.28; // Logo takes ~28% of QR code size (increased from 22%)
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
      {/* Logo overlay in center - no background, using SVG icon */}
      <View style={[
        styles.logoContainer,
        {
          width: logoSize,
          height: logoSize,
          left: logoOffset,
          top: logoOffset,
        }
      ]}>
        <FaceFindrIcon size={logoSize * 0.9} />
      </View>
    </View>
  );
}

export default function QRCodeScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [isCopied, setIsCopied] = useState(false);

  const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.example.com';
  const profileUrl = `${baseUrl}/u/${profile?.faceTag?.replace('@', '')}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(profileUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Find me on FaceFindr!\n${profile?.faceTag}\n${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
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

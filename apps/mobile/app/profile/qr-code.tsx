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
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { ArrowLeft, Share2, Copy, Download } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Rect, Path } from 'react-native-svg';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

// Simple QR code component using react-native-svg
// In production, you'd use a library like 'react-native-qrcode-svg'
function SimpleQRCode({ value, size }: { value: string; size: number }) {
  // This is a placeholder - in real app, use a proper QR library
  const cellSize = size / 21;
  
  // Generate a simple pattern based on the value
  const pattern = [];
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      // Position detection patterns (corners)
      const isFinderPattern =
        (x < 7 && y < 7) || // Top-left
        (x >= 14 && y < 7) || // Top-right
        (x < 7 && y >= 14); // Bottom-left

      // Create a pseudo-random pattern based on position and value
      const hash = (x * 31 + y * 17 + value.length) % 3;
      
      if (isFinderPattern) {
        const isOuter = x === 0 || x === 6 || y === 0 || y === 6 ||
          x === 14 || x === 20 || y === 14;
        const isInner = (x >= 2 && x <= 4 && y >= 2 && y <= 4) ||
          (x >= 16 && x <= 18 && y >= 2 && y <= 4) ||
          (x >= 2 && x <= 4 && y >= 16 && y <= 18);
        
        if (isOuter || isInner) {
          pattern.push({ x, y });
        }
      } else if (hash === 0) {
        pattern.push({ x, y });
      }
    }
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Rect x={0} y={0} width={size} height={size} fill={colors.background} />
      {pattern.map((cell, i) => (
        <Rect
          key={i}
          x={cell.x * cellSize}
          y={cell.y * cellSize}
          width={cellSize}
          height={cellSize}
          fill={colors.foreground}
        />
      ))}
    </Svg>
  );
}

export default function QRCodeScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const [isCopied, setIsCopied] = useState(false);

  const profileUrl = `https://facefindr.com/u/${profile?.faceTag?.replace('@', '')}`;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(profileUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    Alert.alert('Copied', 'Profile link copied to clipboard');
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
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft size={24} color={colors.foreground} />
            </TouchableOpacity>
          ),
        }}
      />

      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          {/* QR Code Card */}
          <Card style={styles.qrCard}>
            <Text style={styles.faceTag}>{profile?.faceTag}</Text>
            
            <View style={styles.qrContainer}>
              <SimpleQRCode value={profileUrl} size={220} />
            </View>

            <Text style={styles.hint}>
              Scan this code to view my FaceFindr profile
            </Text>
          </Card>

          {/* Actions */}
          <View style={styles.actions}>
            <Button onPress={handleShare} fullWidth>
              <Share2 size={20} color="#fff" />
              {' Share'}
            </Button>

            <Button variant="outline" onPress={handleCopy} fullWidth>
              <Copy size={20} color={colors.accent} />
              {isCopied ? ' Copied!' : ' Copy Link'}
            </Button>
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
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.accent,
    fontFamily: 'monospace',
    marginBottom: spacing.lg,
  },
  qrContainer: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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

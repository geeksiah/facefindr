/**
 * Photo Viewer Screen
 * 
 * Full-screen photo view with purchase/download options.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {
  ArrowLeft,
  Share2,
  Download,
  Heart,
  ShoppingCart,
  Check,
  X,
} from 'lucide-react-native';

import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';
import { formatPrice } from '@/lib/currency';
import { getThumbnailUrl, getSignedUrl } from '@/lib/storage-urls';
import { alertMissingPublicAppUrl, buildPublicUrl, getPublicAppUrl } from '@/lib/runtime-config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PhotoDetails {
  id: string;
  storagePath: string;
  fullUrl: string;
  thumbnailUrl: string;
  watermarkedUrl: string;
  eventName: string;
  eventId: string;
  photographerName: string;
  photographerId: string;
  isOwned: boolean;
  price: number;
  currency: string;
  createdAt: string;
}

export default function PhotoViewerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, session } = useAuthStore();

  const [photo, setPhoto] = useState<PhotoDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [displayUrl, setDisplayUrl] = useState<string>('');

  useEffect(() => {
    const loadPhoto = async () => {
      try {
        const { data: mediaData } = await supabase
          .from('media')
          .select(`
            id,
            storage_path,
            thumbnail_path,
            watermarked_path,
            created_at,
            event:event_id (
              id,
              name
            ),
            photographer:photographer_id (
              id,
              display_name
            )
          `)
          .eq('id', id)
          .single();

        // Check if user owns this photo
        const { data: entitlement } = await supabase
          .from('entitlements')
          .select('id')
          .eq('media_id', id)
          .eq('attendee_id', profile?.id)
          .single();

        // Get pricing
        const { data: pricing } = await supabase
          .from('event_pricing')
          .select('price_per_media, currency')
          .eq('event_id', (mediaData?.event as any)?.id)
          .single();

        if (mediaData) {
          // Get signed URLs for images
          const fullUrl = await getSignedUrl('media', mediaData.storage_path);
          const thumbnailUrl = await getThumbnailUrl(mediaData.thumbnail_path, mediaData.storage_path);
          const watermarkedUrl = mediaData.watermarked_path 
            ? await getSignedUrl('media', mediaData.watermarked_path)
            : thumbnailUrl;

          const photoData = {
            id: mediaData.id,
            storagePath: mediaData.storage_path,
            fullUrl: fullUrl || '',
            thumbnailUrl: thumbnailUrl || '',
            watermarkedUrl: watermarkedUrl || '',
            eventName: (mediaData.event as any)?.name || 'Unknown Event',
            eventId: (mediaData.event as any)?.id,
            photographerName: (mediaData.photographer as any)?.display_name || 'Unknown',
            photographerId: (mediaData.photographer as any)?.id,
            isOwned: !!entitlement,
            price: pricing?.price_per_media || 299,
            currency: pricing?.currency || 'USD',
            createdAt: mediaData.created_at,
          };

          setPhoto(photoData);

          // Set display URL based on ownership
          if (photoData.isOwned) {
            setDisplayUrl(photoData.fullUrl);
          } else {
            setDisplayUrl(photoData.watermarkedUrl || photoData.thumbnailUrl);
          }
        }
      } catch (err) {
        console.error('Error loading photo:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPhoto();
  }, [id, profile?.id]);

  const handleShare = async () => {
    const shareUrl = buildPublicUrl(`/photo/${id}`);
    if (!shareUrl) {
      alertMissingPublicAppUrl();
      return;
    }

    try {
      await Share.share({
        message: `Check out this photo from ${photo?.eventName} on Ferchr!`,
        url: shareUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleDownload = async () => {
    if (!photo?.isOwned) {
      Alert.alert(
        'Purchase Required',
        'You need to purchase this photo before downloading.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Purchase', onPress: handlePurchase },
        ]
      );
      return;
    }

    setIsDownloading(true);

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to save photos.');
        return;
      }

      // Get full resolution URL
      const { data } = await supabase.storage
        .from('media')
        .createSignedUrl(photo.storagePath, 3600);

      if (!data?.signedUrl) {
        throw new Error('Failed to get download URL');
      }

      // Download to local file system
      const fileName = `Ferchr_${photo.id}.jpg`;
      const fileUri = FileSystem.documentDirectory + fileName;
      
      await FileSystem.downloadAsync(data.signedUrl, fileUri);

      // Save to camera roll
      await MediaLibrary.saveToLibraryAsync(fileUri);

      Alert.alert('Downloaded', 'Photo saved to your camera roll!');
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Download Failed', 'Failed to download the photo. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePurchase = async () => {
    setIsPurchasing(true);

    try {
      // Navigate to checkout with single photo
      router.push({
        pathname: '/checkout',
        params: {
          eventId: photo?.eventId,
          photoIds: id,
        },
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const toggleFavorite = async () => {
    const nextValue = !isFavorite;
    setIsFavorite(nextValue);

    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        alertMissingPublicAppUrl();
        setIsFavorite(!nextValue);
        return;
      }

      await fetch(`${baseUrl}/api/vault`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          mediaId: photo?.id,
          eventId: photo?.eventId,
          isFavorite: nextValue,
        }),
      });
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!photo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <X size={48} color={colors.destructive} />
          <Text style={styles.errorText}>Photo not found</Text>
          <Button onPress={() => router.back()} fullWidth>Go Back</Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '',
          headerTransparent: true,
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <ArrowLeft size={24} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={toggleFavorite} style={styles.headerButton}>
                <Heart
                  size={24}
                  color="#fff"
                  fill={isFavorite ? colors.destructive : 'transparent'}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
                <Share2 size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <View style={styles.container}>
        {/* Photo */}
        {displayUrl ? (
          <Image
            source={{ uri: displayUrl }}
            style={styles.photo}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        )}

        {/* Info Overlay */}
        <View style={styles.infoOverlay}>
          <TouchableOpacity
            style={styles.eventInfo}
            onPress={() => router.push(`/event/${photo.eventId}`)}
          >
            <Text style={styles.eventName} numberOfLines={1}>
              {photo.eventName}
            </Text>
            <Text style={styles.photographerName}>
              by {photo.photographerName}
            </Text>
          </TouchableOpacity>

          {/* Action Buttons */}
          {photo.isOwned ? (
            <Button
              onPress={handleDownload}
              loading={isDownloading}
              style={styles.actionButton}
            >
              <Download size={20} color="#fff" />
              {' Download'}
            </Button>
          ) : (
            <View style={styles.purchaseContainer}>
              <Text style={styles.priceText}>
                {formatPrice(photo.price / 100, photo.currency || 'USD')}
              </Text>
              <Button
                onPress={handlePurchase}
                loading={isPurchasing}
              >
                <ShoppingCart size={20} color="#fff" />
                {' Purchase'}
              </Button>
            </View>
          )}
        </View>

        {/* Owned Badge */}
        {photo.isOwned && (
          <View style={styles.ownedBadge}>
            <Check size={16} color="#fff" />
            <Text style={styles.ownedText}>Purchased</Text>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.foreground,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
  },
  photo: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl + 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  eventInfo: {
    marginBottom: spacing.md,
  },
  eventName: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: '#fff',
  },
  photographerName: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
  },
  actionButton: {
    alignSelf: 'stretch',
  },
  purchaseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: '#fff',
  },
  ownedBadge: {
    position: 'absolute',
    top: 100,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  ownedText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#fff',
  },
});

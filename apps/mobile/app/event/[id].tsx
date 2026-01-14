/**
 * Event Detail Screen
 * 
 * Shows event photos with purchase options.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  Share2,
  Calendar,
  MapPin,
  Image as ImageIcon,
  Scan,
  ShoppingCart,
  Heart,
  Download,
  Check,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;

interface Event {
  id: string;
  name: string;
  description: string | null;
  eventDate: string;
  location: string | null;
  coverImageUrl: string | null;
  photographerName: string;
  photographerId: string;
  photoCount: number;
  pricing: {
    singlePhoto: number;
    fullEvent: number;
    currency: string;
  };
}

interface Photo {
  id: string;
  thumbnailUrl: string;
  isOwned: boolean;
  isFavorite: boolean;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuthStore();

  const [event, setEvent] = useState<Event | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'my'>('all');

  const loadEventData = useCallback(async () => {
    try {
      // Load event details
      const { data: eventData } = await supabase
        .from('events')
        .select(`
          id,
          name,
          description,
          event_date,
          location,
          cover_image_url,
          photographer:photographer_id (
            id,
            display_name
          ),
          media (count)
        `)
        .eq('id', id)
        .single();

      if (eventData) {
        setEvent({
          id: eventData.id,
          name: eventData.name,
          description: eventData.description,
          eventDate: eventData.event_date,
          location: eventData.location,
          coverImageUrl: eventData.cover_image_url,
          photographerName: (eventData.photographer as any)?.display_name || 'Unknown',
          photographerId: (eventData.photographer as any)?.id,
          photoCount: (eventData.media as any)?.count || 0,
          pricing: {
            singlePhoto: 2.99,
            fullEvent: 19.99,
            currency: 'USD',
          },
        });
      }

      // Load photos
      const { data: photosData } = await supabase
        .from('media')
        .select('id, thumbnail_path')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
        .limit(100);

      // Check which photos user owns
      const { data: ownedData } = await supabase
        .from('entitlements')
        .select('media_id')
        .eq('attendee_id', profile?.id)
        .in('media_id', photosData?.map((p: any) => p.id) || []);

      const ownedIds = new Set(ownedData?.map((e: any) => e.media_id) || []);

      if (photosData) {
        setPhotos(
          photosData.map((p: any) => ({
            id: p.id,
            thumbnailUrl: p.thumbnail_path,
            isOwned: ownedIds.has(p.id),
            isFavorite: false,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading event:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id, profile?.id]);

  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEventData();
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const handleShare = async () => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.example.com';
      const eventUrl = `${baseUrl}/e/${id}`;
      await Share.share({
        message: `Check out photos from ${event?.name} on FaceFindr!\n${eventUrl}`,
        url: eventUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleFindMyPhotos = () => {
    router.push({
      pathname: '/face-scan',
      params: { eventId: id },
    });
  };

  const handlePurchase = () => {
    if (selectedPhotos.size === 0) {
      Alert.alert('Select Photos', 'Please select at least one photo to purchase.');
      return;
    }

    // Navigate to checkout
    router.push({
      pathname: '/checkout',
      params: {
        eventId: id,
        photoIds: Array.from(selectedPhotos).join(','),
      },
    });
  };

  const totalPrice = selectedPhotos.size * (event?.pricing.singlePhoto || 0);

  if (isLoading || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading event...</Text>
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
            <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
              <Share2 size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Cover Image */}
        {event.coverImageUrl ? (
          <Image source={{ uri: event.coverImageUrl }} style={styles.coverImage} />
        ) : (
          <View style={[styles.coverImage, styles.coverPlaceholder]}>
            <ImageIcon size={48} color={colors.secondary} />
          </View>
        )}

        {/* Event Info */}
        <View style={styles.content}>
          <Text style={styles.eventName}>{event.name}</Text>
          
          <View style={styles.metaRow}>
            <Calendar size={16} color={colors.secondary} />
            <Text style={styles.metaText}>
              {new Date(event.eventDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>

          {event.location && (
            <View style={styles.metaRow}>
              <MapPin size={16} color={colors.secondary} />
              <Text style={styles.metaText}>{event.location}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.photographerRow}
            onPress={() => router.push(`/p/${event.photographerId}`)}
          >
            <Text style={styles.photographerLabel}>Photos by </Text>
            <Text style={styles.photographerName}>{event.photographerName}</Text>
          </TouchableOpacity>

          {event.description && (
            <Text style={styles.description}>{event.description}</Text>
          )}

          {/* Find My Photos CTA */}
          <Card style={styles.ctaCard}>
            <View style={styles.ctaContent}>
              <Scan size={24} color={colors.accent} />
              <View style={styles.ctaText}>
                <Text style={styles.ctaTitle}>Find Your Photos</Text>
                <Text style={styles.ctaDescription}>
                  Scan your face to find all photos of you
                </Text>
              </View>
            </View>
            <Button onPress={handleFindMyPhotos} size="sm">
              Scan Face
            </Button>
          </Card>

          {/* View Mode Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, viewMode === 'all' && styles.tabActive]}
              onPress={() => setViewMode('all')}
            >
              <Text style={[styles.tabText, viewMode === 'all' && styles.tabTextActive]}>
                All Photos ({photos.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, viewMode === 'my' && styles.tabActive]}
              onPress={() => setViewMode('my')}
            >
              <Text style={[styles.tabText, viewMode === 'my' && styles.tabTextActive]}>
                My Photos ({photos.filter((p) => p.isOwned).length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Photo Grid */}
          <View style={styles.photoGrid}>
            {photos
              .filter((p) => viewMode === 'all' || p.isOwned)
              .map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.photoItem}
                  onPress={() => router.push(`/photo/${photo.id}`)}
                  onLongPress={() => !photo.isOwned && togglePhotoSelection(photo.id)}
                >
                  <Image source={{ uri: photo.thumbnailUrl }} style={styles.photoImage} />
                  
                  {/* Owned Badge */}
                  {photo.isOwned && (
                    <View style={styles.ownedBadge}>
                      <Download size={12} color="#fff" />
                    </View>
                  )}

                  {/* Selection Checkbox */}
                  {!photo.isOwned && (
                    <TouchableOpacity
                      style={[
                        styles.checkbox,
                        selectedPhotos.has(photo.id) && styles.checkboxSelected,
                      ]}
                      onPress={() => togglePhotoSelection(photo.id)}
                    >
                      {selectedPhotos.has(photo.id) && (
                        <Check size={14} color="#fff" />
                      )}
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
          </View>
        </View>
      </ScrollView>

      {/* Purchase Footer */}
      {selectedPhotos.size > 0 && (
        <View style={styles.purchaseFooter}>
          <View style={styles.purchaseInfo}>
            <Text style={styles.purchaseCount}>
              {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
            </Text>
            <Text style={styles.purchasePrice}>
              ${totalPrice.toFixed(2)}
            </Text>
          </View>
          <Button onPress={handlePurchase}>
            <ShoppingCart size={20} color="#fff" />
            {' Purchase'}
          </Button>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: 250,
  },
  coverPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
  },
  eventName: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  photographerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  photographerLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  photographerName: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '500',
  },
  description: {
    fontSize: fontSize.base,
    color: colors.secondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  ctaText: {
    marginLeft: spacing.md,
    flex: 1,
  },
  ctaTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  ctaDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.secondary,
  },
  tabTextActive: {
    color: colors.accent,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  ownedBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  purchaseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  purchaseInfo: {
    flex: 1,
  },
  purchaseCount: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  purchasePrice: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.foreground,
  },
});

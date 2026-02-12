/**
 * Event Detail Screen
 * 
 * Different views for photographers (management dashboard) and attendees (discovery/purchase).
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
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Share2,
  Calendar,
  MapPin,
  Image as ImageIcon,
  Scan,
  ShoppingCart,
  Download,
  Check,
  Users,
  DollarSign,
  Upload,
  Settings,
  Eye,
  BarChart3,
  QrCode,
  ChevronRight,
  TrendingUp,
  Clock,
  Camera,
  Link as LinkIcon,
  MoreHorizontal,
  Plus,
  Zap,
} from 'lucide-react-native';

import { Button, Card, Lightbox } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { formatPrice } from '@/lib/currency';
import { getThumbnailUrl, getCoverImageUrl, getSignedUrl } from '@/lib/storage-urls';
import { useRealtimeSubscription } from '@/hooks/use-realtime';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm * 2) / 3;
const PHOTO_SIZE_LARGE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.sm) / 2;

interface Event {
  id: string;
  name: string;
  description: string | null;
  eventDate: string;
  location: string | null;
  coverImageUrl: string | null;
  publicSlug?: string | null;
  photographerName: string;
  photographerId: string;
  photoCount: number;
  status?: string;
  pricing: {
    singlePhoto: number;
    fullEvent: number;
    currency: string;
  };
}

interface Photo {
  id: string;
  thumbnailUrl: string;
  fullUrl: string;
  isOwned: boolean;
  isFavorite: boolean;
  isMatched?: boolean;
  uploadedAt?: string;
}

interface EventStats {
  attendeeCount: number;
  revenue: number;
  matchedPhotos: number;
  views: number;
  conversionRate: number;
}

// ============================================
// PHOTOGRAPHER EVENT MANAGEMENT VIEW
// ============================================
function PhotographerEventView({
  event,
  photos,
  stats,
  isRefreshing,
  onRefresh,
  onUpload,
  onShare,
  onSettings,
  onAnalytics,
  onPhotoPress,
}: {
  event: Event;
  photos: Photo[];
  stats: EventStats;
  isRefreshing: boolean;
  onRefresh: () => void;
  onUpload: () => void;
  onShare: () => void;
  onSettings: () => void;
  onAnalytics: () => void;
  onPhotoPress: (photo: Photo, index: number) => void;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'photos' | 'insights'>('overview');

  const matchedCount = photos.filter(p => p.isMatched).length;
  const unmatchedCount = photos.length - matchedCount;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />

      <SafeAreaView style={photographerStyles.container}>
        {/* Header */}
        <View style={photographerStyles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={photographerStyles.backButton}
          >
            <ArrowLeft size={22} color={colors.foreground} />
          </TouchableOpacity>
          <View style={photographerStyles.headerTitleContainer}>
            <Text style={photographerStyles.headerTitle} numberOfLines={1}>{event.name}</Text>
            <Text style={photographerStyles.headerSubtitle}>Event Management</Text>
          </View>
          <TouchableOpacity onPress={onSettings} style={photographerStyles.headerAction}>
            <MoreHorizontal size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={photographerStyles.scrollView}
          contentContainerStyle={photographerStyles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Event Status Banner */}
          <View style={photographerStyles.statusBanner}>
            <LinearGradient
              colors={['#0A84FF', '#5E5CE6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={photographerStyles.statusGradient}
            >
              <View style={photographerStyles.statusContent}>
                <View style={photographerStyles.statusLeft}>
                  <View style={photographerStyles.statusBadge}>
                    <Zap size={12} color="#FFFFFF" />
                    <Text style={photographerStyles.statusBadgeText}>Live</Text>
                  </View>
                  <Text style={photographerStyles.statusEventName}>{event.name}</Text>
                  <View style={photographerStyles.statusMeta}>
                    <Calendar size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={photographerStyles.statusMetaText}>
                      {new Date(event.eventDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                    {event.location && (
                      <>
                        <MapPin size={12} color="rgba(255,255,255,0.8)" />
                        <Text style={photographerStyles.statusMetaText} numberOfLines={1}>
                          {event.location}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                {event.coverImageUrl && (
                  <Image
                    source={{ uri: event.coverImageUrl }}
                    style={photographerStyles.statusCoverImage}
                  />
                )}
              </View>
            </LinearGradient>
          </View>

          {/* Quick Actions */}
          <View style={photographerStyles.quickActions}>
            <TouchableOpacity style={photographerStyles.primaryAction} onPress={onUpload}>
              <LinearGradient
                colors={['#0A84FF', '#0066CC']}
                style={photographerStyles.primaryActionGradient}
              >
                <Upload size={20} color="#FFFFFF" />
                <Text style={photographerStyles.primaryActionText}>Upload Photos</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={photographerStyles.secondaryActions}>
              <TouchableOpacity style={photographerStyles.secondaryAction} onPress={onShare}>
                <QrCode size={18} color={colors.accent} />
                <Text style={photographerStyles.secondaryActionText}>Share</Text>
              </TouchableOpacity>
              <TouchableOpacity style={photographerStyles.secondaryAction} onPress={onAnalytics}>
                <BarChart3 size={18} color={colors.accent} />
                <Text style={photographerStyles.secondaryActionText}>Analytics</Text>
              </TouchableOpacity>
              <TouchableOpacity style={photographerStyles.secondaryAction} onPress={onSettings}>
                <Settings size={18} color={colors.accent} />
                <Text style={photographerStyles.secondaryActionText}>Settings</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats Grid */}
          <View style={photographerStyles.statsSection}>
            <Text style={photographerStyles.sectionTitle}>Performance</Text>
            <View style={photographerStyles.statsGrid}>
              <View style={photographerStyles.statCard}>
                <View style={[photographerStyles.statIcon, { backgroundColor: '#0A84FF15' }]}>
                  <Camera size={18} color="#0A84FF" />
                </View>
                <Text style={photographerStyles.statValue}>{event.photoCount}</Text>
                <Text style={photographerStyles.statLabel}>Photos</Text>
              </View>
              <View style={photographerStyles.statCard}>
                <View style={[photographerStyles.statIcon, { backgroundColor: '#30D15815' }]}>
                  <Users size={18} color="#30D158" />
                </View>
                <Text style={photographerStyles.statValue}>{stats.attendeeCount}</Text>
                <Text style={photographerStyles.statLabel}>Attendees</Text>
              </View>
              <View style={photographerStyles.statCard}>
                <View style={[photographerStyles.statIcon, { backgroundColor: '#5E5CE615' }]}>
                  <DollarSign size={18} color="#5E5CE6" />
                </View>
                <Text style={photographerStyles.statValue}>
                  {formatPrice(stats.revenue / 100, event.pricing.currency)}
                </Text>
                <Text style={photographerStyles.statLabel}>Revenue</Text>
              </View>
              <View style={photographerStyles.statCard}>
                <View style={[photographerStyles.statIcon, { backgroundColor: '#FF9F0A15' }]}>
                  <TrendingUp size={18} color="#FF9F0A" />
                </View>
                <Text style={photographerStyles.statValue}>
                  {stats.conversionRate > 0 ? `${stats.conversionRate.toFixed(1)}%` : '—'}
                </Text>
                <Text style={photographerStyles.statLabel}>Conversion</Text>
              </View>
            </View>
          </View>

          {/* Photo Match Status */}
          <View style={photographerStyles.matchSection}>
            <Text style={photographerStyles.sectionTitle}>Photo Matching</Text>
            <View style={photographerStyles.matchCard}>
              <View style={photographerStyles.matchProgress}>
                <View style={photographerStyles.matchProgressBar}>
                  <View 
                    style={[
                      photographerStyles.matchProgressFill, 
                      { width: `${photos.length > 0 ? (matchedCount / photos.length) * 100 : 0}%` }
                    ]} 
                  />
                </View>
                <Text style={photographerStyles.matchProgressText}>
                  {matchedCount} of {photos.length} photos matched
                </Text>
              </View>
              <View style={photographerStyles.matchStats}>
                <View style={photographerStyles.matchStat}>
                  <View style={[photographerStyles.matchDot, { backgroundColor: '#30D158' }]} />
                  <Text style={photographerStyles.matchStatText}>{matchedCount} Matched</Text>
                </View>
                <View style={photographerStyles.matchStat}>
                  <View style={[photographerStyles.matchDot, { backgroundColor: '#FF9F0A' }]} />
                  <Text style={photographerStyles.matchStatText}>{unmatchedCount} Pending</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Recent Photos */}
          <View style={photographerStyles.photosSection}>
            <View style={photographerStyles.sectionHeader}>
              <Text style={photographerStyles.sectionTitle}>Recent Photos</Text>
              <TouchableOpacity 
                style={photographerStyles.seeAllButton}
                onPress={() => setActiveTab('photos')}
              >
                <Text style={photographerStyles.seeAllText}>See All</Text>
                <ChevronRight size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {photos.length > 0 ? (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={photographerStyles.photosHorizontal}
              >
                {photos.slice(0, 8).map((photo, index) => (
                  <TouchableOpacity
                    key={photo.id}
                    style={photographerStyles.photoCard}
                    onPress={() => onPhotoPress(photo, index)}
                  >
                    {photo.thumbnailUrl ? (
                      <Image source={{ uri: photo.thumbnailUrl }} style={photographerStyles.photoImage} />
                    ) : (
                      <View style={[photographerStyles.photoImage, photographerStyles.photoPlaceholder]}>
                        <ImageIcon size={20} color={colors.secondary} />
                      </View>
                    )}
                    <View style={[
                      photographerStyles.photoStatus,
                      photo.isMatched ? photographerStyles.photoMatched : photographerStyles.photoPending
                    ]}>
                      {photo.isMatched ? (
                        <Check size={10} color="#FFFFFF" />
                      ) : (
                        <Clock size={10} color="#FFFFFF" />
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
                
                {/* Add more photos card */}
                <TouchableOpacity style={photographerStyles.addPhotoCard} onPress={onUpload}>
                  <Plus size={24} color={colors.accent} />
                  <Text style={photographerStyles.addPhotoText}>Add More</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <View style={photographerStyles.emptyPhotos}>
                <Camera size={40} color={colors.secondary} />
                <Text style={photographerStyles.emptyPhotosTitle}>No photos yet</Text>
                <Text style={photographerStyles.emptyPhotosText}>
                  Upload your first photos to get started
                </Text>
                <Button onPress={onUpload} style={{ marginTop: spacing.md }}>
                  <Upload size={18} color="#FFFFFF" />
                  {' Upload Photos'}
                </Button>
              </View>
            )}
          </View>

          {/* Quick Links */}
          <View style={photographerStyles.linksSection}>
            <Text style={photographerStyles.sectionTitle}>Event Links</Text>
            <View style={photographerStyles.linkCard}>
              <View style={photographerStyles.linkInfo}>
                <LinkIcon size={18} color={colors.accent} />
                <View style={photographerStyles.linkTextContainer}>
                  <Text style={photographerStyles.linkLabel}>Public Event Page</Text>
                  <Text style={photographerStyles.linkUrl} numberOfLines={1}>
                    facefindr.com/e/{event.publicSlug || event.id.slice(0, 8)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={photographerStyles.linkCopyButton} onPress={onShare}>
                <Share2 size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

// ============================================
// ATTENDEE EVENT VIEW
// ============================================
function AttendeeEventView({
  event,
  photos,
  selectedPhotos,
  isRefreshing,
  onRefresh,
  onShare,
  onFindMyPhotos,
  onPhotoPress,
  onToggleSelection,
  onPurchase,
}: {
  event: Event;
  photos: Photo[];
  selectedPhotos: Set<string>;
  isRefreshing: boolean;
  onRefresh: () => void;
  onShare: () => void;
  onFindMyPhotos: () => void;
  onPhotoPress: (photo: Photo, index: number) => void;
  onToggleSelection: (photoId: string) => void;
  onPurchase: () => void;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'all' | 'my'>('all');
  const ownedPhotos = photos.filter(p => p.isOwned);
  const totalPrice = selectedPhotos.size * (event?.pricing.singlePhoto || 0);

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
              style={attendeeStyles.headerButton}
            >
              <ArrowLeft size={24} color="#fff" />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={onShare} style={attendeeStyles.headerButton}>
              <Share2 size={24} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={attendeeStyles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        {/* Cover Image */}
        {event.coverImageUrl ? (
          <Image source={{ uri: event.coverImageUrl }} style={attendeeStyles.coverImage} />
        ) : (
          <View style={[attendeeStyles.coverImage, attendeeStyles.coverPlaceholder]}>
            <ImageIcon size={48} color={colors.secondary} />
          </View>
        )}

        {/* Event Info */}
        <View style={attendeeStyles.content}>
          <Text style={attendeeStyles.eventName}>{event.name}</Text>

          <View style={attendeeStyles.metaRow}>
            <Calendar size={16} color={colors.secondary} />
            <Text style={attendeeStyles.metaText}>
              {new Date(event.eventDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>

          {event.location && (
            <View style={attendeeStyles.metaRow}>
              <MapPin size={16} color={colors.secondary} />
              <Text style={attendeeStyles.metaText}>{event.location}</Text>
            </View>
          )}

          <TouchableOpacity
            style={attendeeStyles.photographerRow}
            onPress={() => router.push(`/p/${event.photographerId}` as any)}
          >
            <Text style={attendeeStyles.photographerLabel}>Photos by </Text>
            <Text style={attendeeStyles.photographerName}>{event.photographerName}</Text>
            <ChevronRight size={14} color={colors.accent} />
          </TouchableOpacity>

          {event.description && (
            <Text style={attendeeStyles.description}>{event.description}</Text>
          )}

          {/* Find My Photos CTA */}
          <Pressable style={attendeeStyles.ctaCard} onPress={onFindMyPhotos}>
            <LinearGradient
              colors={['#0A84FF', '#5E5CE6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={attendeeStyles.ctaGradient}
            >
              <View style={attendeeStyles.ctaIconContainer}>
                <Scan size={28} color="#FFFFFF" />
              </View>
              <View style={attendeeStyles.ctaTextContainer}>
                <Text style={attendeeStyles.ctaTitle}>Find Your Photos</Text>
                <Text style={attendeeStyles.ctaSubtitle}>
                  Scan your face to discover all photos of you
                </Text>
              </View>
              <ChevronRight size={24} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>

          {/* Photo count info */}
          <View style={attendeeStyles.photoCountCard}>
            <View style={attendeeStyles.photoCountIcon}>
              <Camera size={20} color={colors.accent} />
            </View>
            <View style={attendeeStyles.photoCountText}>
              <Text style={attendeeStyles.photoCountValue}>{event.photoCount} Photos</Text>
              <Text style={attendeeStyles.photoCountLabel}>Available at this event</Text>
            </View>
          </View>

          {/* View Mode Tabs */}
          <View style={attendeeStyles.tabs}>
            <TouchableOpacity
              style={[attendeeStyles.tab, viewMode === 'all' && attendeeStyles.tabActive]}
              onPress={() => setViewMode('all')}
            >
              <Text style={[attendeeStyles.tabText, viewMode === 'all' && attendeeStyles.tabTextActive]}>
                All Photos ({photos.length})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[attendeeStyles.tab, viewMode === 'my' && attendeeStyles.tabActive]}
              onPress={() => setViewMode('my')}
            >
              <Text style={[attendeeStyles.tabText, viewMode === 'my' && attendeeStyles.tabTextActive]}>
                My Photos ({ownedPhotos.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Photo Grid */}
          <View style={attendeeStyles.photoGrid}>
            {(viewMode === 'all' ? photos : ownedPhotos).map((photo, index) => (
              <TouchableOpacity
                key={photo.id}
                style={attendeeStyles.photoItem}
                onPress={() => onPhotoPress(photo, index)}
                onLongPress={() => !photo.isOwned && onToggleSelection(photo.id)}
              >
                {photo.thumbnailUrl ? (
                  <Image source={{ uri: photo.thumbnailUrl }} style={attendeeStyles.photoImage} />
                ) : (
                  <View style={[attendeeStyles.photoImage, attendeeStyles.photoPlaceholder]}>
                    <ImageIcon size={24} color={colors.secondary} />
                  </View>
                )}

                {photo.isOwned && (
                  <View style={attendeeStyles.ownedBadge}>
                    <Download size={12} color="#fff" />
                  </View>
                )}

                {!photo.isOwned && (
                  <TouchableOpacity
                    style={[
                      attendeeStyles.checkbox,
                      selectedPhotos.has(photo.id) && attendeeStyles.checkboxSelected,
                    ]}
                    onPress={() => onToggleSelection(photo.id)}
                  >
                    {selectedPhotos.has(photo.id) && <Check size={14} color="#fff" />}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Purchase Footer */}
      {selectedPhotos.size > 0 && (
        <View style={attendeeStyles.purchaseFooter}>
          <View style={attendeeStyles.purchaseInfo}>
            <Text style={attendeeStyles.purchaseCount}>
              {selectedPhotos.size} photo{selectedPhotos.size !== 1 ? 's' : ''} selected
            </Text>
            <Text style={attendeeStyles.purchasePrice}>
              {formatPrice(totalPrice / 100, event?.pricing.currency || 'USD')}
            </Text>
          </View>
          <TouchableOpacity style={attendeeStyles.purchaseButton} onPress={onPurchase}>
            <ShoppingCart size={18} color="#FFFFFF" />
            <Text style={attendeeStyles.purchaseButtonText}>Purchase</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, userType } = useAuthStore();

  const [event, setEvent] = useState<Event | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOwnEvent, setIsOwnEvent] = useState(false);
  const [eventStats, setEventStats] = useState<EventStats>({
    attendeeCount: 0,
    revenue: 0,
    matchedPhotos: 0,
    views: 0,
    conversionRate: 0,
  });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const loadEventData = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select(`
          id,
          name,
          description,
          event_date,
          location,
          cover_image_url,
          photographer_id,
          public_slug,
          status,
          photographer:photographer_id (
            id,
            display_name
          ),
          event_pricing (
            price_per_media,
            unlock_all_price,
            currency,
            is_free
          )
        `)
        .eq('id', id)
        .single();

      if (eventError) {
        console.error('Error loading event:', eventError);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      let mediaCount = 0;
      if (id) {
        const { count } = await supabase
          .from('media')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', id)
          .is('deleted_at', null);
        mediaCount = count || 0;
      }

      if (eventData) {
        const photographerId = eventData.photographer_id || (eventData.photographer as any)?.id;
        const coverImageUrl = getCoverImageUrl(eventData.cover_image_url);
        if (coverImageUrl) {
          Image.prefetch(coverImageUrl);
        }

        const isOwner = Boolean(userType === 'photographer' && profile?.id === photographerId);
        setIsOwnEvent(isOwner);

        const pricing = Array.isArray(eventData.event_pricing) ? eventData.event_pricing[0] : eventData.event_pricing;
        const currency = pricing?.currency || 'USD';
        const isFree = pricing?.is_free ?? false;

        setEvent({
          id: eventData.id,
          name: eventData.name,
          description: eventData.description,
          eventDate: eventData.event_date,
          location: eventData.location,
          coverImageUrl,
          publicSlug: eventData.public_slug,
          photographerName: (eventData.photographer as any)?.display_name || 'Unknown',
          photographerId: photographerId,
          photoCount: mediaCount,
          status: eventData.status,
          pricing: {
            singlePhoto: isFree ? 0 : pricing?.price_per_media || 0,
            fullEvent: isFree ? 0 : pricing?.unlock_all_price || 0,
            currency,
          },
        });
      }

      // Load photos
      const { data: photosData, error: photosError } = await supabase
        .from('media')
        .select('id, thumbnail_path, storage_path, face_matched_count, created_at')
        .eq('event_id', id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (photosError) {
        console.error('Error loading photos:', photosError);
      }

      // Check owned photos for attendees
      let ownedIds = new Set<string>();
      if (userType === 'attendee' && profile?.id) {
        const { data: ownedData } = await supabase
          .from('entitlements')
          .select('media_id')
          .eq('attendee_id', profile.id)
          .in('media_id', photosData?.map((p: any) => p.id) || []);
        ownedIds = new Set(ownedData?.map((e: any) => e.media_id) || []);
      }

      if (photosData) {
        const photosList = await Promise.all(
          photosData.map(async (p: any) => {
            let thumbnailUrl = null;
            if (p.thumbnail_path) {
              thumbnailUrl = await getThumbnailUrl(p.thumbnail_path, null);
            }
            if (!thumbnailUrl && p.storage_path) {
              thumbnailUrl = await getThumbnailUrl(null, p.storage_path);
            }

            return {
              id: p.id,
              thumbnailUrl: thumbnailUrl || '',
              fullUrl: p.storage_path,
              isOwned: ownedIds.has(p.id),
              isFavorite: false,
              isMatched: (p.face_matched_count || 0) > 0,
              uploadedAt: p.created_at,
            };
          })
        );
        setPhotos(photosList);

        // Calculate stats for photographer
        if (isOwnEvent || (userType === 'photographer' && profile?.id === eventData?.photographer_id)) {
          const matchedCount = photosList.filter(p => p.isMatched).length;

          const { count: attendeeCount } = await supabase
            .from('entitlements')
            .select('attendee_id', { count: 'exact', head: true })
            .eq('event_id', id);

          const { data: revenueData } = await supabase
            .from('transactions')
            .select('net_amount')
            .eq('event_id', id)
            .eq('status', 'succeeded');

          const totalRevenue = revenueData?.reduce((sum, t) => sum + (t.net_amount || 0), 0) || 0;
          const conversionRate = photosList.length > 0 && attendeeCount 
            ? (attendeeCount / photosList.length) * 100 
            : 0;

          setEventStats({
            attendeeCount: attendeeCount || 0,
            revenue: totalRevenue,
            matchedPhotos: matchedCount,
            views: 0,
            conversionRate,
          });
        }
      }
    } catch (err) {
      console.error('Error loading event:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id, profile?.id, userType]);

  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  useRealtimeSubscription({
    table: 'events',
    filter: `id=eq.${id}`,
    onChange: () => loadEventData(),
  });

  useRealtimeSubscription({
    table: 'media',
    filter: `event_id=eq.${id}`,
    onChange: () => loadEventData(),
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEventData();
  };

  const handleShare = async () => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.example.com';
      const eventUrl = `${baseUrl}/e/${event?.publicSlug || id}`;
      await Share.share({
        message: `Check out photos from ${event?.name} on FaceFindr!\n${eventUrl}`,
        url: eventUrl,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handlePhotoPress = async (photo: Photo, index: number) => {
    const fullUrl = await getSignedUrl('media', photo.fullUrl);
    if (fullUrl) {
      const photosWithUrls = await Promise.all(
        photos.map(async (p) => {
          const url = await getSignedUrl('media', p.fullUrl);
          return { ...p, fullUrl: url || p.thumbnailUrl };
        })
      );
      setPhotos(photosWithUrls);
      setLightboxIndex(index);
      setLightboxOpen(true);
    } else {
      router.push(`/photo/${photo.id}` as any);
    }
  };

  if (isLoading || !event) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: true, title: 'Event', headerBackTitle: 'Back' }} />
        <Text style={styles.loadingText}>Loading event...</Text>
      </SafeAreaView>
    );
  }

  // Render photographer view for their own events
  if (isOwnEvent) {
    return (
      <PhotographerEventView
        event={event}
        photos={photos}
        stats={eventStats}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onUpload={() => router.push(`/(photographer)/upload?eventId=${id}` as any)}
        onShare={handleShare}
        onSettings={() => Alert.alert('Settings', 'Open web dashboard for full event settings')}
        onAnalytics={() => router.push(`/(photographer)/analytics?eventId=${id}` as any)}
        onPhotoPress={handlePhotoPress}
      />
    );
  }

  // Render attendee view
  return (
    <AttendeeEventView
      event={event}
      photos={photos}
      selectedPhotos={selectedPhotos}
      isRefreshing={isRefreshing}
      onRefresh={handleRefresh}
      onShare={handleShare}
      onFindMyPhotos={() => router.push({ pathname: '/face-scan', params: { eventId: id } })}
      onPhotoPress={handlePhotoPress}
      onToggleSelection={(photoId) => {
        setSelectedPhotos((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(photoId)) {
            newSet.delete(photoId);
          } else {
            newSet.add(photoId);
          }
          return newSet;
        });
      }}
      onPurchase={() => {
        if (selectedPhotos.size === 0) {
          Alert.alert('Select Photos', 'Please select at least one photo to purchase.');
          return;
        }
        router.push({
          pathname: '/checkout',
          params: { eventId: id, photoIds: Array.from(selectedPhotos).join(',') },
        } as any);
      }}
    />
  );
}

// ============================================
// STYLES
// ============================================
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.secondary,
  },
});

const photographerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 1,
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  statusBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
  },
  statusGradient: {
    padding: spacing.md,
  },
  statusContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flex: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    gap: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusEventName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: spacing.sm,
    letterSpacing: -0.3,
  },
  statusMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
  },
  statusMetaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  statusCoverImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginLeft: spacing.md,
  },
  quickActions: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  primaryAction: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  primaryActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.foreground,
  },
  statsSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: (SCREEN_WIDTH - spacing.md * 2 - spacing.sm * 3) / 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 10,
    color: colors.secondary,
    marginTop: 2,
  },
  matchSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  matchProgress: {
    marginBottom: spacing.md,
  },
  matchProgressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  matchProgressFill: {
    height: '100%',
    backgroundColor: '#30D158',
    borderRadius: 4,
  },
  matchProgressText: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: spacing.xs,
  },
  matchStats: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  matchStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  matchStatText: {
    fontSize: 13,
    color: colors.foreground,
  },
  photosSection: {
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    color: colors.accent,
    fontWeight: '500',
  },
  photosHorizontal: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  photoCard: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStatus: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMatched: {
    backgroundColor: '#30D158',
  },
  photoPending: {
    backgroundColor: '#FF9F0A',
  },
  addPhotoCard: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  addPhotoText: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 4,
    fontWeight: '500',
  },
  emptyPhotos: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  emptyPhotosTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.md,
  },
  emptyPhotosText: {
    fontSize: 14,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  linksSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  linkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.foreground,
  },
  linkUrl: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  linkCopyButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const attendeeStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    height: 280,
  },
  coverPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    marginTop: -40,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  eventName: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.foreground,
    marginBottom: spacing.sm,
    letterSpacing: -0.5,
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
    fontWeight: '600',
  },
  description: {
    fontSize: fontSize.base,
    color: colors.secondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  ctaCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  ctaIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextContainer: {
    flex: 1,
    marginLeft: spacing.md,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  ctaSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  photoCountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoCountIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCountText: {
    marginLeft: spacing.md,
  },
  photoCountValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.foreground,
  },
  photoCountLabel: {
    fontSize: 12,
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
  photoPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#30D158',
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
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  purchaseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

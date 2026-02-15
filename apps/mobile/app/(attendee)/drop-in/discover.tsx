/**
 * Drop-In Discovery Screen (Mobile)
 * 
 * Premium users can discover drop-in photos of themselves
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Eye,
  MapPin,
  Calendar,
  User,
  Gift,
  Lock,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getSignedUrl } from '@/lib/storage-urls';
import { useRealtimeSubscription } from '@/hooks/use-realtime';

interface DropInPhoto {
  matchId: string;
  notificationId?: string | null;
  photoId: string;
  thumbnailUrl: string | null;
  confidence: number;
  uploadedAt: string;
  locationName: string | null;
  uploader: {
    id: string;
    display_name: string;
    face_tag: string;
  } | null;
  isGifted: boolean;
  giftMessage: string | null;
}

interface DropInDiscoverScreenProps {
  noHeader?: boolean;
}

export default function DropInDiscoverScreen({ noHeader = false }: DropInDiscoverScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuthStore();

  const [photos, setPhotos] = useState<DropInPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<DropInPhoto | null>(null);
  const [showGiftMessage, setShowGiftMessage] = useState(false);

  const loadPhotos = async () => {
    try {
      const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.facefindr.com';
      const response = await fetch(`${baseUrl}/api/drop-in/discover`, {
        headers: session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : undefined,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          // Premium required - show upgrade prompt
          return;
        }
        throw new Error(data.error || 'Failed to load photos');
      }

      setPhotos(data.photos || []);
    } catch (error: any) {
      console.error('Load photos error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  useRealtimeSubscription({
    table: 'drop_in_matches',
    filter: profile?.id ? `matched_attendee_id=eq.${profile.id}` : undefined,
    onChange: () => {
      loadPhotos();
    },
  });

  const handleRefresh = () => {
    setRefreshing(true);
    loadPhotos();
  };

  const handleViewPhoto = async (photo: DropInPhoto) => {
    // Mark notification as viewed
    try {
      const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.facefindr.com';
      await fetch(`${baseUrl}/api/drop-in/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          notificationId: photo.notificationId || photo.matchId,
          action: 'view',
        }),
      });
    } catch (error) {
      console.error('Failed to mark as viewed:', error);
    }

    setSelectedPhoto(photo);
    if (photo.isGifted && photo.giftMessage) {
      setShowGiftMessage(true);
    }
  };

  const renderPhoto = ({ item }: { item: DropInPhoto }) => (
    <TouchableOpacity
      style={styles.photoCard}
      onPress={() => handleViewPhoto(item)}
      activeOpacity={0.8}
    >
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.photoImage} />
      ) : (
        <View style={[styles.photoImage, styles.photoPlaceholder]}>
          <Eye size={32} color={colors.secondary} />
        </View>
      )}

      {/* Badges */}
      <View style={styles.badges}>
        {item.isGifted && (
          <View style={[styles.badge, styles.giftBadge]}>
            <Gift size={12} color="#fff" />
            <Text style={styles.badgeText}>Gifted</Text>
          </View>
        )}
        {!item.isGifted && (
          <View style={[styles.badge, styles.premiumBadge]}>
            <Lock size={12} color="#fff" />
            <Text style={styles.badgeText}>Premium</Text>
          </View>
        )}
      </View>

      {/* Confidence */}
      <View style={styles.confidenceBadge}>
        <Text style={styles.confidenceText}>{Math.round(item.confidence)}%</Text>
      </View>

      {/* Overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.overlay}
      >
        {item.uploader && (
          <Text style={styles.uploaderName} numberOfLines={1}>
            {item.uploader.display_name}
          </Text>
        )}
        {item.locationName && (
          <View style={styles.locationRow}>
            <MapPin size={10} color="rgba(255,255,255,0.9)" />
            <Text style={styles.locationText} numberOfLines={1}>
              {item.locationName}
            </Text>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header - Hidden when used in tabbed page */}
      {!noHeader && (
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.title}>Drop-In Photos</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Eye size={18} color={colors.accent} />
          <Text style={styles.statValue}>{photos.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Gift size={18} color="#10b981" />
          <Text style={styles.statValue}>{photos.filter(p => p.isGifted).length}</Text>
          <Text style={styles.statLabel}>Gifted</Text>
        </View>
        <View style={styles.statCard}>
          <Gift size={18} color="#8b5cf6" />
          <Text style={styles.statValue}>{photos.filter(p => !p.isGifted).length}</Text>
          <Text style={styles.statLabel}>Premium</Text>
        </View>
      </View>

      {/* Photos Grid */}
      {photos.length === 0 ? (
        <View style={styles.emptyState}>
          <Eye size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No drop-in photos found</Text>
          <Text style={styles.emptyText}>
            When someone uploads a photo of you outside your contacts, it will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.photoId}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
        />
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <Modal
          visible={!!selectedPhoto}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setSelectedPhoto(null);
            setShowGiftMessage(false);
          }}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              {selectedPhoto.thumbnailUrl && (
                <Image
                  source={{ uri: selectedPhoto.thumbnailUrl }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )}

              <View style={styles.modalInfo}>
                {selectedPhoto.uploader && (
                  <View style={styles.modalRow}>
                    <User size={16} color={colors.secondary} />
                    <Text style={styles.modalText}>
                      {selectedPhoto.uploader.display_name}
                    </Text>
                  </View>
                )}
                {selectedPhoto.locationName && (
                  <View style={styles.modalRow}>
                    <MapPin size={16} color={colors.secondary} />
                    <Text style={styles.modalText}>{selectedPhoto.locationName}</Text>
                  </View>
                )}
                <View style={styles.modalRow}>
                  <Calendar size={16} color={colors.secondary} />
                  <Text style={styles.modalText}>
                    {new Date(selectedPhoto.uploadedAt).toLocaleDateString()}
                  </Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Match Confidence:</Text>
                  <Text style={styles.modalConfidence}>
                    {Math.round(selectedPhoto.confidence)}%
                  </Text>
                </View>

                {selectedPhoto.isGifted && selectedPhoto.giftMessage && showGiftMessage && (
                  <View style={styles.giftMessageBox}>
                    <View style={styles.giftMessageHeader}>
                      <Gift size={16} color={colors.accent} />
                      <Text style={styles.giftMessageTitle}>Gift Message</Text>
                    </View>
                    <Text style={styles.giftMessageText}>
                      {selectedPhoto.giftMessage}
                    </Text>
                  </View>
                )}

                {selectedPhoto.isGifted && selectedPhoto.giftMessage && !showGiftMessage && (
                  <Button
                    onPress={() => setShowGiftMessage(true)}
                    style={styles.viewMessageButton}
                  >
                    <Gift size={16} color="#fff" />
                    <Text style={styles.viewMessageText}>View Gift Message</Text>
                  </Button>
                )}

                <View style={styles.modalActions}>
                  <Button
                    onPress={() => {
                      setSelectedPhoto(null);
                      setShowGiftMessage(false);
                    }}
                    variant="outline"
                    style={styles.modalButton}
                  >
                    Close
                  </Button>
                  <Button
                    onPress={async () => {
                      if (!selectedPhoto?.photoId) return;
                      try {
                        const baseUrl = process.env.EXPO_PUBLIC_APP_URL || 'https://app.facefindr.com';
                        const res = await fetch(`${baseUrl}/api/vault`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                          },
                          body: JSON.stringify({
                            dropInPhotoId: selectedPhoto.photoId,
                            isFavorite: false,
                          }),
                        });
                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.error || 'Failed to save');
                        }
                      } catch (error) {
                        console.error('Failed to save drop-in photo:', error);
                      } finally {
                        setSelectedPhoto(null);
                        setShowGiftMessage(false);
                      }
                    }}
                    style={styles.modalButton}
                  >
                    Save
                  </Button>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.secondary,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  columnWrapper: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  photoCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.muted,
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    gap: spacing.xs,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  giftBadge: {
    backgroundColor: '#10b981',
  },
  premiumBadge: {
    backgroundColor: colors.accent,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#fff',
  },
  confidenceBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  confidenceText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#fff',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.sm,
  },
  uploaderName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.9)',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  modalImage: {
    width: '100%',
    height: 400,
    backgroundColor: colors.muted,
  },
  modalInfo: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalText: {
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  modalLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  modalConfidence: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.accent,
  },
  giftMessageBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent + '20',
  },
  giftMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  giftMessageTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.foreground,
  },
  giftMessageText: {
    fontSize: fontSize.base,
    color: colors.foreground,
    lineHeight: 20,
  },
  viewMessageButton: {
    marginTop: spacing.sm,
  },
  viewMessageText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  modalButton: {
    flex: 1,
  },
});

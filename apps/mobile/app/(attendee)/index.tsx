/**
 * My Photos Screen (Photo Passport)
 * 
 * Displays user's photo collection from events.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  Dimensions,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ImageIcon, Scan, Sparkles, Camera } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - spacing.lg * 2 - spacing.sm * 2) / 3;

interface Photo {
  id: string;
  thumbnailUrl: string;
  eventName: string;
  createdAt: string;
}

export default function MyPhotosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadPhotos = async () => {
    try {
      // Fetch user's purchased/entitled photos
      const { data, error } = await supabase
        .from('entitlements')
        .select(`
          id,
          media:media_id (
            id,
            thumbnail_path,
            events:event_id (name)
          ),
          created_at
        `)
        .eq('attendee_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setPhotos(
          data.map((item: any) => ({
            id: item.media?.id,
            thumbnailUrl: item.media?.thumbnail_path,
            eventName: item.media?.events?.name,
            createdAt: item.created_at,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading photos:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadPhotos();
  };

  // Empty state
  if (!isLoading && photos.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" />
        
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerContent}>
            <Text style={styles.greeting}>
              Hi, {profile?.displayName?.split(' ')[0] || 'there'} 👋
            </Text>
            <Text style={styles.title}>Photo Passport</Text>
          </View>
          {profile?.faceTag && (
            <View style={styles.faceTagBadge}>
              <Text style={styles.faceTagText}>{profile.faceTag}</Text>
            </View>
          )}
        </View>

        {/* Empty State */}
        <View style={styles.emptyState}>
          <LinearGradient
            colors={[colors.accent + '15', colors.accent + '05']}
            style={styles.emptyIconContainer}
          >
            <ImageIcon size={40} color={colors.accent} strokeWidth={1.5} />
          </LinearGradient>
          
          <Text style={styles.emptyTitle}>Your photos await</Text>
          <Text style={styles.emptyDescription}>
            Scan your face at any event to instantly discover and collect all your photos
          </Text>
          
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/(attendee)/scan')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.accent, colors.accentDark]}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Camera size={20} color="#fff" strokeWidth={2} />
              <Text style={styles.ctaText}>Find My Photos</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>
            Hi, {profile?.displayName?.split(' ')[0] || 'there'} 👋
          </Text>
          <Text style={styles.title}>Photo Passport</Text>
        </View>
        <View style={styles.headerRight}>
          {profile?.faceTag && (
            <View style={styles.faceTagBadge}>
              <Text style={styles.faceTagText}>{profile.faceTag}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{photos.length}</Text>
          <Text style={styles.statLabel}>Photos</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {new Set(photos.map(p => p.eventName)).size}
          </Text>
          <Text style={styles.statLabel}>Events</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Memory Highlight */}
        {photos.length > 0 && photos[0].thumbnailUrl && (
          <TouchableOpacity
            style={styles.memoryCard}
            onPress={() => router.push(`/photo/${photos[0].id}`)}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.memoryOverlay}
            />
            <Image
              source={{ uri: photos[0].thumbnailUrl }}
              style={styles.memoryImage}
            />
            <View style={styles.memoryBadge}>
              <Sparkles size={14} color="#fff" />
              <Text style={styles.memoryBadgeText}>Memory</Text>
            </View>
            <View style={styles.memoryInfo}>
              <Text style={styles.memoryTitle}>{photos[0].eventName || 'Recent Event'}</Text>
              <Text style={styles.memoryDate}>
                {new Date(photos[0].createdAt).toLocaleDateString()}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Section Title */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Photos</Text>
          <Text style={styles.sectionCount}>{photos.length}</Text>
        </View>

        {/* Photo Grid */}
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              style={styles.photoItem}
              onPress={() => router.push(`/photo/${photo.id}`)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: photo.thumbnailUrl }}
                style={styles.photoImage}
              />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  greeting: {
    fontSize: 15,
    color: colors.secondary,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  faceTagBadge: {
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  faceTagText: {
    fontSize: 12,
    color: colors.accent,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 120,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptyDescription: {
    fontSize: 15,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  ctaButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  memoryCard: {
    height: 200,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    backgroundColor: colors.muted,
  },
  memoryOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  memoryImage: {
    width: '100%',
    height: '100%',
  },
  memoryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    zIndex: 2,
  },
  memoryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  memoryInfo: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 2,
  },
  memoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  memoryDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.foreground,
  },
  sectionCount: {
    fontSize: 14,
    color: colors.secondary,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
});

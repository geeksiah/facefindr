/**
 * Photo Upload Screen
 * 
 * Upload photos to events from camera roll.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image as ImageIcon,
  FolderOpen,
  X,
  Upload,
  CheckCircle2,
  Plus,
  Calendar,
  CameraIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'expo-camera';

// Button component replaced with custom TouchableOpacity for better control
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { formatDateForDisplay } from '@/lib/date';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width } = Dimensions.get('window');
const PREVIEW_SIZE = (width - spacing.lg * 2 - spacing.sm * 3) / 4;

interface SelectedImage {
  uri: string;
  fileName: string;
  fileSize: number;
}

interface Event {
  id: string;
  name: string;
  eventDate: string;
}

export default function UploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('id, name, event_date')
        .eq('photographer_id', profile?.id)
        .in('status', ['active', 'draft'])
        .order('created_at', { ascending: false });

      if (data) {
        setEvents(data.map((e: any) => ({
          id: e.id,
          name: e.name,
          eventDate: e.event_date,
        })));
        if (data.length > 0) {
          setSelectedEvent({
            id: data[0].id,
            name: data[0].name,
            eventDate: data[0].event_date,
          });
        }
      }
    };
    loadEvents();
  }, []);

  const handlePickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photos to upload images.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.9,
      selectionLimit: 50,
    });

    if (!result.canceled) {
      const newImages = result.assets.map((asset) => ({
        uri: asset.uri,
        fileName: asset.fileName || `photo_${Date.now()}.jpg`,
        fileSize: asset.fileSize || 0,
      }));
      setSelectedImages((prev) => [...prev, ...newImages]);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow camera access to take photos.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setSelectedImages((prev) => [
        ...prev,
        {
          uri: asset.uri,
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
          fileSize: asset.fileSize || 0,
        },
      ]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    Alert.alert(
      'Clear All',
      'Remove all selected photos?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => setSelectedImages([]) },
      ]
    );
  };

  const handleUpload = async () => {
    if (!selectedEvent) {
      Alert.alert('Select Event', 'Please select an event to upload photos to.');
      return;
    }

    if (selectedImages.length === 0) {
      Alert.alert('No Photos', 'Please select at least one photo to upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedCount(0);

    try {
      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i];
        
        // Storage path format: events/{eventId}/photos/{filename}
        const fileName = `events/${selectedEvent.id}/photos/${Date.now()}_${image.fileName}`;
        const response = await fetch(image.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          Alert.alert('Upload Error', uploadError.message || 'Failed to upload photo to storage');
          continue;
        }

        const { error: insertError } = await supabase.from('media').insert({
          event_id: selectedEvent.id,
          uploader_id: profile?.id,
          storage_path: fileName,
          original_filename: image.fileName,
          media_type: 'photo',
          mime_type: 'image/jpeg',
          file_size: image.fileSize,
        });

        if (insertError) {
          console.error('Database insert error:', insertError);
          Alert.alert('Database Error', insertError.message || 'Failed to save photo record');
          continue;
        }

        setUploadedCount(i + 1);
        setUploadProgress(((i + 1) / selectedImages.length) * 100);
      }

      Alert.alert(
        'Upload Complete',
        `Successfully uploaded ${selectedImages.length} photos to ${selectedEvent.name}.`,
        [
          {
            text: 'View Event',
            onPress: () => router.push(`/event/${selectedEvent.id}`),
          },
          { text: 'OK' },
        ]
      );
      setSelectedImages([]);
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Some photos failed to upload. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const totalSize = selectedImages.reduce((sum, img) => sum + img.fileSize, 0);
  const formattedSize = totalSize > 1024 * 1024
    ? `${(totalSize / (1024 * 1024)).toFixed(1)} MB`
    : `${(totalSize / 1024).toFixed(0)} KB`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>Upload Photos</Text>
        <Text style={styles.subtitle}>Add photos to your events</Text>
      </View>

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: selectedImages.length > 0 ? 180 : insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Event Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Event</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.eventList}
          >
            {events.map((event) => (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.eventChip,
                  selectedEvent?.id === event.id && styles.eventChipSelected,
                ]}
                onPress={() => setSelectedEvent(event)}
              >
                <Text
                  style={[
                    styles.eventChipText,
                    selectedEvent?.id === event.id && styles.eventChipTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {event.name}
                </Text>
                <View style={styles.eventChipDate}>
                  <Calendar size={10} color={selectedEvent?.id === event.id ? 'rgba(255,255,255,0.7)' : colors.secondary} />
                  <Text style={[
                    styles.eventChipDateText,
                    selectedEvent?.id === event.id && styles.eventChipDateTextSelected,
                  ]}>
                    {formatDateForDisplay(event.eventDate, 'en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.newEventChip}
              onPress={() => router.push('/create-event')}
            >
              <Plus size={16} color={colors.accent} />
              <Text style={styles.newEventText}>New Event</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Upload Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Photos</Text>
          <View style={styles.uploadOptions}>
            <TouchableOpacity style={styles.uploadCard} onPress={handlePickImages} activeOpacity={0.8}>
              <LinearGradient
                colors={[colors.accent + '15', colors.accent + '05']}
                style={styles.uploadCardGradient}
              >
                <View style={[styles.uploadIcon, { backgroundColor: colors.accent + '20' }]}>
                  <FolderOpen size={28} color={colors.accent} />
                </View>
                <Text style={styles.uploadCardTitle}>Photo Library</Text>
                <Text style={styles.uploadCardDesc}>Select multiple photos</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadCard} onPress={handleTakePhoto} activeOpacity={0.8}>
              <LinearGradient
                colors={['#10b98115', '#10b98105']}
                style={styles.uploadCardGradient}
              >
                <View style={[styles.uploadIcon, { backgroundColor: '#10b98120' }]}>
                  <CameraIcon size={28} color="#10b981" />
                </View>
                <Text style={styles.uploadCardTitle}>Camera</Text>
                <Text style={styles.uploadCardDesc}>Take a new photo</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Photos */}
        {selectedImages.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Selected ({selectedImages.length})
              </Text>
              <TouchableOpacity onPress={clearAllImages}>
                <Text style={styles.clearAllText}>Clear all</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.selectionInfo}>
              <View style={styles.infoBadge}>
                <ImageIcon size={12} color={colors.accent} />
                <Text style={styles.infoBadgeText}>{selectedImages.length} photos</Text>
              </View>
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>{formattedSize}</Text>
              </View>
            </View>

            <View style={styles.previewGrid}>
              {selectedImages.map((image, index) => (
                <View key={index} style={styles.previewItem}>
                  <Image source={{ uri: image.uri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeImage(index)}
                  >
                    <X size={12} color="#fff" strokeWidth={3} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addMoreButton} onPress={handlePickImages}>
                <Plus size={24} color={colors.secondary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Upload Footer */}
      {selectedImages.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) + spacing.md }]}>
          {isUploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                Uploading {uploadedCount} of {selectedImages.length}...
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handleUpload}
            disabled={isUploading}
            activeOpacity={0.8}
          >
            <Upload size={20} color="#fff" />
            <Text style={styles.uploadButtonText}>
              Upload {selectedImages.length} Photo{selectedImages.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.secondary,
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.destructive,
  },
  eventList: {
    gap: spacing.sm,
  },
  eventChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.muted,
    minWidth: 120,
  },
  eventChipSelected: {
    backgroundColor: colors.accent,
  },
  eventChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  eventChipTextSelected: {
    color: '#fff',
  },
  eventChipDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventChipDateText: {
    fontSize: 11,
    color: colors.secondary,
  },
  eventChipDateTextSelected: {
    color: 'rgba(255,255,255,0.7)',
  },
  newEventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  newEventText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
  },
  uploadOptions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  uploadCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  uploadCardGradient: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  uploadCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 2,
  },
  uploadCardDesc: {
    fontSize: 12,
    color: colors.secondary,
  },
  selectionInfo: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.muted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  infoBadgeText: {
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '500',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  previewItem: {
    position: 'relative',
  },
  previewImage: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: borderRadius.md,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  addMoreButton: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.muted,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: colors.secondary,
    textAlign: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: borderRadius.lg,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

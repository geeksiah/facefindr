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
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Image as ImageIcon,
  Camera,
  FolderOpen,
  X,
  Upload,
  CheckCircle2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface SelectedImage {
  uri: string;
  fileName: string;
  fileSize: number;
}

interface Event {
  id: string;
  name: string;
}

export default function UploadScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Load events
  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('id, name')
        .eq('photographer_id', profile?.id)
        .in('status', ['active', 'draft'])
        .order('created_at', { ascending: false });

      if (data) {
        setEvents(data);
        if (data.length > 0) {
          setSelectedEvent(data[0]);
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

    try {
      for (let i = 0; i < selectedImages.length; i++) {
        const image = selectedImages[i];
        
        // Upload to Supabase Storage
        const fileName = `events/${selectedEvent.id}/${Date.now()}_${image.fileName}`;
        const response = await fetch(image.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        // Create media record
        await supabase.from('media').insert({
          event_id: selectedEvent.id,
          photographer_id: profile?.id,
          storage_path: fileName,
          original_filename: image.fileName,
          file_size: image.fileSize,
        });

        setUploadProgress(((i + 1) / selectedImages.length) * 100);
      }

      Alert.alert(
        'Upload Complete',
        `Successfully uploaded ${selectedImages.length} photos.`,
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Upload Photos</Text>
        </View>

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
                >
                  {event.name}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.newEventChip}
              onPress={() => router.push('/create-event')}
            >
              <Text style={styles.newEventText}>+ New Event</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Upload Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Photos</Text>
          <View style={styles.uploadOptions}>
            <TouchableOpacity style={styles.uploadOption} onPress={handlePickImages}>
              <View style={[styles.uploadIcon, { backgroundColor: colors.accent + '20' }]}>
                <FolderOpen size={24} color={colors.accent} />
              </View>
              <Text style={styles.uploadOptionText}>Photo Library</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadOption} onPress={handleTakePhoto}>
              <View style={[styles.uploadIcon, { backgroundColor: colors.success + '20' }]}>
                <Camera size={24} color={colors.success} />
              </View>
              <Text style={styles.uploadOptionText}>Take Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Photos Preview */}
        {selectedImages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Selected Photos ({selectedImages.length})
            </Text>
            <View style={styles.previewGrid}>
              {selectedImages.map((image, index) => (
                <View key={index} style={styles.previewItem}>
                  <Image source={{ uri: image.uri }} style={styles.previewImage} />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeImage(index)}
                  >
                    <X size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Upload Button */}
        {selectedImages.length > 0 && (
          <View style={styles.uploadButtonContainer}>
            <Button
              onPress={handleUpload}
              loading={isUploading}
              fullWidth
              size="lg"
            >
              {isUploading ? (
                `Uploading... ${Math.round(uploadProgress)}%`
              ) : (
                <>
                  <Upload size={20} color="#fff" />
                  {`  Upload ${selectedImages.length} Photos`}
                </>
              )}
            </Button>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  eventList: {
    gap: spacing.sm,
  },
  eventChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.muted,
  },
  eventChipSelected: {
    backgroundColor: colors.accent,
  },
  eventChipText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.foreground,
  },
  eventChipTextSelected: {
    color: '#fff',
  },
  newEventChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  newEventText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.accent,
  },
  uploadOptions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  uploadOption: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  uploadIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  uploadOptionText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.foreground,
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
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.destructive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonContainer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
});

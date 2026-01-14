/**
 * Edit Profile Screen
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, User, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setIsLoading(true);

    try {
      const table = profile?.userType === 'photographer' ? 'photographers' : 'attendees';
      
      const { error } = await supabase
        .from(table)
        .update({ display_name: displayName.trim() })
        .eq('id', profile?.id);

      if (error) {
        throw error;
      }

      await refreshProfile();
      Alert.alert('Success', 'Profile updated successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('Update profile error:', err);
      Alert.alert('Error', 'Failed to update profile. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setIsUploadingPhoto(true);

    try {
      const asset = result.assets[0];
      const fileName = `avatars/${profile?.id}/${Date.now()}.jpg`;
      
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile
      const table = profile?.userType === 'photographer' ? 'photographers' : 'attendees';
      
      await supabase
        .from(table)
        .update({ profile_photo_url: urlData.publicUrl })
        .eq('id', profile?.id);

      await refreshProfile();
      Alert.alert('Success', 'Profile photo updated');
    } catch (err) {
      console.error('Photo upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload photo. Please check your internet connection and try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
          onPress={handleUpdateProfile}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Check size={24} color={colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={handleChangePhoto}
            disabled={isUploadingPhoto}
            activeOpacity={0.8}
          >
            {profile?.profilePhotoUrl ? (
              <Image source={{ uri: profile.profilePhotoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <User size={48} color={colors.secondary} strokeWidth={1.5} />
              </View>
            )}
            <View style={styles.cameraButton}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Camera size={16} color="#fff" strokeWidth={2} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.photoHint}>Tap to change photo</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Display Name</Text>
            <View style={styles.inputContainer}>
              <Input
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                style={styles.input}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <View style={[styles.inputContainer, styles.inputDisabled]}>
              <Text style={styles.inputValue}>{profile?.email || ''}</Text>
            </View>
            <Text style={styles.inputHint}>Email cannot be changed</Text>
          </View>

          {profile?.faceTag && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Your FaceTag</Text>
              <View style={styles.faceTagContainer}>
                <Text style={styles.faceTag}>{profile.faceTag}</Text>
              </View>
              <Text style={styles.inputHint}>Share this tag so photographers can find you</Text>
            </View>
          )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  saveButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  photoContainer: {
    position: 'relative',
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  photoPlaceholder: {
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },
  photoHint: {
    fontSize: 13,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  form: {
    gap: spacing.lg,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  inputContainer: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  inputDisabled: {
    padding: spacing.md,
  },
  inputValue: {
    fontSize: 16,
    color: colors.secondary,
  },
  inputHint: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
  },
  faceTagContainer: {
    padding: spacing.md,
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  faceTag: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});

/**
 * Edit Profile Screen
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
import { Camera, User } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function EditProfileScreen() {
  const router = useRouter();
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
      Alert.alert('Success', 'Profile updated successfully');
      router.back();
    } catch (err) {
      console.error('Update profile error:', err);
      Alert.alert('Error', 'Failed to update profile');
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
      Alert.alert('Error', 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Photo */}
        <View style={styles.photoSection}>
          <TouchableOpacity
            style={styles.photoContainer}
            onPress={handleChangePhoto}
            disabled={isUploadingPhoto}
          >
            {profile?.profilePhotoUrl ? (
              <Image source={{ uri: profile.profilePhotoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <User size={48} color={colors.secondary} />
              </View>
            )}
            <View style={styles.cameraButton}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Camera size={16} color="#fff" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.photoHint}>Tap to change photo</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Display Name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
          />

          <Input
            label="Email"
            value={profile?.email || ''}
            editable={false}
            style={{ opacity: 0.6 }}
          />

          {profile?.faceTag && (
            <View style={styles.faceTagContainer}>
              <Text style={styles.faceTagLabel}>Your FaceTag</Text>
              <Text style={styles.faceTag}>{profile.faceTag}</Text>
            </View>
          )}

          <Button
            onPress={handleUpdateProfile}
            loading={isLoading}
            fullWidth
            style={{ marginTop: spacing.lg }}
          >
            Save Changes
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
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
    bottom: 0,
    right: 0,
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
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  faceTagContainer: {
    padding: spacing.md,
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
  },
  faceTagLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  faceTag: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.accent,
    fontFamily: 'monospace',
  },
});

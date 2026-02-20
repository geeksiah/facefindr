/**
 * Drop-In Upload Screen (Mobile)
 * 
 * Upload photos of people outside contacts
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Upload,
  MapPin,
  Gift,
  DollarSign,
  X,
} from 'lucide-react-native';

import { Button } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';
import { alertMissingPublicAppUrl, buildPublicUrl } from '@/lib/runtime-config';

interface DropInUploadScreenProps {
  noHeader?: boolean;
}

export default function DropInUploadScreen({ noHeader = false }: DropInUploadScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const [image, setImage] = useState<string | null>(null);
  const [includeGift, setIncludeGift] = useState(false);
  const [giftMessage, setGiftMessage] = useState('');
  const [locationName, setLocationName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [attendeeCredits, setAttendeeCredits] = useState<number>(0);
  const [creditUnit, setCreditUnit] = useState<number | null>(null);
  const [uploadCreditsRequired, setUploadCreditsRequired] = useState<number>(1);
  const [giftCreditsRequired, setGiftCreditsRequired] = useState<number>(1);
  const [currency, setCurrency] = useState('USD');

  useEffect(() => {
    const loadPricing = async () => {
      const appUrl = getApiBaseUrl();

      const response = await fetch(`${appUrl}/api/runtime/drop-in/pricing`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Pricing unavailable');

      setAttendeeCredits(Number(data.attendeeCredits || 0));
      setCreditUnit(Number(data.creditUnit || 0));
      setUploadCreditsRequired(Number(data.uploadCreditsRequired || 1));
      setGiftCreditsRequired(Number(data.giftCreditsRequired || 1));
      setCurrency(String(data.currency || 'USD'));
    };

    void loadPricing().catch((error: Error) => {
      Alert.alert('Pricing unavailable', error.message);
    });
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!image) {
      Alert.alert('No Photo', 'Please select a photo to upload');
      return;
    }

    if (includeGift && giftMessage.length > 200) {
      Alert.alert('Message Too Long', 'Gift message must be 200 characters or less');
      return;
    }

    if (attendeeCredits < totalCreditsRequired) {
      Alert.alert(
        'Insufficient credits',
        `You need ${totalCreditsRequired} credits, but you currently have ${attendeeCredits}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Credits',
            onPress: async () => {
              const billingUrl = buildPublicUrl('/gallery/billing');
              if (!billingUrl) {
                alertMissingPublicAppUrl();
                return;
              }
              await Linking.openURL(billingUrl);
            },
          },
        ]
      );
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('photo', {
        uri: image,
        type: 'image/jpeg',
        name: 'photo.jpg',
      } as any);
      if (includeGift) {
        formData.append('includeGift', 'true');
        formData.append('giftMessage', giftMessage);
      }
      if (locationName) {
        formData.append('locationName', locationName);
      }

      const uploadResponse = await fetch(
        `${getApiBaseUrl()}/api/drop-in/upload`,
        {
          method: 'POST',
          body: formData,
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
        }
      );

      const data = await uploadResponse.json();

      if (!uploadResponse.ok) {
        if (uploadResponse.status === 402) {
          const requiredCredits = Number(data.requiredCredits || totalCreditsRequired);
          const available = Number(data.availableCredits || attendeeCredits);
          Alert.alert(
            'Insufficient credits',
            `You need ${requiredCredits} credits, but you currently have ${available}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Buy Credits',
                onPress: async () => {
                  const billingUrl = buildPublicUrl('/gallery/billing');
                  if (!billingUrl) {
                    alertMissingPublicAppUrl();
                    return;
                  }
                  await Linking.openURL(billingUrl);
                },
              },
            ]
          );
          return;
        }
        throw new Error(data.error || 'Upload failed');
      }

      setAttendeeCredits(Number(data.remainingCredits ?? attendeeCredits));
      Alert.alert(
        'Success',
        `Your drop-in photo was uploaded. ${Number(data.creditsUsed || totalCreditsRequired)} credit(s) used.`
      );
      router.back();
    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', error.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const effectiveCreditUnit = creditUnit ?? 0;
  const effectiveGiftCredits = includeGift ? giftCreditsRequired : 0;
  const totalCreditsRequired = uploadCreditsRequired + effectiveGiftCredits;
  const totalCost = effectiveCreditUnit * totalCreditsRequired;

  return (
    <View style={styles.container}>
      {/* Header - Hidden when used in tabbed page */}
      {!noHeader && (
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.title}>Upload Drop-In</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Image Upload */}
        <TouchableOpacity
          style={styles.uploadArea}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          {image ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: image }} style={styles.previewImage} />
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => setImage(null)}
              >
                <X size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Upload size={48} color={colors.accent} />
              <Text style={styles.uploadText}>Tap to select photo</Text>
              <Text style={styles.uploadSubtext}>or</Text>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={takePhoto}
              >
                <Text style={styles.cameraButtonText}>Take Photo</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* Gift Toggle */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Gift size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Gift Access + Message</Text>
            <TouchableOpacity
              style={[styles.toggle, includeGift && styles.toggleActive]}
              onPress={() => setIncludeGift(!includeGift)}
            >
              <View style={[styles.toggleThumb, includeGift && styles.toggleThumbActive]} />
            </TouchableOpacity>
          </View>
          {includeGift && (
            <View style={styles.giftSection}>
              <Text style={styles.label}>Message (optional, max 200 chars)</Text>
              <TextInput
                style={styles.textInput}
                value={giftMessage}
                onChangeText={setGiftMessage}
                placeholder="Add a message for the recipient..."
                placeholderTextColor={colors.secondary}
                multiline
                maxLength={200}
              />
              <Text style={styles.charCount}>{giftMessage.length}/200</Text>
            </View>
          )}
        </View>

        {/* Location */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MapPin size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Location (optional)</Text>
          </View>
          <TextInput
            style={styles.input}
            value={locationName}
            onChangeText={setLocationName}
            placeholder="e.g., Central Park, New York"
            placeholderTextColor={colors.secondary}
          />
        </View>

        {/* Pricing */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DollarSign size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Pricing</Text>
          </View>
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Available Credits</Text>
            <Text style={styles.pricingValue}>{attendeeCredits}</Text>
          </View>
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Upload Credits</Text>
            <Text style={styles.pricingValue}>{uploadCreditsRequired}</Text>
          </View>
          {includeGift && (
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Gift Access Credits</Text>
              <Text style={styles.pricingValue}>{giftCreditsRequired}</Text>
            </View>
          )}
          <View style={[styles.pricingRow, styles.pricingTotal]}>
            <Text style={styles.pricingLabelTotal}>Total Credits</Text>
            <Text style={styles.pricingValueTotal}>{totalCreditsRequired}</Text>
          </View>
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Per Credit</Text>
            <Text style={styles.pricingValue}>
              {currency} {effectiveCreditUnit.toFixed(2)}
            </Text>
          </View>
          <View style={styles.pricingRow}>
            <Text style={styles.pricingLabel}>Equivalent</Text>
            <Text style={styles.pricingValue}>
              {currency} {totalCost.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.buyCreditsButton}
            onPress={async () => {
              const billingUrl = buildPublicUrl('/gallery/billing');
              if (!billingUrl) {
                alertMissingPublicAppUrl();
                return;
              }
              await Linking.openURL(billingUrl);
            }}
          >
            <Text style={styles.buyCreditsButtonText}>Buy credits</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How it works:</Text>
          <Text style={styles.infoText}>
            • Upload a photo of someone (they don't need to be in your contacts){'\n'}
            • Upload consumes {uploadCreditsRequired} credit(s){'\n'}
            {includeGift && `• Gift access consumes an additional ${giftCreditsRequired} credit(s)\n`}
            • We'll use face recognition to find them{'\n'}
            • Recipient opens free when gift is enabled; otherwise recipient unlock may require credits
          </Text>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          onPress={handleUpload}
          disabled={!image || uploading || creditUnit === null}
          fullWidth
        >
          {uploading ? (
            <>
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              Processing...
            </>
          ) : (
            attendeeCredits < totalCreditsRequired
              ? `Buy ${totalCreditsRequired - attendeeCredits} more credit(s)`
              : `Upload (${totalCreditsRequired} credits)`
          )}
        </Button>
      </View>
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
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 100, // Extra padding to ensure footer is visible above bottom nav
  },
  uploadArea: {
    height: 300,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.muted,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  uploadPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  uploadText: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  uploadSubtext: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  cameraButton: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
  },
  cameraButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  removeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.muted,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: colors.accent,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  giftSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.foreground,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  pricingLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  pricingValue: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.foreground,
  },
  pricingTotal: {
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pricingLabelTotal: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  pricingValueTotal: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.accent,
  },
  buyCreditsButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    backgroundColor: colors.accent + '15',
  },
  buyCreditsButtonText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.accent,
  },
  infoBox: {
    backgroundColor: colors.muted + '80',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  infoTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});

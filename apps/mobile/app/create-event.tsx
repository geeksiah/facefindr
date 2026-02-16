/**
 * Create Event Screen
 * 
 * Form to create a new event.
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  StatusBar,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Note: Install @react-native-community/datetimepicker for native date picker
// For now using a simple date input approach
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Info,
  Users,
  DollarSign,
  ChevronDown,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function CreateEventScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();

  const [isLoading, setIsLoading] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [location, setLocation] = useState('');
  const [eventType, setEventType] = useState('');
  const [estimatedGuests, setEstimatedGuests] = useState('');
  const [basePrice, setBasePrice] = useState('');

  const eventTypes = [
    'Wedding',
    'Birthday',
    'Corporate',
    'Concert',
    'Conference',
    'Festival',
    'Sports',
    'Other',
  ];

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter an event name');
      return;
    }

    setIsLoading(true);

    try {
      const eventDateIso = eventDate.toISOString().slice(0, 10);
      const eventTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const eventStartAtUtc = new Date(`${eventDateIso}T12:00:00.000Z`).toISOString();

      const { data, error } = await supabase
        .from('events')
        .insert({
          photographer_id: profile?.id,
          name: name.trim(),
          description: description.trim() || null,
          event_date: eventDateIso,
          event_timezone: eventTimezone,
          event_start_at_utc: eventStartAtUtc,
          location: location.trim() || null,
          event_type: eventType || null,
          expected_guests: estimatedGuests ? parseInt(estimatedGuests, 10) : null,
          base_price: basePrice ? parseFloat(basePrice) : 0,
          status: 'draft',
        })
        .select()
        .single();

      if (error) throw error;

      Alert.alert(
        'Event Created',
        'Your event has been created. You can now upload photos to it.',
        [
          {
            text: 'View Event',
            onPress: () => router.replace(`/event/${data.id}`),
          },
          {
            text: 'Upload Photos',
            onPress: () => router.replace('/(creator)/upload' as any),
          },
        ]
      );
    } catch (err) {
      console.error('Create event error:', err);
      Alert.alert('Error', 'Failed to create event. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Event</Text>
        <Pressable
          style={({ pressed }) => [
            styles.createButton,
            isLoading && styles.createButtonDisabled,
            pressed && styles.pressed,
          ]}
          onPress={handleCreate}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create</Text>
          )}
        </Pressable>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Event Name */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Event Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g., John & Sarah's Wedding"
            placeholderTextColor={colors.secondary}
            style={styles.textInput}
            maxLength={100}
          />
        </View>

        {/* Event Date */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Event Date *</Text>
          <Pressable
            style={({ pressed }) => [
              styles.dateButton,
              pressed && styles.dateButtonPressed,
            ]}
            onPress={() => {
              // For full functionality, install @react-native-community/datetimepicker
              Alert.alert(
                'Select Date',
                'For advanced date selection, use the web dashboard. You can update the date after creating the event.',
                [{ text: 'OK' }]
              );
            }}
          >
            <Calendar size={18} color={colors.secondary} />
            <Text style={styles.dateButtonText}>
              {eventDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <ChevronDown size={18} color={colors.secondary} />
          </Pressable>
          <Text style={styles.inputHint}>
            Default: Today. Can be modified later.
          </Text>
        </View>

        {/* Location */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Location</Text>
          <View style={styles.inputWithIcon}>
            <MapPin size={18} color={colors.secondary} style={styles.inputIcon} />
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Venue name or address"
              placeholderTextColor={colors.secondary}
              style={styles.textInputWithIcon}
              maxLength={200}
            />
          </View>
        </View>

        {/* Event Type */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Event Type</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.eventTypesContainer}
          >
            {eventTypes.map((type) => (
              <Pressable
                key={type}
                style={({ pressed }) => [
                  styles.eventTypeChip,
                  eventType === type && styles.eventTypeChipSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => setEventType(eventType === type ? '' : type)}
              >
                <Text style={[
                  styles.eventTypeText,
                  eventType === type && styles.eventTypeTextSelected,
                ]}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Description</Text>
          <View style={styles.inputWithIcon}>
            <Info size={18} color={colors.secondary} style={styles.inputIcon} />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description of the event"
              placeholderTextColor={colors.secondary}
              style={[styles.textInputWithIcon, styles.textArea]}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
          </View>
        </View>

        {/* Estimated Guests */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Estimated Guests</Text>
          <View style={styles.inputWithIcon}>
            <Users size={18} color={colors.secondary} style={styles.inputIcon} />
            <TextInput
              value={estimatedGuests}
              onChangeText={setEstimatedGuests}
              placeholder="Approximate number"
              placeholderTextColor={colors.secondary}
              style={styles.textInputWithIcon}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
        </View>

        {/* Base Price */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Base Price per Photo</Text>
          <View style={styles.inputWithIcon}>
            <DollarSign size={18} color={colors.secondary} style={styles.inputIcon} />
            <TextInput
              value={basePrice}
              onChangeText={setBasePrice}
              placeholder="0.00"
              placeholderTextColor={colors.secondary}
              style={styles.textInputWithIcon}
              keyboardType="decimal-pad"
              maxLength={8}
            />
          </View>
          <Text style={styles.inputHint}>
            Set to 0 for free photos. Can be changed later.
          </Text>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What happens next?</Text>
          <Text style={styles.infoText}>
            After creating your event, you can:{'\n'}
            • Upload photos from your camera roll{'\n'}
            • Share the event link with attendees{'\n'}
            • Generate a QR code for the venue{'\n'}
            • Customize pricing and settings
          </Text>
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
  pressed: {
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  createButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.foreground,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  inputIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  textInputWithIcon: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
    padding: 0,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 6,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  dateButtonPressed: {
    backgroundColor: colors.muted,
  },
  dateButtonText: {
    flex: 1,
    fontSize: 15,
    color: colors.foreground,
  },
  eventTypesContainer: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  eventTypeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventTypeChipSelected: {
    backgroundColor: colors.accent + '15',
    borderColor: colors.accent,
  },
  eventTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  eventTypeTextSelected: {
    color: colors.accent,
  },
  infoCard: {
    backgroundColor: colors.accent + '10',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '20',
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 22,
  },
});



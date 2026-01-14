/**
 * Privacy & Security Settings Screen
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Shield,
  Eye,
  Trash2,
  Lock,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

export default function PrivacySecurityScreen() {
  const router = useRouter();
  const { profile, signOut } = useAuthStore();

  const [profilePublic, setProfilePublic] = useState(true);
  const [showInSearch, setShowInSearch] = useState(true);
  const [isDeletingFaceData, setIsDeletingFaceData] = useState(false);

  const handleDeleteFaceData = () => {
    Alert.alert(
      'Delete Face Data',
      'This will permanently delete your face recognition data. You will need to scan again to find photos at events. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingFaceData(true);
            try {
              // Delete face data from AWS Rekognition via API
              const apiUrl = process.env.EXPO_PUBLIC_API_URL;
              await fetch(`${apiUrl}/api/face/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendeeId: profile?.id }),
              });

              Alert.alert('Success', 'Your face data has been deleted.');
            } catch (err) {
              console.error('Delete face data error:', err);
              Alert.alert('Error', 'Failed to delete face data. Please try again.');
            } finally {
              setIsDeletingFaceData(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Type "DELETE" to confirm account deletion.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Confirm',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // This would call a server function to delete the account
                      await signOut();
                    } catch (err) {
                      console.error('Delete account error:', err);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Privacy Settings */}
        <Text style={styles.sectionTitle}>Privacy</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={styles.settingHeader}>
              <Eye size={20} color={colors.secondary} />
              <Text style={styles.settingTitle}>Public Profile</Text>
            </View>
            <Text style={styles.settingDescription}>
              Allow others to view your profile and photos
            </Text>
          </View>
          <Switch
            value={profilePublic}
            onValueChange={setProfilePublic}
            trackColor={{ false: colors.muted, true: colors.accent + '50' }}
            thumbColor={profilePublic ? colors.accent : colors.secondary}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <View style={styles.settingHeader}>
              <Shield size={20} color={colors.secondary} />
              <Text style={styles.settingTitle}>Appear in Search</Text>
            </View>
            <Text style={styles.settingDescription}>
              Let photographers find you by your FaceTag
            </Text>
          </View>
          <Switch
            value={showInSearch}
            onValueChange={setShowInSearch}
            trackColor={{ false: colors.muted, true: colors.accent + '50' }}
            thumbColor={showInSearch ? colors.accent : colors.secondary}
          />
        </View>

        {/* Security */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Security</Text>

        <TouchableOpacity style={styles.menuRow}>
          <Lock size={20} color={colors.secondary} />
          <Text style={styles.menuLabel}>Change Password</Text>
          <ChevronRight size={20} color={colors.secondary} />
        </TouchableOpacity>

        {/* Face Data */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.xl }]}>Face Recognition Data</Text>

        <Card style={styles.faceDataCard}>
          <View style={styles.faceDataHeader}>
            <Shield size={24} color={colors.accent} />
            <View style={styles.faceDataInfo}>
              <Text style={styles.faceDataTitle}>Your Face Data</Text>
              <Text style={styles.faceDataDescription}>
                Used to find photos of you at events
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            onPress={handleDeleteFaceData}
            loading={isDeletingFaceData}
            style={{ marginTop: spacing.md }}
          >
            <Trash2 size={16} color={colors.destructive} />
            {' Delete Face Data'}
          </Button>
        </Card>

        {/* Danger Zone */}
        <Text style={[styles.sectionTitle, styles.dangerTitle, { marginTop: spacing.xl }]}>
          Danger Zone
        </Text>

        <Card style={styles.dangerCard}>
          <View style={styles.dangerHeader}>
            <AlertTriangle size={24} color={colors.destructive} />
            <View style={styles.dangerInfo}>
              <Text style={styles.dangerTitle}>Delete Account</Text>
              <Text style={styles.dangerDescription}>
                Permanently delete your account and all data
              </Text>
            </View>
          </View>
          <Button
            variant="outline"
            onPress={handleDeleteAccount}
            style={[styles.dangerButton, { marginTop: spacing.md }]}
          >
            <Trash2 size={16} color={colors.destructive} />
            {' Delete Account'}
          </Button>
        </Card>
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
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  settingTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground,
  },
  settingDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
    marginLeft: 28,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  menuLabel: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  faceDataCard: {
    borderColor: colors.accent + '30',
  },
  faceDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceDataInfo: {
    marginLeft: spacing.md,
    flex: 1,
  },
  faceDataTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  faceDataDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  dangerCard: {
    borderColor: colors.destructive + '30',
    backgroundColor: colors.destructive + '05',
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dangerInfo: {
    marginLeft: spacing.md,
    flex: 1,
  },
  dangerTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  dangerDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  dangerButton: {
    borderColor: colors.destructive,
  },
});

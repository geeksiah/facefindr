/**
 * Register Screen
 */

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { ArrowLeft, Mail, Lock, User, Camera } from 'lucide-react-native';

import { Button, Input, Card } from '@/components/ui';
import { UsernameSelector } from '@/components/auth';
import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';
import { isCreatorUserType } from '@/lib/user-type';

type UserType = 'attendee' | 'creator';

export default function RegisterScreen() {
  const router = useRouter();
  const { signUp, isLoading } = useAuthStore();
  
  const [userType, setUserType] = useState<UserType>('attendee');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [previewFaceTag, setPreviewFaceTag] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!displayName.trim()) {
      newErrors.displayName = 'Name is required';
    }
    
    if (!username || username.length < 4) {
      newErrors.username = 'Username must be at least 4 characters';
    } else if (!previewFaceTag) {
      newErrors.username = 'Please choose a valid username';
    }
    
    if (!email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    
    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    const { error } = await signUp(email, password, userType, displayName, username);
    
    if (error) {
      Alert.alert('Registration Failed', error);
    } else {
      Alert.alert(
        'Check Your Email',
        'We sent you a confirmation email. Please verify your email to continue.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <ArrowLeft size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>
              Join Ferchr to find and share your photos
            </Text>

            {/* User Type Selection */}
            <Text style={styles.label}>I am a...</Text>
            <View style={styles.userTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.userTypeOption,
                  userType === 'attendee' && styles.userTypeSelected,
                ]}
                onPress={() => setUserType('attendee')}
              >
                <View
                  style={[
                    styles.userTypeIcon,
                    userType === 'attendee' && styles.userTypeIconSelected,
                  ]}
                >
                  <User
                    size={24}
                    color={userType === 'attendee' ? '#fff' : colors.secondary}
                  />
                </View>
                <Text
                  style={[
                    styles.userTypeTitle,
                    userType === 'attendee' && styles.userTypeTitleSelected,
                  ]}
                >
                  Attendee
                </Text>
                <Text style={styles.userTypeDescription}>
                  Find my photos at events
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.userTypeOption,
                  isCreatorUserType(userType) && styles.userTypeSelected,
                ]}
                onPress={() => setUserType('creator')}
              >
                <View
                  style={[
                    styles.userTypeIcon,
                    isCreatorUserType(userType) && styles.userTypeIconSelected,
                  ]}
                >
                  <Camera
                    size={24}
                    color={isCreatorUserType(userType) ? '#fff' : colors.secondary}
                  />
                </View>
                <Text
                  style={[
                    styles.userTypeTitle,
                    isCreatorUserType(userType) && styles.userTypeTitleSelected,
                  ]}
                >
                  Creator
                </Text>
                <Text style={styles.userTypeDescription}>
                  Upload and sell photos
                </Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <Input
                label="Full Name"
                placeholder="John Doe"
                value={displayName}
                onChangeText={setDisplayName}
                autoComplete="name"
                error={errors.displayName}
                leftIcon={<User size={20} color={colors.secondary} />}
              />

              {/* Username / FaceTag Selection */}
              <View style={styles.usernameSection}>
                <Text style={styles.usernameLabel}>Choose your FaceTag</Text>
                <UsernameSelector
                  value={username}
                  onChange={setUsername}
                  onFaceTagChange={setPreviewFaceTag}
                />
                {errors.username && (
                  <Text style={styles.usernameError}>{errors.username}</Text>
                )}
              </View>

              <Input
                label="Email"
                placeholder="you@example.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                error={errors.email}
                leftIcon={<Mail size={20} color={colors.secondary} />}
              />

              <Input
                label="Password"
                placeholder="Min. 8 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                error={errors.password}
                leftIcon={<Lock size={20} color={colors.secondary} />}
              />

              <Input
                label="Confirm Password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
                error={errors.confirmPassword}
                leftIcon={<Lock size={20} color={colors.secondary} />}
              />

              <Button
                onPress={handleRegister}
                loading={isLoading}
                fullWidth
                size="lg"
              >
                Create Account
              </Button>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.footerLink}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>

            <Text style={styles.terms}>
              By creating an account, you agree to our Terms of Service and
              Privacy Policy
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: 'bold',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  userTypeContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  userTypeOption: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  userTypeSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '10',
  },
  userTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  userTypeIconSelected: {
    backgroundColor: colors.accent,
  },
  userTypeTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  userTypeTitleSelected: {
    color: colors.accent,
  },
  userTypeDescription: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    marginTop: 2,
    textAlign: 'center',
  },
  form: {
    gap: spacing.sm,
  },
  usernameSection: {
    marginVertical: spacing.sm,
  },
  usernameLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  usernameError: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  footerLink: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: '600',
  },
  terms: {
    fontSize: fontSize.xs,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.lg,
    lineHeight: 18,
  },
});

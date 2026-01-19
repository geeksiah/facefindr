/**
 * Username Selector Component (Mobile)
 * 
 * Allows users to choose a username and see the
 * system-generated FaceTag suffix in real-time.
 * Format: @username+suffix (e.g., @amara+k7x2)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AtSign, Check, X } from 'lucide-react-native';

import { colors, spacing, borderRadius } from '@/lib/theme';

const API_URL = process.env.EXPO_PUBLIC_API_URL || '';

interface UsernameSelectorProps {
  value: string;
  onChange: (username: string) => void;
  onFaceTagChange?: (faceTag: string | null) => void;
  disabled?: boolean;
}

interface PreviewResult {
  valid: boolean;
  cleanedUsername: string;
  sampleSuffix?: string;
  previewTag?: string;
  error?: string;
  isFirstUser?: boolean;
  isRandomized?: boolean;
}

export function UsernameSelector({
  value,
  onChange,
  onFaceTagChange,
  disabled = false,
}: UsernameSelectorProps) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async (username: string) => {
    if (!username || username.length < 1) {
      setPreview(null);
      onFaceTagChange?.(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/facetag/preview?username=${encodeURIComponent(username)}`);
      const data = await response.json();
      setPreview(data);
      
      if (data.valid && data.previewTag) {
        onFaceTagChange?.(data.previewTag);
      } else {
        onFaceTagChange?.(null);
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
      setPreview(null);
      onFaceTagChange?.(null);
    } finally {
      setIsLoading(false);
    }
  }, [onFaceTagChange]);

  useEffect(() => {
    // Debounce the API call
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchPreview(value);
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [value, fetchPreview]);

  const handleInputChange = (text: string) => {
    // Allow letters, numbers, and underscores, limit to 20 chars
    const cleaned = text.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    onChange(cleaned);
  };

  const charCount = value.length;
  const startsWithNumberOrUnderscore = /^[0-9_]/.test(value);

  return (
    <View style={styles.container}>
      {/* Input Field */}
      <View style={[
        styles.inputContainer,
        preview?.valid && styles.inputValid,
        preview?.error && styles.inputError,
        isFocused && styles.inputFocused,
      ]}>
        <AtSign size={20} color={colors.secondary} style={styles.inputIcon} />
        <TextInput
          value={value}
          onChangeText={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          editable={!disabled}
          placeholder="Choose a username"
          placeholderTextColor={colors.secondary}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <View style={styles.inputStatus}>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : preview?.valid ? (
            <Check size={20} color="#10b981" />
          ) : preview?.error ? (
            <X size={20} color="#ef4444" />
          ) : null}
        </View>
      </View>

      {/* Character Counter */}
      <View style={styles.counterRow}>
        <Text style={[
          styles.counterText,
          charCount >= 3 && charCount <= 20 && styles.counterValid,
          charCount > 20 && styles.counterError,
        ]}>
          {charCount}/20 characters {charCount < 3 && '(min 3)'}
        </Text>
        {startsWithNumberOrUnderscore && (
          <Text style={styles.errorText}>Must start with a letter</Text>
        )}
      </View>

      {/* Real-time FaceTag Preview */}
      {value.length > 0 && (
        <View style={[
          styles.previewContainer,
          preview?.valid && styles.previewValid,
          preview?.error && styles.previewError,
        ]}>
          {preview?.valid ? (
            <View>
              <Text style={styles.previewLabel}>Your FaceTag will look like:</Text>
              <View style={styles.faceTagRow}>
                <Text style={styles.faceTagUsername}>@{preview.cleanedUsername}</Text>
                <Text style={styles.faceTagSuffix}>+{preview.sampleSuffix}</Text>
              </View>
              {preview.isFirstUser ? (
                <View style={styles.firstUserBadge}>
                  <Check size={12} color="#10b981" />
                  <Text style={styles.firstUserText}>
                    You&apos;ll be the first with this username!
                  </Text>
                </View>
              ) : (
                <Text style={styles.sequenceText}>
                  A unique random suffix will be assigned to you
                </Text>
              )}
            </View>
          ) : preview?.error ? (
            <View style={styles.errorRow}>
              <X size={16} color="#ef4444" />
              <Text style={styles.errorMessage}>{preview.error}</Text>
            </View>
          ) : isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.secondary} />
              <Text style={styles.loadingText}>Checking availability...</Text>
            </View>
          ) : (
            <Text style={styles.hintText}>
              Enter at least 3 characters to see your FaceTag
            </Text>
          )}
        </View>
      )}

      {/* Help Text */}
      <Text style={styles.helpText}>
        Your FaceTag is your unique identifier. Choose a memorable username 
        (3-20 characters) and we&apos;ll add a unique suffix to make it yours.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  inputValid: {
    borderColor: '#10b98150',
  },
  inputError: {
    borderColor: '#ef444450',
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  inputIcon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.foreground,
  },
  inputStatus: {
    marginLeft: spacing.sm,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    fontSize: 12,
    color: colors.secondary,
  },
  counterValid: {
    color: '#10b981',
  },
  counterError: {
    color: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
  },
  previewContainer: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  previewValid: {
    backgroundColor: '#10b98110',
    borderColor: '#10b98130',
  },
  previewError: {
    backgroundColor: '#ef444410',
    borderColor: '#ef444430',
  },
  previewLabel: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: spacing.xs,
  },
  faceTagRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  faceTagUsername: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    fontFamily: 'monospace',
  },
  faceTagSuffix: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent,
    fontFamily: 'monospace',
  },
  firstUserBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  firstUserText: {
    fontSize: 12,
    color: '#10b981',
  },
  sequenceText: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 4,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorMessage: {
    fontSize: 14,
    color: '#ef4444',
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: 14,
    color: colors.secondary,
  },
  hintText: {
    fontSize: 14,
    color: colors.secondary,
  },
  helpText: {
    fontSize: 12,
    color: colors.secondary,
    lineHeight: 18,
  },
});

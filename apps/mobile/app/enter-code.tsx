/**
 * Enter Event Code Screen
 * 
 * Manual entry of event codes.
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Hash, Loader2 } from 'lucide-react-native';

import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const CODE_LENGTH = 6;

export default function EnterCodeScreen() {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleCodeChange = (value: string, index: number) => {
    // Allow only alphanumeric
    const sanitized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    
    if (sanitized.length > 1) {
      // Handle paste
      const chars = sanitized.slice(0, CODE_LENGTH - index).split('');
      const newCode = [...code];
      chars.forEach((char, i) => {
        if (index + i < CODE_LENGTH) {
          newCode[index + i] = char;
        }
      });
      setCode(newCode);
      
      const nextIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
    } else {
      const newCode = [...code];
      newCode[index] = sanitized;
      setCode(newCode);
      
      // Auto-focus next input
      if (sanitized && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    }

    setError(null);
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async () => {
    const fullCode = code.join('');
    
    if (fullCode.length !== CODE_LENGTH) {
      setError('Please enter a complete code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check if code exists
      const { data: shareLink, error: linkError } = await supabase
        .from('event_share_links')
        .select('event_id, is_active, expires_at')
        .eq('short_code', fullCode)
        .single();

      if (linkError || !shareLink) {
        setError('Invalid event code. Please check and try again.');
        return;
      }

      if (!shareLink.is_active) {
        setError('This event code is no longer active.');
        return;
      }

      if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
        setError('This event code has expired.');
        return;
      }

      // Navigate to event
      router.replace(`/event/${shareLink.event_id}`);
    } catch (err) {
      console.error('Code lookup error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isCodeComplete = code.every((c) => c !== '');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Hash size={48} color={colors.accent} />
          </View>

          <Text style={styles.title}>Enter Event Code</Text>
          <Text style={styles.subtitle}>
            Enter the 6-character code from your event invitation
          </Text>

          {/* Code Input */}
          <View style={styles.codeContainer}>
            {code.map((char, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref)}
                style={[
                  styles.codeInput,
                  char && styles.codeInputFilled,
                  error && styles.codeInputError,
                ]}
                value={char}
                onChangeText={(value) => handleCodeChange(value, index)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
                maxLength={CODE_LENGTH}
                autoCapitalize="characters"
                keyboardType="default"
                textContentType="oneTimeCode"
                autoFocus={index === 0}
              />
            ))}
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Button
            onPress={handleSubmit}
            loading={isLoading}
            disabled={!isCodeComplete}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          >
            Find Event
          </Button>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.qrOption}
            onPress={() => router.push('/scan')}
          >
            <Text style={styles.qrText}>Scan QR Code Instead</Text>
          </TouchableOpacity>
        </View>
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
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: 'bold',
    color: colors.foreground,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.secondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    lineHeight: 24,
  },
  codeContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  codeInput: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.muted,
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    textAlign: 'center',
    color: colors.foreground,
  },
  codeInputFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '10',
  },
  codeInputError: {
    borderColor: colors.destructive,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.destructive,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xl,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  qrOption: {
    paddingVertical: spacing.md,
  },
  qrText: {
    fontSize: fontSize.base,
    color: colors.accent,
    fontWeight: '500',
  },
});

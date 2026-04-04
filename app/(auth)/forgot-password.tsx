import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { supabase } from '@/integrations/supabase/client.mobile';
import { isEmailValid, sanitizeTextInput } from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    setError(null);

    if (!isEmailValid(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        sanitizeTextInput(email).toLowerCase(),
        { redirectTo: 'eatpal://reset-password' }
      );

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✉</Text>
          <Text style={styles.successTitle}>Reset link sent</Text>
          <Text style={styles.successText}>
            If an account exists for {email}, you'll receive a password reset link shortly.
          </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity
              style={styles.primaryButton}
              accessibilityLabel="Back to login"
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>Back to Login</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.logo}>EatPal</Text>
            <Text style={styles.tagline}>Reset your password</Text>
            <Text style={styles.description}>
              Enter your email and we'll send you a link to reset your password.
            </Text>
          </View>

          <View style={styles.form}>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(text) => { setEmail(text); setError(null); }}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                accessibilityLabel="Email address"
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!isEmailValid(email) || isLoading) && styles.primaryButtonDisabled,
              ]}
              onPress={handleReset}
              disabled={!isEmailValid(email) || isLoading}
              accessibilityLabel="Send reset link"
              accessibilityRole="button"
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remember your password?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity
                style={styles.linkButton}
                accessibilityLabel="Back to login"
                accessibilityRole="link"
              >
                <Text style={styles.linkTextBold}>Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xl,
  },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { fontSize: fontSize.xxxl, fontWeight: '700', color: colors.primary, letterSpacing: -0.5 },
  tagline: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  description: {
    fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.sm, lineHeight: 20, paddingHorizontal: spacing.md,
  },
  form: { gap: spacing.md },
  fieldGroup: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: {
    height: 48, backgroundColor: colors.inputBackground, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, fontSize: fontSize.md, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  primaryButton: {
    height: 48, backgroundColor: colors.primary, borderRadius: borderRadius.md,
    justifyContent: 'center', alignItems: 'center', marginTop: spacing.sm,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { fontSize: fontSize.md, fontWeight: '600', color: colors.background },
  errorBanner: {
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: borderRadius.md, padding: spacing.md,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error },
  footer: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: spacing.xl, gap: spacing.xs,
  },
  footerText: { fontSize: fontSize.sm, color: colors.textSecondary },
  linkButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  linkTextBold: { fontSize: fontSize.md, fontWeight: '600', color: colors.primary },
  successContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg,
  },
  successIcon: {
    fontSize: 48, color: colors.primary, marginBottom: spacing.md,
    width: 80, height: 80, textAlign: 'center', lineHeight: 80,
    backgroundColor: '#ecfdf5', borderRadius: 40, overflow: 'hidden',
  },
  successTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  successText: {
    fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center',
    marginBottom: spacing.xl, lineHeight: 22,
  },
});

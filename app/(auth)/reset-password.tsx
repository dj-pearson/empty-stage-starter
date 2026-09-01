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
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client.mobile';
import {
  checkPasswordRequirements,
  isPasswordValid,
  isEmailValid,
  sanitizeTextInput,
} from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

const CODE_LENGTH = 6;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();

  // Two stages: verify the emailed code, then set the new password. Stage two
  // is only reachable once verifyOtp has handed back a recovery session, which
  // is what updateUser() then authenticates against.
  const [stage, setStage] = useState<'verify' | 'password'>('verify');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const requirements = checkPasswordRequirements(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;
  const canVerify = isEmailValid(email) && code.length === CODE_LENGTH;
  const canSubmit = isPasswordValid(password) && passwordsMatch;

  const handleVerify = async () => {
    setError(null);

    if (!canVerify) {
      setError('Enter your email and the 6-digit code from your inbox.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: sanitizeTextInput(email).toLowerCase(),
        token: code,
        type: 'recovery',
      });

      if (verifyError) {
        setCode('');
        setError('That code did not work. Check it and try again.');
        return;
      }

      setStage('password');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError(null);

    if (!isEmailValid(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      await supabase.auth.resetPasswordForEmail(sanitizeTextInput(email).toLowerCase());
      // Deliberately not confirming whether the address has an account.
      setError(null);
    } catch {
      setError('Could not send a new code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetPassword = async () => {
    setError(null);

    if (!canSubmit) {
      setError('Check the password requirements below.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setDone(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Password updated</Text>
          <Text style={styles.successText}>
            You can now sign in with your new password.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace('/(auth)/login')}
            accessibilityLabel="Go to login"
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Sign In</Text>
          </TouchableOpacity>
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
            <Text style={styles.tagline}>
              {stage === 'verify' ? 'Enter your reset code' : 'Create a new password'}
            </Text>
            <Text style={styles.description}>
              {stage === 'verify'
                ? 'We emailed you a 6-digit code. Enter it below to continue.'
                : 'Choose a strong password for your account.'}
            </Text>
          </View>

          <View style={styles.form}>
            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {stage === 'verify' ? (
              <>
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

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Reset code</Text>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    value={code}
                    onChangeText={(text) => {
                      setCode(text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH));
                      setError(null);
                    }}
                    placeholder="123456"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={CODE_LENGTH}
                    accessibilityLabel="Six digit reset code"
                    editable={!isLoading}
                  />
                  <Text style={styles.helperText}>
                    The code expires in 1 hour. Check your spam folder if it has not arrived.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, (!canVerify || isLoading) && styles.primaryButtonDisabled]}
                  onPress={handleVerify}
                  disabled={!canVerify || isLoading}
                  accessibilityLabel="Verify code"
                  accessibilityRole="button"
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.background} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify Code</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={handleResend}
                  disabled={isLoading}
                  accessibilityLabel="Send me a new code"
                  accessibilityRole="button"
                >
                  <Text style={styles.linkTextBold}>Send me a new code</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.requirements}>
                  <Text style={styles.requirementsTitle}>Password must have:</Text>
                  <Requirement met={requirements.minLength} label="At least 12 characters" />
                  <Requirement met={requirements.hasUppercase} label="An uppercase letter" />
                  <Requirement met={requirements.hasLowercase} label="A lowercase letter" />
                  <Requirement met={requirements.hasNumber} label="A number" />
                  <Requirement met={requirements.hasSpecial} label="A special character" />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>New password</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={(text) => { setPassword(text); setError(null); }}
                    placeholder="Enter a new password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    accessibilityLabel="New password"
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm password</Text>
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
                    placeholder="Re-enter your new password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    accessibilityLabel="Confirm new password"
                    editable={!isLoading}
                  />
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <Text style={styles.errorText}>Passwords don't match</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, (!canSubmit || isLoading) && styles.primaryButtonDisabled]}
                  onPress={handleSetPassword}
                  disabled={!canSubmit || isLoading}
                  accessibilityLabel="Set new password"
                  accessibilityRole="button"
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors.background} size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Set New Password</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
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

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.requirementRow}>
      <Text style={[styles.requirementDot, met && styles.requirementDotMet]}>
        {met ? '✓' : '•'}
      </Text>
      <Text style={[styles.requirementLabel, met && styles.requirementLabelMet]}>{label}</Text>
    </View>
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
  codeInput: { letterSpacing: 8, fontSize: fontSize.lg, fontWeight: '600' },
  helperText: { fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 18 },
  requirements: {
    backgroundColor: colors.inputBackground, borderRadius: borderRadius.md,
    padding: spacing.md, gap: spacing.xs,
  },
  requirementsTitle: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs,
  },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  requirementDot: { fontSize: fontSize.sm, color: colors.textSecondary, width: 16 },
  requirementDotMet: { color: colors.primary },
  requirementLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  requirementLabelMet: { color: colors.text },
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

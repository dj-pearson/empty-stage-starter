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
import {
  isEmailValid,
  isPasswordValid,
  checkPasswordRequirements,
  sanitizeTextInput,
} from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reqs = checkPasswordRequirements(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isFormValid = isEmailValid(email) && isPasswordValid(password) && passwordsMatch;

  const handleSignup = async () => {
    setError(null);

    if (!isEmailValid(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!isPasswordValid(password)) {
      setError('Password does not meet all requirements.');
      return;
    }

    if (!passwordsMatch) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email: sanitizeTextInput(email).toLowerCase(),
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      setSuccess(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Check your email</Text>
          <Text style={styles.successText}>
            We've sent a confirmation link to {email}. Please verify your email to complete signup.
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
            <Text style={styles.tagline}>Create your account</Text>
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

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(text) => { setPassword(text); setError(null); }}
                  placeholder="Create a strong password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  accessibilityLabel="Password"
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>

              {/* Password Requirements */}
              {password.length > 0 && (
                <View style={styles.requirements}>
                  <Requirement met={reqs.minLength} label="12+ characters" />
                  <Requirement met={reqs.hasUppercase} label="Uppercase letter" />
                  <Requirement met={reqs.hasLowercase} label="Lowercase letter" />
                  <Requirement met={reqs.hasNumber} label="Number" />
                  <Requirement met={reqs.hasSpecial} label="Special character" />
                </View>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={[
                  styles.input,
                  confirmPassword.length > 0 && !passwordsMatch && styles.inputError,
                ]}
                value={confirmPassword}
                onChangeText={(text) => { setConfirmPassword(text); setError(null); }}
                placeholder="Confirm your password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                textContentType="newPassword"
                accessibilityLabel="Confirm password"
                editable={!isLoading}
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <Text style={styles.fieldError}>Passwords do not match</Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, (!isFormValid || isLoading) && styles.primaryButtonDisabled]}
              onPress={handleSignup}
              disabled={!isFormValid || isLoading}
              accessibilityLabel="Create account"
              accessibilityRole="button"
              accessibilityState={{ disabled: !isFormValid || isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity
                style={styles.linkButton}
                accessibilityLabel="Sign in"
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
    <View style={styles.reqRow}>
      <Text style={[styles.reqIcon, met && styles.reqIconMet]}>
        {met ? '✓' : '○'}
      </Text>
      <Text style={[styles.reqLabel, met && styles.reqLabelMet]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  header: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { fontSize: fontSize.xxxl, fontWeight: '700', color: colors.primary, letterSpacing: -0.5 },
  tagline: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.xs },
  form: { gap: spacing.md },
  fieldGroup: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  input: {
    height: 48,
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.error },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1, height: 48, paddingHorizontal: spacing.md,
    fontSize: fontSize.md, color: colors.text,
  },
  toggleButton: { paddingHorizontal: spacing.md, height: 48, justifyContent: 'center' },
  toggleText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.primary },
  requirements: { gap: 4, marginTop: spacing.xs },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reqIcon: { fontSize: 12, color: colors.textSecondary },
  reqIconMet: { color: colors.success },
  reqLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  reqLabelMet: { color: colors.success },
  fieldError: { fontSize: fontSize.xs, color: colors.error },
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
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  successIcon: {
    fontSize: 48, color: colors.success, marginBottom: spacing.md,
    width: 80, height: 80, textAlign: 'center', lineHeight: 80,
    backgroundColor: '#ecfdf5', borderRadius: 40, overflow: 'hidden',
  },
  successTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  successText: {
    fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center',
    marginBottom: spacing.xl, lineHeight: 22,
  },
});

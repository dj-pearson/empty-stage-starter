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
import { useRouter, Link } from 'expo-router';
import { supabase } from '@/integrations/supabase/client.mobile';
import {
  isEmailValid,
  sanitizeTextInput,
  checkLoginRateLimit,
  recordLoginAttempt,
  clearLoginAttempts,
  formatRetryAfter,
} from '../../app/mobile/lib/validation';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutMessage, setLockoutMessage] = useState<string | null>(null);

  const isFormValid = isEmailValid(email) && password.length > 0;

  const handleLogin = async () => {
    setError(null);

    const rateLimit = checkLoginRateLimit();
    if (!rateLimit.allowed) {
      setLockoutMessage(
        `Too many login attempts. Please try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`
      );
      return;
    }

    if (!isEmailValid(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length === 0) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      recordLoginAttempt();

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: sanitizeTextInput(email).toLowerCase(),
        password,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Invalid email or password. Please try again.'
          : authError.message);
        return;
      }

      clearLoginAttempts();
      router.replace('/(tabs)/');
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
          {/* Branding */}
          <View style={styles.header}>
            <Text style={styles.logo}>EatPal</Text>
            <Text style={styles.tagline}>
              Meal planning made simple for families
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {lockoutMessage && (
              <View style={styles.lockoutBanner}>
                <Text style={styles.lockoutText}>{lockoutMessage}</Text>
              </View>
            )}

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setError(null);
                  setLockoutMessage(null);
                }}
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

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError(null);
                  }}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  accessibilityLabel="Password"
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={styles.toggleButton}
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                >
                  <Text style={styles.toggleText}>
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!isFormValid || isLoading) && styles.primaryButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={!isFormValid || isLoading}
              accessibilityLabel="Sign in"
              accessibilityRole="button"
              accessibilityState={{ disabled: !isFormValid || isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Forgot Password */}
            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity
                style={styles.linkButton}
                accessibilityLabel="Forgot password"
                accessibilityRole="link"
              >
                <Text style={styles.linkText}>Forgot your password?</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Sign Up Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account?</Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity
                style={styles.linkButton}
                accessibilityLabel="Sign up for an account"
                accessibilityRole="link"
              >
                <Text style={styles.linkTextBold}>Sign Up</Text>
              </TouchableOpacity>
            </Link>
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
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  logo: {
    fontSize: fontSize.xxxl,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
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
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.md,
    color: colors.text,
  },
  toggleButton: {
    paddingHorizontal: spacing.md,
    height: 48,
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.background,
  },
  linkButton: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  linkTextBold: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.primary,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
  },
  lockoutBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  lockoutText: {
    fontSize: fontSize.sm,
    color: colors.warning,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});

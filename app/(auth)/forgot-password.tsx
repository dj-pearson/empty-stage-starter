import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { useMobileAuth } from '../providers/MobileAuthProvider';
import { Button, Input } from '../components/ui';

export default function ForgotPasswordScreen() {
  const { resetPassword } = useMobileAuth();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Invalid email address');
      return;
    }
    setError('');
    setIsLoading(true);
    const { error: resetError } = await resetPassword(email.trim());
    setIsLoading(false);

    if (resetError) {
      Alert.alert('Error', resetError);
    } else {
      Alert.alert(
        'Check Your Email',
        'If an account exists with that email, we sent password reset instructions.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.logo}>EatPal</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your email and we'll send you instructions to reset your password.
            </Text>

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={error}
              onSubmitEditing={handleReset}
              accessibilityLabel="Email address"
            />

            <Button onPress={handleReset} loading={isLoading} size="lg">
              Send Reset Link
            </Button>
          </View>

          <View style={styles.footer}>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity accessibilityRole="link">
                <Text style={styles.footerLink}>Back to Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 36, fontWeight: '800', color: '#10b981' },
  form: { marginBottom: 32 },
  title: { fontSize: 24, fontWeight: '700', color: '#09090b', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#71717a', marginBottom: 24, lineHeight: 22 },
  footer: { alignItems: 'center' },
  footerLink: { fontSize: 14, color: '#10b981', fontWeight: '600' },
});

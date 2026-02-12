import { Redirect } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect } from 'react';
import { useMobileAuth } from './providers/MobileAuthProvider';

export default function Index() {
  // On web, redirect to the existing React app
  useEffect(() => {
    if (Platform.OS === 'web') {
      window.location.href = '/';
    }
  }, []);

  if (Platform.OS === 'web') return null;

  const { session, isLoading } = useMobileAuth();

  if (isLoading) return null;

  // Route to appropriate section based on auth state
  if (session) {
    return <Redirect href="/(tabs)/home" />;
  }

  return <Redirect href="/(auth)/login" />;
}

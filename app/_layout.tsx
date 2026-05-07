import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Platform, ActivityIndicator, View } from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { Session } from '@supabase/supabase-js';
import { MobileErrorBoundary } from './mobile/components/MobileErrorBoundary';
import { addBreadcrumb } from './mobile/lib/sentryMobile';
import { ThemeProvider } from './mobile/contexts/ThemeContext';
import { useOfflineSyncDriver } from './mobile/hooks/useOfflineSyncDriver';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      addBreadcrumb({
        category: 'auth',
        level: 'info',
        message: s ? 'session-resumed' : 'session-ended',
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // Still loading

    const inAuthGroup = segments[0] === '(auth)';
    addBreadcrumb({
      category: 'navigation',
      level: 'info',
      message: `route:${segments.join('/') || 'index'}`,
    });

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/');
    }
  }, [session, segments]);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * US-127: thin component wrapper that mounts the offline-sync hook in a
 * place where the ThemeProvider + AuthGate are already in scope. Hooks
 * must be inside the React tree, so we can't call this from RootLayout
 * directly when RootLayout returns `null` for the web branch.
 */
function SyncDriverMount() {
  useOfflineSyncDriver();
  return null;
}

export default function RootLayout() {
  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <MobileErrorBoundary>
      <ThemeProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <SyncDriverMount />
          <AuthGate>
            <Slot />
          </AuthGate>
        </SafeAreaProvider>
      </ThemeProvider>
    </MobileErrorBoundary>
  );
}


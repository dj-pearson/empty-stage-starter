import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Platform, useColorScheme } from 'react-native';
import { MobileAuthProvider } from './providers/MobileAuthProvider';
import { MobileAppProvider } from './providers/MobileAppProvider';
import { MobileThemeProvider, useTheme } from './providers/MobileThemeProvider';
import { MobileErrorBoundary } from './components/MobileErrorBoundary';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';

// Prevent the splash screen from auto-hiding before app is ready
SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { colors } = useTheme();
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      // Check for OTA updates in production
      if (!__DEV__) {
        try {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        } catch (e) {
          // OTA check is best-effort; don't block app startup
          console.log('OTA update check skipped:', e);
        }
      }
      setAppReady(true);
      await SplashScreen.hideAsync();
    }
    prepare();
  }, []);

  if (!appReady) return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: Platform.OS === 'android' ? 'fade_from_bottom' : 'default',
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="scanner"
          options={{
            presentation: 'fullScreenModal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="recipe/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Recipe',
            headerBackTitle: 'Back',
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="kid/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Child Profile',
            headerBackTitle: 'Back',
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.background },
          }}
        />
        <Stack.Screen
          name="meal-detail/[id]"
          options={{
            headerShown: true,
            headerTitle: 'Meal Detail',
            headerBackTitle: 'Back',
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.background },
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // For web, return null - the Vite app handles web routing
  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <MobileErrorBoundary>
      <SafeAreaProvider>
        <MobileThemeProvider>
          <MobileAuthProvider>
            <MobileAppProvider>
              <AppContent />
            </MobileAppProvider>
          </MobileAuthProvider>
        </MobileThemeProvider>
      </SafeAreaProvider>
    </MobileErrorBoundary>
  );
}

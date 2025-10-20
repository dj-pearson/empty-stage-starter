import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

export default function RootLayout() {
  // For mobile platforms, we use Expo Router's native navigation
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Slot />
      </SafeAreaProvider>
    );
  }

  // For web, we'll redirect to the existing web app
  // This allows us to maintain the existing web codebase while adding mobile support
  return null;
}


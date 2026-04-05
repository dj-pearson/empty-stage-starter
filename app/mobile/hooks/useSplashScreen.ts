import { useEffect, useCallback, useState } from 'react';

/**
 * Splash screen management hook
 * 
 * Keeps splash visible until initial data loads, then hides with smooth transition.
 * Prevents white flash between splash and app content on Android.
 */

export function useSplashScreen() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Prevent auto-hide on mount
    const preventHide = async () => {
      try {
        const SplashScreen = await import('expo-splash-screen').catch(() => null);
        if (SplashScreen) {
          await SplashScreen.preventAutoHideAsync();
        }
      } catch {
        // Splash screen may already be hidden
      }
    };
    preventHide();
  }, []);

  const hideSplash = useCallback(async () => {
    try {
      const SplashScreen = await import('expo-splash-screen').catch(() => null);
      if (SplashScreen) {
        await SplashScreen.hideAsync();
      }
      setIsReady(true);
    } catch {
      setIsReady(true);
    }
  }, []);

  const onLayoutReady = useCallback(() => {
    if (isReady) return;
    // Small delay for smooth transition - prevents flash
    setTimeout(() => {
      hideSplash();
    }, 100);
  }, [isReady, hideSplash]);

  return {
    isReady,
    hideSplash,
    onLayoutReady,
  };
}

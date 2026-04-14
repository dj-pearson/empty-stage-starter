import { useState, useEffect, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Biometric authentication hook for Android/iOS
 * Uses expo-local-authentication for fingerprint/face unlock
 * 
 * Security features:
 * - Prompts biometric on app resume (background -> foreground)
 * - 2-minute grace period after last successful auth
 * - Graceful fallback when biometric hardware unavailable
 * - Preference stored in expo-secure-store (not AsyncStorage)
 */

interface BiometricState {
  isAvailable: boolean;
  isEnabled: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  biometricType: string | null;
  error: string | null;
}

const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes
let lastAuthTimestamp = 0;

export function useBiometricAuth() {
  const [state, setState] = useState<BiometricState>({
    isAvailable: false,
    isEnabled: false,
    isAuthenticated: true, // Start authenticated, prompt on resume
    isLoading: true,
    biometricType: null,
    error: null,
  });

  const checkAvailability = useCallback(async () => {
    try {
      const LocalAuth = await import('expo-local-authentication').catch(() => null);
      if (!LocalAuth) {
        setState(prev => ({ ...prev, isAvailable: false, isLoading: false }));
        return;
      }

      const hasHardware = await LocalAuth.hasHardwareAsync();
      const isEnrolled = await LocalAuth.isEnrolledAsync();
      const supportedTypes = await LocalAuth.supportedAuthenticationTypesAsync();

      let biometricType: string | null = null;
      if (supportedTypes.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
        biometricType = 'Face';
      } else if (supportedTypes.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
        biometricType = 'Fingerprint';
      } else if (supportedTypes.includes(LocalAuth.AuthenticationType.IRIS)) {
        biometricType = 'Iris';
      }

      const isAvailable = hasHardware && isEnrolled;

      // Check stored preference
      const SecureStore = await import('expo-secure-store').catch(() => null);
      let isEnabled = false;
      if (SecureStore) {
        const stored = await SecureStore.getItemAsync('biometric_enabled');
        isEnabled = stored === 'true';
      }

      setState(prev => ({
        ...prev,
        isAvailable,
        isEnabled,
        biometricType,
        isLoading: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        isAvailable: false,
        isLoading: false,
        error: 'Failed to check biometric availability',
      }));
    }
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    // Check grace period
    if (Date.now() - lastAuthTimestamp < GRACE_PERIOD_MS) {
      setState(prev => ({ ...prev, isAuthenticated: true }));
      return true;
    }

    try {
      const LocalAuth = await import('expo-local-authentication').catch(() => null);
      if (!LocalAuth) return true; // Skip if not available

      const result = await LocalAuth.authenticateAsync({
        promptMessage: 'Unlock EatPal',
        fallbackLabel: 'Use Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        lastAuthTimestamp = Date.now();
        setState(prev => ({ ...prev, isAuthenticated: true, error: null }));
        return true;
      }

      const errorMessage =
        result.error === 'user_cancel' ? 'Authentication cancelled' :
        result.error === 'not_enrolled' ? 'No biometric data enrolled on device' :
        result.error === 'not_available' ? 'Biometric authentication not available' :
        'Authentication failed';

      setState(prev => ({ ...prev, isAuthenticated: false, error: errorMessage }));
      return false;
    } catch {
      setState(prev => ({ ...prev, error: 'Authentication error' }));
      return false;
    }
  }, []);

  const setEnabled = useCallback(async (enabled: boolean) => {
    try {
      const SecureStore = await import('expo-secure-store').catch(() => null);
      if (SecureStore) {
        await SecureStore.setItemAsync('biometric_enabled', enabled ? 'true' : 'false');
      }
      setState(prev => ({ ...prev, isEnabled: enabled }));
    } catch {
      // Silently fail
    }
  }, []);

  // Check availability on mount
  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  // Handle app state changes - prompt biometric on resume
  useEffect(() => {
    if (!state.isEnabled) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && state.isEnabled) {
        // Only prompt if grace period has elapsed
        if (Date.now() - lastAuthTimestamp >= GRACE_PERIOD_MS) {
          setState(prev => ({ ...prev, isAuthenticated: false }));
          authenticate();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [state.isEnabled, authenticate]);

  return {
    ...state,
    authenticate,
    setEnabled,
    checkAvailability,
  };
}

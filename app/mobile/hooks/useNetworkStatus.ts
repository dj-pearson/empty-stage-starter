import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Network status hook for offline detection
 * Shows offline banner and queues writes for sync
 */

interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
}

export function useNetworkStatus() {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Use dynamic import to avoid web build issues
    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      try {
        const NetInfo = await import('@react-native-community/netinfo').catch(() => null);
        if (!NetInfo) return;

        unsubscribe = NetInfo.default.addEventListener((state: any) => {
          setNetworkState({
            isConnected: state.isConnected ?? true,
            isInternetReachable: state.isInternetReachable ?? true,
          });
        });
      } catch {
        // NetInfo not available, assume connected
      }
    };

    setup();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return networkState;
}

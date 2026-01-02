/**
 * Platform detection utilities for cross-platform support
 */

export const isWeb = () => {
  return typeof window !== 'undefined' && window.document;
};

export const isMobile = () => {
  return !isWeb();
};

export const isIOS = () => {
  if (!isWeb()) {
    try {
      const { Platform } = require('react-native');
      return Platform.OS === 'ios';
    } catch {
      return false;
    }
  }
  return false;
};

export const isAndroid = () => {
  if (!isWeb()) {
    try {
      const { Platform } = require('react-native');
      return Platform.OS === 'android';
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Storage interface for cross-platform compatibility
 */
export interface StorageInterface {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

/**
 * Synchronous storage interface for web-only usage
 * Provides null implementations for mobile to prevent crashes
 */
export interface SyncStorageInterface {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  isAvailable: () => boolean;
}

/**
 * Get synchronous storage implementation (web only)
 * On mobile, returns a no-op implementation that logs warnings
 * Use this for hooks that need synchronous access but should gracefully degrade on mobile
 */
export const getSyncStorage = (): SyncStorageInterface => {
  if (isWeb()) {
    try {
      // Test that localStorage is actually available (could be disabled)
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return {
        getItem: (key: string) => localStorage.getItem(key),
        setItem: (key: string, value: string) => localStorage.setItem(key, value),
        removeItem: (key: string) => localStorage.removeItem(key),
        isAvailable: () => true,
      };
    } catch {
      // localStorage is disabled (e.g., private browsing in some browsers)
      console.warn('localStorage is not available, using memory-only storage');
    }
  }

  // Fallback: memory-only storage for mobile or when localStorage is unavailable
  const memoryStore: Record<string, string> = {};
  return {
    getItem: (key: string) => memoryStore[key] ?? null,
    setItem: (key: string, value: string) => { memoryStore[key] = value; },
    removeItem: (key: string) => { delete memoryStore[key]; },
    isAvailable: () => false,
  };
};

/**
 * Get the appropriate storage implementation for the current platform (async)
 * Use this for operations that can be async (e.g., in useEffect callbacks)
 */
export const getStorage = async (): Promise<StorageInterface> => {
  if (isWeb()) {
    return {
      getItem: async (key: string) => localStorage.getItem(key),
      setItem: async (key: string, value: string) => { localStorage.setItem(key, value); },
      removeItem: async (key: string) => { localStorage.removeItem(key); },
    };
  } else {
    const SecureStore = await import('expo-secure-store');
    return {
      getItem: async (key: string) => await SecureStore.getItemAsync(key),
      setItem: async (key: string, value: string) => { await SecureStore.setItemAsync(key, value); },
      removeItem: async (key: string) => { await SecureStore.deleteItemAsync(key); },
    };
  }
};

/**
 * Safe localStorage wrapper that works on both web and mobile
 * Automatically uses the appropriate storage mechanism
 */
export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    const storage = await getStorage();
    return storage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    const storage = await getStorage();
    return storage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    const storage = await getStorage();
    return storage.removeItem(key);
  },
};

/**
 * Conditional rendering based on platform
 */
export const renderPlatform = <T,>(components: {
  web?: T;
  mobile?: T;
  ios?: T;
  android?: T;
  default?: T;
}): T | null => {
  if (isIOS() && components.ios) return components.ios;
  if (isAndroid() && components.android) return components.android;
  if (isMobile() && components.mobile) return components.mobile;
  if (isWeb() && components.web) return components.web;
  return components.default || null;
};


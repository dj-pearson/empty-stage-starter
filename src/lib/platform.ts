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
 * Get the appropriate storage implementation for the current platform
 */
export const getStorage = async () => {
  if (isWeb()) {
    return {
      getItem: async (key: string) => localStorage.getItem(key),
      setItem: async (key: string, value: string) => localStorage.setItem(key, value),
      removeItem: async (key: string) => localStorage.removeItem(key),
    };
  } else {
    const SecureStore = await import('expo-secure-store');
    return {
      getItem: async (key: string) => await SecureStore.getItemAsync(key),
      setItem: async (key: string, value: string) => await SecureStore.setItemAsync(key, value),
      removeItem: async (key: string) => await SecureStore.deleteItemAsync(key),
    };
  }
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


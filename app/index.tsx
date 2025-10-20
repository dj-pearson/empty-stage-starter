import { Platform } from 'react-native';
import { useEffect } from 'react';

export default function Index() {
  useEffect(() => {
    // On web, redirect to the existing React app
    if (Platform.OS === 'web') {
      // The existing Vite app will handle web routing
      window.location.href = '/';
    }
  }, []);

  // For mobile platforms, render the mobile app
  if (Platform.OS !== 'web') {
    // Import mobile components dynamically to avoid web build issues
    const MobileApp = require('./mobile/MobileApp').default;
    return <MobileApp />;
  }

  return null;
}


import { Redirect } from 'expo-router';

export default function Index() {
  // Root index redirects to tabs - auth is handled by _layout.tsx AuthGate
  return <Redirect href="/(tabs)/" />;
}


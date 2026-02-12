import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Switch, Button, Separator } from './components/ui';

export default function PrivacySettingsScreen() {
  const { colors } = useTheme();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [crashReportsEnabled, setCrashReportsEnabled] = useState(true);
  const [personalizedAds, setPersonalizedAds] = useState(false);

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all associated data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Request Submitted', 'Your account deletion request has been submitted. You will receive a confirmation email.');
          },
        },
      ]
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Privacy & Security', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {/* Data Collection */}
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Data Collection</CardTitle>
          </CardHeader>
          <CardContent>
            <Switch
              label="Analytics"
              value={analyticsEnabled}
              onValueChange={setAnalyticsEnabled}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Help us improve EatPal by sending anonymous usage data.
            </Text>
            <Separator />
            <Switch
              label="Crash Reports"
              value={crashReportsEnabled}
              onValueChange={setCrashReportsEnabled}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Automatically send crash reports to help fix bugs.
            </Text>
            <Separator />
            <Switch
              label="Personalized Content"
              value={personalizedAds}
              onValueChange={setPersonalizedAds}
            />
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>
              Allow EatPal to personalize meal suggestions based on your data.
            </Text>
          </CardContent>
        </Card>

        {/* Legal Links */}
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Legal</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="ghost" onPress={() => Linking.openURL('https://tryeatpal.com/privacy')}>
              Privacy Policy
            </Button>
            <Button variant="ghost" onPress={() => Linking.openURL('https://tryeatpal.com/terms')}>
              Terms of Service
            </Button>
          </CardContent>
        </Card>

        {/* Account Deletion - Required by Apple and Google */}
        <Card style={{ backgroundColor: colors.card }}>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Text style={[styles.deleteWarning, { color: colors.mutedForeground }]}>
              Deleting your account will permanently remove all your data including meal plans, food entries, and child profiles.
            </Text>
            <Button variant="destructive" onPress={handleDeleteAccount} size="lg" style={{ marginTop: 12 }}>
              Delete My Account
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  deleteWarning: { fontSize: 13, lineHeight: 20 },
});

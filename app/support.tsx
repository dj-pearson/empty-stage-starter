import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Separator } from './components/ui';

export default function SupportScreen() {
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Help & Support', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Get Help</CardTitle>
          </CardHeader>
          <CardContent>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => Linking.openURL('mailto:support@tryeatpal.com')}
              accessibilityRole="link"
            >
              <Text style={styles.linkEmoji}>📧</Text>
              <View style={styles.linkInfo}>
                <Text style={[styles.linkTitle, { color: colors.foreground }]}>Email Support</Text>
                <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>support@tryeatpal.com</Text>
              </View>
            </TouchableOpacity>

            <Separator />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => Linking.openURL('https://tryeatpal.com/faq')}
              accessibilityRole="link"
            >
              <Text style={styles.linkEmoji}>❓</Text>
              <View style={styles.linkInfo}>
                <Text style={[styles.linkTitle, { color: colors.foreground }]}>FAQ</Text>
                <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>Frequently asked questions</Text>
              </View>
            </TouchableOpacity>

            <Separator />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => Linking.openURL('https://tryeatpal.com/contact')}
              accessibilityRole="link"
            >
              <Text style={styles.linkEmoji}>💬</Text>
              <View style={styles.linkInfo}>
                <Text style={[styles.linkTitle, { color: colors.foreground }]}>Contact Us</Text>
                <Text style={[styles.linkDesc, { color: colors.mutedForeground }]}>Reach out to our team</Text>
              </View>
            </TouchableOpacity>
          </CardContent>
        </Card>

        <Card style={{ backgroundColor: colors.card }}>
          <CardHeader>
            <CardTitle>About EatPal</CardTitle>
          </CardHeader>
          <CardContent>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: colors.foreground }]}>1.0.0</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Build</Text>
              <Text style={[styles.aboutValue, { color: colors.foreground }]}>1</Text>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  linkEmoji: { fontSize: 24 },
  linkInfo: { flex: 1 },
  linkTitle: { fontSize: 16, fontWeight: '600' },
  linkDesc: { fontSize: 13, marginTop: 2 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  aboutLabel: { fontSize: 15 },
  aboutValue: { fontSize: 15, fontWeight: '500' },
});

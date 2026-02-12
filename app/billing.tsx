import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Separator } from './components/ui';

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: ['1 child profile', 'Basic meal tracking', 'Barcode scanning'],
    current: true,
  },
  {
    name: 'Family',
    price: '$9.99',
    period: '/month',
    features: ['Up to 5 child profiles', 'AI meal suggestions', 'Nutrition insights', 'Grocery list generation', 'Recipe management'],
    recommended: true,
  },
  {
    name: 'Pro',
    price: '$19.99',
    period: '/month',
    features: ['Unlimited child profiles', 'AI meal coach', 'Advanced analytics', 'Grocery delivery integration', 'Priority support'],
  },
];

export default function BillingScreen() {
  const { colors } = useTheme();

  const handleSubscribe = (plan: string) => {
    // On iOS/Android, subscriptions should go through In-App Purchase
    // This is a requirement for App Store and Play Store compliance
    Alert.alert(
      'Subscription',
      `To subscribe to the ${plan} plan, you'll be redirected to manage your subscription through the app store.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            // In production, this would trigger StoreKit (iOS) or Google Play Billing
            Alert.alert('Coming Soon', 'In-app subscriptions will be available when the app launches on the App Store and Play Store.');
          },
        },
      ]
    );
  };

  const handleManageSubscription = () => {
    // Direct users to their platform's subscription management
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Billing & Subscription', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Choose the plan that works best for your family.
        </Text>

        {PLANS.map(plan => (
          <Card
            key={plan.name}
            style={[
              styles.planCard,
              { backgroundColor: colors.card },
              plan.recommended && { borderColor: colors.primary, borderWidth: 2 },
            ]}
          >
            <CardContent>
              {plan.recommended && (
                <Badge variant="default" style={styles.recommendedBadge}>Recommended</Badge>
              )}
              {plan.current && (
                <Badge variant="secondary" style={styles.recommendedBadge}>Current Plan</Badge>
              )}

              <Text style={[styles.planName, { color: colors.foreground }]}>{plan.name}</Text>
              <View style={styles.priceRow}>
                <Text style={[styles.planPrice, { color: colors.primary }]}>{plan.price}</Text>
                <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>{plan.period}</Text>
              </View>

              <Separator />

              {plan.features.map((feature, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <Text style={[styles.featureCheck, { color: colors.primary }]}>✓</Text>
                  <Text style={[styles.featureText, { color: colors.foreground }]}>{feature}</Text>
                </View>
              ))}

              {!plan.current && (
                <Button
                  onPress={() => handleSubscribe(plan.name)}
                  variant={plan.recommended ? 'default' : 'outline'}
                  size="lg"
                  style={{ marginTop: 16 }}
                >
                  {`Subscribe to ${plan.name}`}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        <TouchableOpacity onPress={handleManageSubscription} style={styles.manageLink}>
          <Text style={[styles.manageLinkText, { color: colors.primary }]}>
            Manage existing subscription
          </Text>
        </TouchableOpacity>

        <Text style={[styles.legal, { color: colors.mutedForeground }]}>
          Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period. Payment will be charged to your Apple ID or Google Play account. You can manage and cancel subscriptions in your account settings.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  description: { fontSize: 15, marginBottom: 20 },
  planCard: { marginBottom: 12 },
  recommendedBadge: { marginBottom: 8 },
  planName: { fontSize: 22, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4, marginBottom: 8 },
  planPrice: { fontSize: 28, fontWeight: '800' },
  planPeriod: { fontSize: 15 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  featureCheck: { fontSize: 16, fontWeight: '700' },
  featureText: { fontSize: 14 },
  manageLink: { alignItems: 'center', paddingVertical: 16 },
  manageLinkText: { fontSize: 15, fontWeight: '600' },
  legal: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 8 },
});

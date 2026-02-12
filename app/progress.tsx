import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from './providers/MobileThemeProvider';
import { useMobileApp } from './providers/MobileAppProvider';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from './components/ui';
import { useMemo } from 'react';
import { format, subDays, isSameDay } from 'date-fns';

export default function ProgressScreen() {
  const { colors } = useTheme();
  const { planEntries, foods, kids, activeKidId } = useMobileApp();

  const activeKid = kids.find(k => k.id === activeKidId);

  const weeklyData = useMemo(() => {
    const today = new Date();
    const days = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i));

    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayEntries = planEntries.filter(e =>
        e.date === dateStr && (activeKidId ? e.kid_id === activeKidId : true)
      );
      const ateCount = dayEntries.filter(e => e.result === 'ate').length;
      return {
        day: format(day, 'EEE'),
        date: dateStr,
        total: dayEntries.length,
        ate: ateCount,
      };
    });
  }, [planEntries, activeKidId]);

  const maxMeals = Math.max(...weeklyData.map(d => d.total), 1);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Progress', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {activeKid && (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Tracking progress for {activeKid.name}
          </Text>
        )}

        {/* Weekly Chart */}
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Last 7 Days</CardTitle>
          </CardHeader>
          <CardContent>
            <View style={styles.chart}>
              {weeklyData.map(day => (
                <View key={day.date} style={styles.barColumn}>
                  <View style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        {
                          backgroundColor: colors.muted,
                          height: `${Math.max(10, (day.total / maxMeals) * 100)}%`,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.barInner,
                          {
                            backgroundColor: colors.primary,
                            height: day.total > 0 ? `${(day.ate / day.total) * 100}%` : '0%',
                          },
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.barLabel, { color: colors.mutedForeground }]}>{day.day}</Text>
                  <Text style={[styles.barValue, { color: colors.foreground }]}>{day.ate}/{day.total}</Text>
                </View>
              ))}
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Accepted</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.muted }]} />
                <Text style={[styles.legendText, { color: colors.mutedForeground }]}>Total</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card style={{ backgroundColor: colors.card }}>
          <CardHeader>
            <CardTitle>This Week's Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total meals planned</Text>
              <Text style={[styles.summaryValue, { color: colors.foreground }]}>
                {weeklyData.reduce((sum, d) => sum + d.total, 0)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Meals accepted</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>
                {weeklyData.reduce((sum, d) => sum + d.ate, 0)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Best day</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {weeklyData.reduce((best, d) => d.ate > best.ate ? d : best, weeklyData[0]).day}
              </Text>
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
  subtitle: { fontSize: 14, marginBottom: 16 },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: 160, marginBottom: 16 },
  barColumn: { alignItems: 'center', flex: 1 },
  barContainer: { flex: 1, justifyContent: 'flex-end', width: 24 },
  bar: { width: '100%', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  barInner: { width: '100%', borderRadius: 4 },
  barLabel: { fontSize: 11, fontWeight: '600', marginTop: 6 },
  barValue: { fontSize: 10, marginTop: 2 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  summaryLabel: { fontSize: 15 },
  summaryValue: { fontSize: 15, fontWeight: '700' },
});

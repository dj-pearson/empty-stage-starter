import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { useMobileApp } from './providers/MobileAppProvider';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState, Separator } from './components/ui';

export default function InsightsScreen() {
  const { foods, planEntries, kids, activeKidId } = useMobileApp();
  const { colors } = useTheme();

  const activeKid = kids.find(k => k.id === activeKidId);

  const stats = useMemo(() => {
    const kidEntries = activeKidId
      ? planEntries.filter(e => e.kid_id === activeKidId)
      : planEntries;

    const totalMeals = kidEntries.length;
    const ateCount = kidEntries.filter(e => e.result === 'ate').length;
    const refusedCount = kidEntries.filter(e => e.result === 'refused').length;
    const acceptance = totalMeals > 0 ? Math.round((ateCount / totalMeals) * 100) : 0;

    const categoryCount: Record<string, number> = {};
    kidEntries.forEach(entry => {
      const food = foods.find(f => f.id === entry.food_id);
      if (food?.category) {
        categoryCount[food.category] = (categoryCount[food.category] || 0) + 1;
      }
    });

    const topCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return { totalMeals, ateCount, refusedCount, acceptance, topCategories };
  }, [planEntries, foods, activeKidId]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Nutrition Insights', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {activeKid && (
          <Badge variant="default" style={{ marginBottom: 16 }}>
            Insights for: {activeKid.name}
          </Badge>
        )}

        {stats.totalMeals === 0 ? (
          <EmptyState
            icon="📊"
            title="No data yet"
            description="Start tracking meals to see nutrition insights and acceptance rates."
          />
        ) : (
          <>
            {/* Acceptance Rate */}
            <View style={styles.statsRow}>
              <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
                <CardContent style={styles.statContent}>
                  <Text style={[styles.bigStat, { color: colors.primary }]}>{stats.acceptance}%</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Acceptance Rate</Text>
                </CardContent>
              </Card>
              <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
                <CardContent style={styles.statContent}>
                  <Text style={[styles.bigStat, { color: colors.foreground }]}>{stats.totalMeals}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Meals</Text>
                </CardContent>
              </Card>
            </View>

            <View style={styles.statsRow}>
              <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
                <CardContent style={styles.statContent}>
                  <Text style={[styles.bigStat, { color: colors.success }]}>{stats.ateCount}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Accepted</Text>
                </CardContent>
              </Card>
              <Card style={[styles.statCard, { backgroundColor: colors.card }]}>
                <CardContent style={styles.statContent}>
                  <Text style={[styles.bigStat, { color: colors.destructive }]}>{stats.refusedCount}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Refused</Text>
                </CardContent>
              </Card>
            </View>

            {/* Top Categories */}
            {stats.topCategories.length > 0 && (
              <Card style={{ backgroundColor: colors.card, marginTop: 8 }}>
                <CardHeader>
                  <CardTitle>Top Food Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.topCategories.map(([category, count], idx) => (
                    <View key={category}>
                      <View style={styles.categoryRow}>
                        <Text style={[styles.categoryName, { color: colors.foreground }]}>
                          {category.charAt(0).toUpperCase() + category.slice(1)}
                        </Text>
                        <Text style={[styles.categoryCount, { color: colors.mutedForeground }]}>
                          {count} meal{count > 1 ? 's' : ''}
                        </Text>
                      </View>
                      {/* Simple bar */}
                      <View style={[styles.barBg, { backgroundColor: colors.muted }]}>
                        <View
                          style={[styles.barFill, {
                            backgroundColor: colors.primary,
                            width: `${Math.min(100, (count / stats.totalMeals) * 100)}%`,
                          }]}
                        />
                      </View>
                      {idx < stats.topCategories.length - 1 && <Separator style={{ marginVertical: 10 }} />}
                    </View>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Food Diversity */}
            <Card style={{ backgroundColor: colors.card, marginTop: 12 }}>
              <CardHeader>
                <CardTitle>Pantry Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <View style={styles.overviewRow}>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Total foods tracked</Text>
                  <Text style={[styles.overviewValue, { color: colors.foreground }]}>{foods.length}</Text>
                </View>
                <View style={styles.overviewRow}>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Safe foods</Text>
                  <Text style={[styles.overviewValue, { color: colors.success }]}>{foods.filter(f => f.is_safe).length}</Text>
                </View>
                <View style={styles.overviewRow}>
                  <Text style={[styles.overviewLabel, { color: colors.mutedForeground }]}>Trial foods</Text>
                  <Text style={[styles.overviewValue, { color: colors.warning }]}>{foods.filter(f => !f.is_safe).length}</Text>
                </View>
              </CardContent>
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1 },
  statContent: { alignItems: 'center' },
  bigStat: { fontSize: 32, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 4 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  categoryName: { fontSize: 15, fontWeight: '500' },
  categoryCount: { fontSize: 13 },
  barBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  overviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  overviewLabel: { fontSize: 15 },
  overviewValue: { fontSize: 15, fontWeight: '700' },
});

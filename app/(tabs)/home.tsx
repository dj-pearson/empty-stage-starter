import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useMobileAuth } from '../providers/MobileAuthProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, Badge, Avatar, LoadingScreen } from '../components/ui';
import { format } from 'date-fns';

export default function HomeScreen() {
  const { user } = useMobileAuth();
  const { kids, foods, planEntries, groceryItems, activeKidId, setActiveKidId, isLoading, refreshData } = useMobileApp();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const userName = user?.user_metadata?.full_name || 'there';

  const todaysMeals = useMemo(() => {
    if (!activeKidId) return [];
    return planEntries.filter(e => e.date === today && e.kid_id === activeKidId);
  }, [planEntries, today, activeKidId]);

  const uncheckedGroceryCount = groceryItems.filter(i => !i.checked).length;
  const safefoods = foods.filter(f => f.is_safe).length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  if (isLoading) return <LoadingScreen message="Loading your data..." />;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={[styles.greetingText, { color: colors.foreground }]}>
          Hello, {userName.split(' ')[0]}!
        </Text>
        <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
          {format(new Date(), 'EEEE, MMMM d')}
        </Text>
      </View>

      {/* Kid Selector */}
      {kids.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.kidSelector}
          contentContainerStyle={styles.kidSelectorContent}
        >
          {kids.map(kid => (
            <TouchableOpacity
              key={kid.id}
              style={[
                styles.kidChip,
                kid.id === activeKidId && { backgroundColor: colors.primary },
                kid.id !== activeKidId && { backgroundColor: colors.muted },
              ]}
              onPress={() => setActiveKidId(kid.id)}
              accessibilityRole="button"
              accessibilityLabel={`Select ${kid.name}`}
              accessibilityState={{ selected: kid.id === activeKidId }}
            >
              <Avatar name={kid.name} size={28} />
              <Text
                style={[
                  styles.kidChipText,
                  { color: kid.id === activeKidId ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {kid.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/(tabs)/planner')}>
          <Card style={{ backgroundColor: colors.card }}>
            <CardContent>
              <Text style={styles.statEmoji}>📅</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{todaysMeals.length}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Today's Meals</Text>
            </CardContent>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/(tabs)/grocery')}>
          <Card style={{ backgroundColor: colors.card }}>
            <CardContent>
              <Text style={styles.statEmoji}>🛒</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{uncheckedGroceryCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Grocery Items</Text>
            </CardContent>
          </Card>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statItem} onPress={() => router.push('/(tabs)/pantry')}>
          <Card style={{ backgroundColor: colors.card }}>
            <CardContent>
              <Text style={styles.statEmoji}>✅</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{safefoods}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Safe Foods</Text>
            </CardContent>
          </Card>
        </TouchableOpacity>
      </View>

      {/* Today's Meal Plan */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Today's Plan</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/planner')}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>See All</Text>
          </TouchableOpacity>
        </View>

        {todaysMeals.length === 0 ? (
          <Card style={{ backgroundColor: colors.card }}>
            <CardContent>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No meals planned for today. Tap "See All" to plan meals.
              </Text>
            </CardContent>
          </Card>
        ) : (
          todaysMeals.map(meal => {
            const food = foods.find(f => f.id === meal.food_id);
            return (
              <Card key={meal.id} style={[styles.mealCard, { backgroundColor: colors.card }]}>
                <CardContent style={styles.mealCardContent}>
                  <View>
                    <Badge variant="secondary">{meal.meal_slot}</Badge>
                    <Text style={[styles.mealName, { color: colors.foreground }]}>
                      {food?.name || 'Unknown food'}
                    </Text>
                  </View>
                  {meal.result && (
                    <Badge variant={meal.result === 'ate' ? 'default' : 'outline'}>
                      {meal.result}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {[
            { emoji: '📷', label: 'Scan Barcode', route: '/scanner' as const },
            { emoji: '🍳', label: 'Recipes', route: '/(tabs)/more' as const },
            { emoji: '👶', label: 'Kids', route: '/(tabs)/more' as const },
            { emoji: '📊', label: 'Insights', route: '/(tabs)/more' as const },
          ].map(action => (
            <TouchableOpacity
              key={action.label}
              style={[styles.actionButton, { backgroundColor: colors.muted }]}
              onPress={() => router.push(action.route)}
              accessibilityRole="button"
              accessibilityLabel={action.label}
            >
              <Text style={styles.actionEmoji}>{action.emoji}</Text>
              <Text style={[styles.actionLabel, { color: colors.foreground }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  greeting: { marginBottom: 20 },
  greetingText: { fontSize: 26, fontWeight: '800' },
  dateText: { fontSize: 15, marginTop: 4 },
  kidSelector: { marginBottom: 20 },
  kidSelectorContent: { gap: 8 },
  kidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginRight: 8,
  },
  kidChipText: { fontSize: 14, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statItem: { flex: 1 },
  statEmoji: { fontSize: 24, marginBottom: 4 },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  seeAll: { fontSize: 14, fontWeight: '600' },
  mealCard: { marginBottom: 8 },
  mealCardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealName: { fontSize: 16, fontWeight: '500', marginTop: 6 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionButton: {
    width: '47%',
    paddingVertical: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionEmoji: { fontSize: 28, marginBottom: 6 },
  actionLabel: { fontSize: 14, fontWeight: '600' },
});

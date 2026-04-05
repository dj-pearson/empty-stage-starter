import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client.mobile';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

interface MealEntry {
  id: string;
  meal_slot: string;
  food_name: string;
  calories?: number;
}

interface Kid {
  id: string;
  name: string;
}

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const MEAL_SLOT_ICONS: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export default function HomeScreen() {
  const router = useRouter();
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userName, setUserName] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/(auth)/login');
        return;
      }

      setUserName(user.email?.split('@')[0] ?? 'there');

      // Fetch kids
      const { data: kidsData } = await supabase
        .from('kids')
        .select('id, name')
        .eq('user_id', user.id);

      if (kidsData && kidsData.length > 0) {
        setKids(kidsData);
        if (!activeKidId) {
          setActiveKidId(kidsData[0].id);
        }
      }

      // Fetch today's meals
      const today = getTodayDateString();
      const query = supabase
        .from('plan_entries')
        .select(`
          id,
          meal_slot,
          foods:food_id (name, nutrition_info)
        `)
        .eq('date', today);

      if (activeKidId) {
        query.eq('kid_id', activeKidId);
      }

      const { data: mealsData } = await query;

      if (mealsData) {
        const mapped: MealEntry[] = mealsData.map((entry: any) => ({
          id: entry.id,
          meal_slot: entry.meal_slot,
          food_name: entry.foods?.name ?? 'Unknown',
          calories: entry.foods?.nutrition_info?.calories,
        }));
        setMeals(mapped);
      }
    } catch (err) {
      console.error('Error fetching home data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeKidId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const totalCalories = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0);

  const getMealsForSlot = (slot: string) => meals.filter(m => m.meal_slot === slot);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={MEAL_SLOTS}
        keyExtractor={(item) => item}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <>
            {/* Greeting */}
            <View style={styles.greetingSection}>
              <Text style={styles.greeting}>
                Hi, {userName}! 👋
              </Text>
              <Text style={styles.dateText}>
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>

            {/* Kid Selector */}
            {kids.length > 1 && (
              <View style={styles.kidSelector}>
                {kids.map((kid) => (
                  <TouchableOpacity
                    key={kid.id}
                    style={[
                      styles.kidChip,
                      activeKidId === kid.id && styles.kidChipActive,
                    ]}
                    onPress={() => setActiveKidId(kid.id)}
                    accessibilityLabel={`Select ${kid.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeKidId === kid.id }}
                  >
                    <Text
                      style={[
                        styles.kidChipText,
                        activeKidId === kid.id && styles.kidChipTextActive,
                      ]}
                    >
                      {kid.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Nutrition Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Today's Summary</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{totalCalories}</Text>
                  <Text style={styles.summaryLabel}>Calories</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{meals.length}</Text>
                  <Text style={styles.summaryLabel}>Items</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>
                    {MEAL_SLOTS.filter(s => getMealsForSlot(s).length > 0).length}/{MEAL_SLOTS.length}
                  </Text>
                  <Text style={styles.summaryLabel}>Meals</Text>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => router.push('/(tabs)/meals')}
                accessibilityLabel="Add a meal"
                accessibilityRole="button"
              >
                <Text style={styles.quickActionIcon}>➕</Text>
                <Text style={styles.quickActionLabel}>Add Meal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => router.push('/(tabs)/scan')}
                accessibilityLabel="Scan food barcode"
                accessibilityRole="button"
              >
                <Text style={styles.quickActionIcon}>📷</Text>
                <Text style={styles.quickActionLabel}>Scan Food</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => router.push('/(tabs)/lists')}
                accessibilityLabel="View grocery lists"
                accessibilityRole="button"
              >
                <Text style={styles.quickActionIcon}>🛒</Text>
                <Text style={styles.quickActionLabel}>Lists</Text>
              </TouchableOpacity>
            </View>

            {/* Meals Section Header */}
            <Text style={styles.sectionTitle}>Today's Meals</Text>
          </>
        }
        renderItem={({ item: slot }) => {
          const slotMeals = getMealsForSlot(slot);
          return (
            <View style={styles.mealSlotCard}>
              <View style={styles.mealSlotHeader}>
                <Text style={styles.mealSlotIcon}>{MEAL_SLOT_ICONS[slot]}</Text>
                <Text style={styles.mealSlotTitle}>
                  {slot.charAt(0).toUpperCase() + slot.slice(1)}
                </Text>
                <Text style={styles.mealSlotCount}>
                  {slotMeals.length} {slotMeals.length === 1 ? 'item' : 'items'}
                </Text>
              </View>
              {slotMeals.length > 0 ? (
                slotMeals.map((meal) => (
                  <View key={meal.id} style={styles.mealItem}>
                    <Text style={styles.mealName}>{meal.food_name}</Text>
                    {meal.calories != null && (
                      <Text style={styles.mealCalories}>{meal.calories} cal</Text>
                    )}
                  </View>
                ))
              ) : (
                <TouchableOpacity
                  style={styles.emptySlot}
                  onPress={() => router.push('/(tabs)/meals')}
                  accessibilityLabel={`Add ${slot}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.emptySlotText}>+ Add {slot}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🍽️</Text>
            <Text style={styles.emptyStateTitle}>No meals planned</Text>
            <Text style={styles.emptyStateText}>
              Start planning today's meals to track nutrition for your family.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: spacing.md, fontSize: fontSize.md, color: colors.textSecondary },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  greetingSection: { paddingTop: spacing.md, paddingBottom: spacing.sm },
  greeting: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  dateText: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  kidSelector: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap',
  },
  kidChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  kidChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  kidChipText: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  kidChipTextActive: { color: colors.background },
  summaryCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.primary },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: colors.border },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  quickAction: {
    flex: 1, backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
    minHeight: 48,
  },
  quickActionIcon: { fontSize: 24, marginBottom: spacing.xs },
  quickActionLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.text },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm,
  },
  mealSlotCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  mealSlotHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm,
  },
  mealSlotIcon: { fontSize: 20 },
  mealSlotTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, flex: 1 },
  mealSlotCount: { fontSize: fontSize.xs, color: colors.textSecondary },
  mealItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  mealName: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  mealCalories: { fontSize: fontSize.sm, color: colors.textSecondary },
  emptySlot: {
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, minHeight: 48,
    justifyContent: 'center',
  },
  emptySlotText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyStateIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyStateTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  emptyStateText: {
    fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center',
    marginTop: spacing.sm, lineHeight: 20,
  },
});

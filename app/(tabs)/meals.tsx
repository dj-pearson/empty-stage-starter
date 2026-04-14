import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function getWeekDates(): { label: string; date: string; isToday: boolean }[] {
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    return {
      label: `${DAYS[i]} ${d.getDate()}`,
      date: dateStr,
      isToday: dateStr === today.toISOString().split('T')[0],
    };
  });
}

interface PlanEntry {
  id: string;
  meal_slot: string;
  date: string;
  food_name: string;
  food_id: string;
}

export default function MealsScreen() {
  const weekDates = getWeekDates();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [kids, setKids] = useState<{ id: string; name: string }[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchEntries = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch kids
      const { data: kidsData } = await supabase.from('kids').select('id, name').eq('user_id', user.id);
      if (kidsData && kidsData.length > 0) {
        setKids(kidsData);
        if (!activeKidId) setActiveKidId(kidsData[0].id);
      }

      const query = supabase
        .from('plan_entries')
        .select('id, meal_slot, date, food_id, foods:food_id (name)')
        .eq('date', selectedDate);

      if (activeKidId) query.eq('kid_id', activeKidId);

      const { data } = await query;
      if (data) {
        setEntries(data.map((e: any) => ({
          id: e.id,
          meal_slot: e.meal_slot,
          date: e.date,
          food_name: e.foods?.name ?? 'Unknown',
          food_id: e.food_id,
        })));
      }
    } catch (err) {
      console.error('Error fetching meal entries:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedDate, activeKidId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleDeleteEntry = (entry: PlanEntry) => {
    Alert.alert(
      'Remove Meal',
      `Remove "${entry.food_name}" from ${entry.meal_slot}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('plan_entries').delete().eq('id', entry.id);
            setEntries(prev => prev.filter(e => e.id !== entry.id));
          },
        },
      ]
    );
  };

  const onRefresh = () => { setIsRefreshing(true); fetchEntries(); };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Text style={styles.screenTitle}>Meal Plan</Text>

      {/* Week Day Selector */}
      <FlatList
        horizontal
        data={weekDates}
        keyExtractor={(item) => item.date}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.dayChip,
              selectedDate === item.date && styles.dayChipActive,
              item.isToday && selectedDate !== item.date && styles.dayChipToday,
            ]}
            onPress={() => setSelectedDate(item.date)}
            accessibilityLabel={`Select ${item.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedDate === item.date }}
          >
            <Text style={[
              styles.dayLabel,
              selectedDate === item.date && styles.dayLabelActive,
            ]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Kid Selector */}
      {kids.length > 1 && (
        <View style={styles.kidRow}>
          {kids.map((kid) => (
            <TouchableOpacity
              key={kid.id}
              style={[styles.kidChip, activeKidId === kid.id && styles.kidChipActive]}
              onPress={() => setActiveKidId(kid.id)}
              accessibilityLabel={`Select ${kid.name}`}
            >
              <Text style={[styles.kidText, activeKidId === kid.id && styles.kidTextActive]}>
                {kid.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={MEAL_SLOTS}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.mealList}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item: slot }) => {
            const slotEntries = entries.filter(e => e.meal_slot === slot);
            return (
              <View style={styles.slotCard}>
                <Text style={styles.slotTitle}>
                  {slot.charAt(0).toUpperCase() + slot.slice(1)}
                </Text>
                {slotEntries.length > 0 ? (
                  slotEntries.map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      style={styles.entryRow}
                      onLongPress={() => handleDeleteEntry(entry)}
                      accessibilityLabel={`${entry.food_name}. Long press to remove.`}
                      accessibilityHint="Long press to remove this meal"
                    >
                      <Text style={styles.entryName}>{entry.food_name}</Text>
                      <Text style={styles.removeHint}>Hold to remove</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.emptySlot}>No items planned</Text>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Offline Indicator placeholder */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  screenTitle: {
    fontSize: fontSize.xxl, fontWeight: '700', color: colors.text,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  weekList: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border, minHeight: 48, justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipToday: { borderColor: colors.primary, borderWidth: 2 },
  dayLabel: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  dayLabelActive: { color: colors.background },
  kidRow: {
    flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  kidChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  kidChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  kidText: { fontSize: fontSize.xs, fontWeight: '500', color: colors.text },
  kidTextActive: { color: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mealList: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  slotCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  slotTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  entryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
    minHeight: 48,
  },
  entryName: { fontSize: fontSize.sm, color: colors.text, flex: 1 },
  removeHint: { fontSize: fontSize.xs, color: colors.textSecondary },
  emptySlot: {
    fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic',
    paddingVertical: spacing.sm,
  },
});

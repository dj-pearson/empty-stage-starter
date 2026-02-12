import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, Badge, EmptyState, LoadingScreen, Button } from '../components/ui';
import { format, addDays, startOfWeek, isSameDay } from 'date-fns';

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Snack', 'Dinner'];

export default function PlannerScreen() {
  const { planEntries, foods, kids, activeKidId, setActiveKidId, addPlanEntry, deletePlanEntry, isLoading, refreshData } = useMobileApp();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

  const dayMeals = useMemo(() => {
    if (!activeKidId) return [];
    return planEntries.filter(
      e => e.date === selectedDateStr && e.kid_id === activeKidId
    );
  }, [planEntries, selectedDateStr, activeKidId]);

  const mealsBySlot = useMemo(() => {
    const map: Record<string, typeof dayMeals> = {};
    MEAL_SLOTS.forEach(slot => {
      map[slot] = dayMeals.filter(m => m.meal_slot === slot);
    });
    return map;
  }, [dayMeals]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const handleDeleteMeal = (id: string) => {
    Alert.alert('Remove Meal', 'Are you sure you want to remove this meal?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deletePlanEntry(id) },
    ]);
  };

  const activeKid = kids.find(k => k.id === activeKidId);

  if (isLoading) return <LoadingScreen message="Loading meal plan..." />;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Kid Selector */}
      {kids.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.kidBar}
          contentContainerStyle={styles.kidBarContent}
        >
          {kids.map(kid => (
            <TouchableOpacity
              key={kid.id}
              style={[
                styles.kidPill,
                { backgroundColor: kid.id === activeKidId ? colors.primary : colors.muted },
              ]}
              onPress={() => setActiveKidId(kid.id)}
              accessibilityLabel={`Plan for ${kid.name}`}
            >
              <Text style={{
                color: kid.id === activeKidId ? colors.primaryForeground : colors.foreground,
                fontWeight: '600',
                fontSize: 14,
              }}>
                {kid.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Week Day Selector */}
      <View style={styles.weekBar}>
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                styles.dayButton,
                isSelected && { backgroundColor: colors.primary },
                !isSelected && isToday && { borderColor: colors.primary, borderWidth: 1 },
              ]}
              onPress={() => setSelectedDate(day)}
              accessibilityLabel={format(day, 'EEEE, MMMM d')}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[
                styles.dayLabel,
                { color: isSelected ? colors.primaryForeground : colors.mutedForeground },
              ]}>
                {format(day, 'EEE')}
              </Text>
              <Text style={[
                styles.dayNumber,
                { color: isSelected ? colors.primaryForeground : colors.foreground },
              ]}>
                {format(day, 'd')}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Date Label */}
      <Text style={[styles.dateLabel, { color: colors.foreground }]}>
        {format(selectedDate, 'EEEE, MMMM d, yyyy')}
      </Text>

      {/* Meal Slots */}
      <View style={styles.mealSlots}>
        {!activeKidId ? (
          <EmptyState
            icon="👶"
            title="No child selected"
            description="Add a child profile in Settings to start planning meals."
          />
        ) : (
          MEAL_SLOTS.map(slot => (
            <View key={slot} style={styles.slotSection}>
              <Text style={[styles.slotTitle, { color: colors.foreground }]}>{slot}</Text>

              {mealsBySlot[slot].length === 0 ? (
                <Card style={[styles.emptySlotCard, { backgroundColor: colors.muted }]}>
                  <CardContent>
                    <Text style={[styles.emptySlotText, { color: colors.mutedForeground }]}>
                      No {slot.toLowerCase()} planned
                    </Text>
                  </CardContent>
                </Card>
              ) : (
                mealsBySlot[slot].map(meal => {
                  const food = foods.find(f => f.id === meal.food_id);
                  return (
                    <TouchableOpacity
                      key={meal.id}
                      onLongPress={() => handleDeleteMeal(meal.id)}
                      accessibilityHint="Long press to delete"
                    >
                      <Card style={{ backgroundColor: colors.card, marginBottom: 6 }}>
                        <CardContent style={styles.mealRow}>
                          <View style={styles.mealInfo}>
                            <Text style={[styles.mealName, { color: colors.foreground }]}>
                              {food?.name || 'Unknown'}
                            </Text>
                            {food?.category && (
                              <Badge variant="secondary">{food.category}</Badge>
                            )}
                          </View>
                          {meal.result && (
                            <Badge variant={meal.result === 'ate' ? 'default' : 'outline'}>
                              {meal.result}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kidBar: { paddingVertical: 12, paddingHorizontal: 16 },
  kidBarContent: { gap: 8 },
  kidPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8 },
  weekBar: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingVertical: 8 },
  dayButton: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  dayLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  dayNumber: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  dateLabel: { fontSize: 16, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 8 },
  mealSlots: { paddingHorizontal: 16, paddingBottom: 32 },
  slotSection: { marginBottom: 20 },
  slotTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySlotCard: { opacity: 0.6 },
  emptySlotText: { fontSize: 14, textAlign: 'center' },
  mealRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealInfo: { flex: 1, gap: 4 },
  mealName: { fontSize: 15, fontWeight: '500' },
});

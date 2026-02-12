import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button, Separator } from '../components/ui';

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { planEntries, foods, kids, updatePlanEntry, deletePlanEntry } = useMobileApp();
  const { colors } = useTheme();

  const entry = planEntries.find(e => e.id === id);
  const food = entry ? foods.find(f => f.id === entry.food_id) : null;
  const kid = entry ? kids.find(k => k.id === entry.kid_id) : null;

  if (!entry) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Meal not found.</Text>
      </View>
    );
  }

  const handleResult = async (result: string) => {
    await updatePlanEntry(entry.id, { result });
  };

  const handleDelete = () => {
    Alert.alert('Remove Meal', 'Remove this meal from the plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deletePlanEntry(entry.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ headerTitle: food?.name || 'Meal Detail' }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {/* Food info */}
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>{food?.name || 'Unknown Food'}</CardTitle>
          </CardHeader>
          <CardContent>
            <View style={styles.detailRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Meal Slot</Text>
              <Badge variant="secondary">{entry.meal_slot}</Badge>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Date</Text>
              <Text style={[styles.value, { color: colors.foreground }]}>{entry.date}</Text>
            </View>
            {kid && (
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>For</Text>
                <Text style={[styles.value, { color: colors.foreground }]}>{kid.name}</Text>
              </View>
            )}
            {food?.category && (
              <View style={styles.detailRow}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Category</Text>
                <Badge variant="secondary">{food.category}</Badge>
              </View>
            )}
          </CardContent>
        </Card>

        {/* Nutrition */}
        {food?.nutrition_info && Object.keys(food.nutrition_info).length > 0 && (
          <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
            <CardHeader>
              <CardTitle>Nutrition</CardTitle>
            </CardHeader>
            <CardContent>
              {food.nutrition_info.calories !== undefined && (
                <View style={styles.nutritionRow}>
                  <Text style={[styles.nutritionLabel, { color: colors.foreground }]}>Calories</Text>
                  <Text style={[styles.nutritionValue, { color: colors.primary }]}>{food.nutrition_info.calories}</Text>
                </View>
              )}
              {food.nutrition_info.protein !== undefined && (
                <View style={styles.nutritionRow}>
                  <Text style={[styles.nutritionLabel, { color: colors.foreground }]}>Protein</Text>
                  <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{food.nutrition_info.protein}g</Text>
                </View>
              )}
              {food.nutrition_info.carbs !== undefined && (
                <View style={styles.nutritionRow}>
                  <Text style={[styles.nutritionLabel, { color: colors.foreground }]}>Carbs</Text>
                  <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{food.nutrition_info.carbs}g</Text>
                </View>
              )}
              {food.nutrition_info.fat !== undefined && (
                <View style={styles.nutritionRow}>
                  <Text style={[styles.nutritionLabel, { color: colors.foreground }]}>Fat</Text>
                  <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{food.nutrition_info.fat}g</Text>
                </View>
              )}
            </CardContent>
          </Card>
        )}

        {/* Track Result */}
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>How did it go?</CardTitle>
          </CardHeader>
          <CardContent>
            {entry.result && (
              <View style={styles.currentResult}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>Current:</Text>
                <Badge variant={entry.result === 'ate' ? 'default' : entry.result === 'refused' ? 'destructive' : 'outline'}>
                  {entry.result}
                </Badge>
              </View>
            )}
            <View style={styles.resultButtons}>
              {['ate', 'tried', 'refused', 'skipped'].map(result => (
                <Button
                  key={result}
                  variant={entry.result === result ? 'default' : 'outline'}
                  size="sm"
                  onPress={() => handleResult(result)}
                  style={{ flex: 1 }}
                >
                  {result.charAt(0).toUpperCase() + result.slice(1)}
                </Button>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Notes */}
        {entry.notes && (
          <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Text style={[styles.notes, { color: colors.foreground }]}>{entry.notes}</Text>
            </CardContent>
          </Card>
        )}

        {/* Delete */}
        <Button variant="destructive" onPress={handleDelete} size="lg">
          Remove from Plan
        </Button>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  label: { fontSize: 14 },
  value: { fontSize: 15, fontWeight: '500' },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  nutritionLabel: { fontSize: 15 },
  nutritionValue: { fontSize: 15, fontWeight: '700' },
  currentResult: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  resultButtons: { flexDirection: 'row', gap: 8 },
  notes: { fontSize: 14, lineHeight: 22 },
});

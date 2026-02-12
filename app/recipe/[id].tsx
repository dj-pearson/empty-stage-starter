import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Badge, Separator } from '../components/ui';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { recipes, foods } = useMobileApp();
  const { colors } = useTheme();

  const recipe = recipes.find(r => r.id === id);

  if (!recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Recipe not found.</Text>
      </View>
    );
  }

  const ingredients = useMemo(() => {
    if (!recipe.food_ids) return [];
    return recipe.food_ids.map(fid => foods.find(f => f.id === fid)).filter(Boolean);
  }, [recipe.food_ids, foods]);

  return (
    <>
      <Stack.Screen options={{ headerTitle: recipe.name }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>{recipe.name}</Text>

        {/* Meta Badges */}
        <View style={styles.metaRow}>
          {recipe.prep_time && <Badge variant="secondary">Prep: {recipe.prep_time}m</Badge>}
          {recipe.cook_time && <Badge variant="secondary">Cook: {recipe.cook_time}m</Badge>}
          {recipe.servings && <Badge variant="secondary">{recipe.servings} servings</Badge>}
        </View>

        {/* Nutrition */}
        {recipe.nutrition_info && (
          <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
            <CardHeader>
              <CardTitle>Nutrition (per serving)</CardTitle>
            </CardHeader>
            <CardContent>
              <View style={styles.nutritionGrid}>
                {recipe.nutrition_info.calories !== undefined && (
                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionValue, { color: colors.primary }]}>{recipe.nutrition_info.calories}</Text>
                    <Text style={[styles.nutritionLabel, { color: colors.mutedForeground }]}>Calories</Text>
                  </View>
                )}
                {recipe.nutrition_info.protein !== undefined && (
                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{recipe.nutrition_info.protein}g</Text>
                    <Text style={[styles.nutritionLabel, { color: colors.mutedForeground }]}>Protein</Text>
                  </View>
                )}
                {recipe.nutrition_info.carbs !== undefined && (
                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{recipe.nutrition_info.carbs}g</Text>
                    <Text style={[styles.nutritionLabel, { color: colors.mutedForeground }]}>Carbs</Text>
                  </View>
                )}
                {recipe.nutrition_info.fat !== undefined && (
                  <View style={styles.nutritionItem}>
                    <Text style={[styles.nutritionValue, { color: colors.foreground }]}>{recipe.nutrition_info.fat}g</Text>
                    <Text style={[styles.nutritionLabel, { color: colors.mutedForeground }]}>Fat</Text>
                  </View>
                )}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
            <CardHeader>
              <CardTitle>Ingredients</CardTitle>
            </CardHeader>
            <CardContent>
              {ingredients.map((food, idx) => (
                <View key={food!.id}>
                  <View style={styles.ingredientRow}>
                    <Text style={[styles.ingredientName, { color: colors.foreground }]}>{food!.name}</Text>
                    {food!.category && <Badge variant="secondary">{food!.category}</Badge>}
                  </View>
                  {idx < ingredients.length - 1 && <Separator style={{ marginVertical: 8 }} />}
                </View>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {recipe.instructions && (
          <Card style={{ backgroundColor: colors.card }}>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <Text style={[styles.instructions, { color: colors.foreground }]}>
                {recipe.instructions}
              </Text>
            </CardContent>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  nutritionGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: 22, fontWeight: '800' },
  nutritionLabel: { fontSize: 12, marginTop: 4 },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ingredientName: { fontSize: 15, fontWeight: '500' },
  instructions: { fontSize: 15, lineHeight: 24 },
});

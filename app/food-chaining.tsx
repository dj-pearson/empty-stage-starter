import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { useMobileApp } from './providers/MobileAppProvider';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, CardHeader, CardTitle, Badge, EmptyState } from './components/ui';

export default function FoodChainingScreen() {
  const { foods, kids, activeKidId } = useMobileApp();
  const { colors } = useTheme();

  const activeKid = kids.find(k => k.id === activeKidId);
  const safeFoods = useMemo(() => foods.filter(f => f.is_safe), [foods]);
  const trialFoods = useMemo(() => foods.filter(f => !f.is_safe), [foods]);

  const foodsByCategory = useMemo(() => {
    const map: Record<string, typeof foods> = {};
    safeFoods.forEach(f => {
      const cat = f.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push(f);
    });
    return map;
  }, [safeFoods]);

  return (
    <>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Food Chaining', headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background } }} />

      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Food chaining helps picky eaters gradually accept new foods by connecting them to foods they already enjoy. Start with safe foods and introduce similar options.
        </Text>

        {activeKid && (
          <Badge variant="default" style={{ marginBottom: 16 }}>
            Planning for: {activeKid.name}
          </Badge>
        )}

        {/* Safe Foods by Category */}
        <Card style={{ backgroundColor: colors.card, marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Safe Foods ({safeFoods.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {safeFoods.length === 0 ? (
              <Text style={{ color: colors.mutedForeground }}>
                No safe foods recorded yet. Mark foods as "safe" in your pantry.
              </Text>
            ) : (
              Object.entries(foodsByCategory).map(([category, categoryFoods]) => (
                <View key={category} style={styles.categoryGroup}>
                  <Text style={[styles.categoryTitle, { color: colors.foreground }]}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Text>
                  <View style={styles.foodTags}>
                    {categoryFoods.map(food => (
                      <Badge key={food.id} variant="secondary">{food.name}</Badge>
                    ))}
                  </View>
                </View>
              ))
            )}
          </CardContent>
        </Card>

        {/* Trial Foods */}
        <Card style={{ backgroundColor: colors.card }}>
          <CardHeader>
            <CardTitle>Trial Foods ({trialFoods.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {trialFoods.length === 0 ? (
              <Text style={{ color: colors.mutedForeground }}>
                No trial foods yet. Add foods to your pantry and leave them as "not safe" to track them here.
              </Text>
            ) : (
              <View style={styles.foodTags}>
                {trialFoods.map(food => (
                  <Badge key={food.id} variant="outline">{food.name}</Badge>
                ))}
              </View>
            )}
          </CardContent>
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  description: { fontSize: 14, lineHeight: 22, marginBottom: 16 },
  categoryGroup: { marginBottom: 16 },
  categoryTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  foodTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

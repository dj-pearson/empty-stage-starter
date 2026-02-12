import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useMobileApp } from './providers/MobileAppProvider';
import { useTheme } from './providers/MobileThemeProvider';
import { Card, CardContent, Badge, EmptyState, LoadingScreen } from './components/ui';

export default function RecipesListScreen() {
  const { recipes, deleteRecipe, isLoading } = useMobileApp();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');

  const filteredRecipes = useMemo(() => {
    if (!search.trim()) return recipes;
    const query = search.toLowerCase();
    return recipes.filter(r => r.name.toLowerCase().includes(query));
  }, [recipes, search]);

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Recipe', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecipe(id) },
    ]);
  };

  if (isLoading) return <LoadingScreen message="Loading recipes..." />;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: 'Recipes',
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
        }}
      />

      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.searchBar}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.muted, color: colors.foreground }]}
            placeholder="Search recipes..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search recipes"
          />
        </View>

        <FlatList
          data={filteredRecipes}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="🍳"
              title="No recipes yet"
              description="Create recipes to organize your family's favorite meals."
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => router.push(`/recipe/${item.id}`)}
              onLongPress={() => handleDelete(item.id, item.name)}
              accessibilityHint="Tap to view, long press to delete"
            >
              <Card style={[styles.recipeCard, { backgroundColor: colors.card }]}>
                <CardContent>
                  <Text style={[styles.recipeName, { color: colors.foreground }]}>{item.name}</Text>
                  <View style={styles.recipeMeta}>
                    {item.prep_time && (
                      <Badge variant="secondary">Prep: {item.prep_time}m</Badge>
                    )}
                    {item.cook_time && (
                      <Badge variant="secondary">Cook: {item.cook_time}m</Badge>
                    )}
                    {item.servings && (
                      <Badge variant="secondary">{item.servings} servings</Badge>
                    )}
                    {item.nutrition_info?.calories && (
                      <Badge variant="outline">{item.nutrition_info.calories} cal</Badge>
                    )}
                  </View>
                </CardContent>
              </Card>
            </TouchableOpacity>
          )}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { paddingHorizontal: 16, paddingVertical: 8 },
  searchInput: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  recipeCard: { marginBottom: 8 },
  recipeName: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  recipeMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

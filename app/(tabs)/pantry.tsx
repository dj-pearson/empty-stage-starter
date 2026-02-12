import { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { useMobileApp } from '../providers/MobileAppProvider';
import { useTheme } from '../providers/MobileThemeProvider';
import { Card, CardContent, Badge, Button, EmptyState, LoadingScreen } from '../components/ui';

const CATEGORIES = ['All', 'fruit', 'vegetable', 'protein', 'grain', 'dairy', 'snack', 'other'];

export default function PantryScreen() {
  const { foods, deleteFood, isLoading, refreshData } = useMobileApp();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  const filteredFoods = useMemo(() => {
    let filtered = foods;
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(f => f.category === selectedCategory);
    }
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = filtered.filter(f => f.name.toLowerCase().includes(query));
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [foods, selectedCategory, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Food', `Remove "${name}" from your pantry?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteFood(id) },
    ]);
  };

  if (isLoading) return <LoadingScreen message="Loading pantry..." />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.muted, color: colors.foreground }]}
          placeholder="Search foods..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          accessibilityLabel="Search foods"
        />
        <TouchableOpacity
          style={[styles.scanButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/scanner')}
          accessibilityLabel="Scan barcode"
        >
          <Text style={styles.scanButtonText}>📷</Text>
        </TouchableOpacity>
      </View>

      {/* Category Filters */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={CATEGORIES}
        keyExtractor={item => item}
        contentContainerStyle={styles.categoryBar}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.categoryChip,
              {
                backgroundColor: item === selectedCategory ? colors.primary : colors.muted,
              },
            ]}
            onPress={() => setSelectedCategory(item)}
            accessibilityLabel={`Filter by ${item}`}
            accessibilityState={{ selected: item === selectedCategory }}
          >
            <Text
              style={{
                color: item === selectedCategory ? colors.primaryForeground : colors.foreground,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {item === 'All' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Food List */}
      <FlatList
        data={filteredFoods}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="🍎"
            title="No foods yet"
            description="Add foods to your pantry by scanning barcodes or adding manually."
            action={
              <Button onPress={() => router.push('/scanner')}>
                Scan Barcode
              </Button>
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onLongPress={() => handleDelete(item.id, item.name)}
            accessibilityHint="Long press to delete"
          >
            <Card style={[styles.foodCard, { backgroundColor: colors.card }]}>
              <CardContent style={styles.foodRow}>
                <View style={styles.foodInfo}>
                  <Text style={[styles.foodName, { color: colors.foreground }]}>
                    {item.name}
                  </Text>
                  <View style={styles.foodMeta}>
                    {item.category && <Badge variant="secondary">{item.category}</Badge>}
                    {item.is_safe && <Badge variant="default">Safe</Badge>}
                    {item.allergens && item.allergens.length > 0 && (
                      <Badge variant="destructive">
                        {item.allergens.length} allergen{item.allergens.length > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </View>
                </View>
                {item.nutrition_info && item.nutrition_info.calories && (
                  <Text style={[styles.calories, { color: colors.mutedForeground }]}>
                    {item.nutrition_info.calories} cal
                  </Text>
                )}
              </CardContent>
            </Card>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  scanButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scanButtonText: { fontSize: 20 },
  categoryBar: { paddingHorizontal: 16, paddingBottom: 12, gap: 6 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, marginRight: 6 },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  foodCard: { marginBottom: 8 },
  foodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  foodInfo: { flex: 1, gap: 6 },
  foodName: { fontSize: 16, fontWeight: '600' },
  foodMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  calories: { fontSize: 13, fontWeight: '500' },
});

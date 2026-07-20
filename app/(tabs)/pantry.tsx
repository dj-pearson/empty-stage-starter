import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { FoodCategory } from '@/types';
import {
  DEFAULT_FOOD_FILTERS,
  filterAndSortFoods,
  foodStock,
  stockCounts,
  categoryCounts,
  activeFoodFilterCount,
  type FoodFilters,
} from '@/lib/foodFilters';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';
import { sanitizeTextInput } from '../../app/mobile/lib/validation';
import { CATEGORIES, suggestCategory } from '../../app/mobile/lib/unit-suggestions';
import { ItemDetailModal, type EditableItem } from '../../app/mobile/components/ItemDetailModal';
import { SearchField } from '../../app/mobile/components/SearchField';
import {
  FilterSortSheet,
  FilterButton,
  type FilterGroup,
} from '../../app/mobile/components/FilterSortSheet';
import { usePersistedFilters } from '../../app/mobile/hooks/usePersistedFilters';

interface FoodRow {
  id: string;
  name: string;
  category: FoodCategory;
  quantity: number | null;
  unit: string | null;
  is_safe: boolean | null;
  aisle: string | null;
}

const FOOD_SORT_OPTIONS = [
  { key: 'name', label: 'A–Z' },
  { key: 'stock-asc', label: 'Lowest stock' },
  { key: 'category', label: 'Category' },
];

export default function PantryScreen() {
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { filters, setFilters } = usePersistedFilters<FoodFilters>(
    'eatpal.mobile.pantry.filters',
    DEFAULT_FOOD_FILTERS
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailMode, setDetailMode] = useState<'add' | 'edit'>('add');
  const [detailInitial, setDetailInitial] = useState<EditableItem | undefined>(undefined);
  const [groceryModalVisible, setGroceryModalVisible] = useState(false);
  const [groceryInitial, setGroceryInitial] = useState<EditableItem | undefined>(undefined);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchFoods = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('foods')
        .select('id, name, category, quantity, unit, is_safe, aisle')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (data) setFoods(data as FoodRow[]);
    } catch (err) {
      console.error('Error fetching foods:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  const patchFilters = useCallback(
    (patch: Partial<FoodFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    [setFilters]
  );

  const filtered = useMemo(() => filterAndSortFoods(foods, filters), [foods, filters]);
  const counts = useMemo(() => stockCounts(foods), [foods]);
  const catCounts = useMemo(() => categoryCounts(foods), [foods]);
  const activeCount = activeFoodFilterCount(filters);

  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      {
        key: 'category',
        title: 'Category',
        multi: false,
        options: CATEGORIES.map((c) => ({
          key: c.key,
          label: `${c.label} (${catCounts[c.key] ?? 0})`,
          emoji: c.emoji,
        })),
        selected: filters.category ? [filters.category] : [],
        onChange: (sel) => patchFilters({ category: (sel[0] as FoodCategory) ?? null }),
      },
    ],
    [filters.category, catCounts, patchFilters]
  );

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  const adjustQty = async (food: FoodRow, delta: number) => {
    const next = Math.max(0, Math.round(((food.quantity ?? 0) + delta) * 100) / 100);
    setFoods((prev) => prev.map((f) => (f.id === food.id ? { ...f, quantity: next } : f)));
    try {
      const { error } = await supabase.from('foods').update({ quantity: next }).eq('id', food.id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to update quantity:', err);
      setFoods((prev) =>
        prev.map((f) => (f.id === food.id ? { ...f, quantity: food.quantity } : f))
      );
    }
  };

  const openAdd = () => {
    setDetailMode('add');
    setDetailInitial({ name: '', quantity: 1 });
    setDetailVisible(true);
  };

  const openEdit = (food: FoodRow) => {
    setDetailMode('edit');
    setDetailInitial({
      id: food.id,
      name: food.name,
      quantity: food.quantity ?? 0,
      unit: food.unit ?? '',
      category: food.category,
    });
    setDetailVisible(true);
  };

  const handleDetailSave = async (payload: EditableItem) => {
    setDetailVisible(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (detailMode === 'add') {
        const { data, error } = await supabase
          .from('foods')
          .insert({
            user_id: user.id,
            name: sanitizeTextInput(payload.name),
            quantity: payload.quantity ?? 0,
            unit: payload.unit ?? '',
            category: payload.category ?? 'snack',
            is_safe: true,
            is_try_bite: false,
          })
          .select('id, name, category, quantity, unit, is_safe, aisle')
          .single();
        if (error) throw error;
        if (data)
          setFoods((prev) =>
            [...prev, data as FoodRow].sort((a, b) => a.name.localeCompare(b.name))
          );
      } else if (payload.id) {
        const updatePayload = {
          name: sanitizeTextInput(payload.name),
          quantity: payload.quantity ?? 0,
          unit: payload.unit ?? '',
          category: payload.category ?? 'snack',
        };
        setFoods((prev) =>
          prev.map((f) => (f.id === payload.id ? ({ ...f, ...updatePayload } as FoodRow) : f))
        );
        const { error } = await supabase.from('foods').update(updatePayload).eq('id', payload.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error('Save food failed:', err);
      Alert.alert('Error', 'Failed to save item.');
      fetchFoods();
    }
  };

  const handleDelete = (food: FoodRow) => {
    Alert.alert('Remove from pantry', `Remove "${food.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setFoods((prev) => prev.filter((f) => f.id !== food.id));
          await supabase.from('foods').delete().eq('id', food.id);
        },
      },
    ]);
  };

  const openAddToGrocery = (food: FoodRow) => {
    setGroceryInitial({
      name: food.name,
      quantity: 1,
      unit: food.unit ?? '',
      category: (food.category ?? suggestCategory(food.name) ?? 'snack') as FoodCategory,
    });
    setGroceryModalVisible(true);
  };

  const handleGrocerySave = async (payload: EditableItem) => {
    setGroceryModalVisible(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('grocery_items').insert({
        user_id: user.id,
        name: sanitizeTextInput(payload.name),
        quantity: payload.quantity ?? 1,
        unit: payload.unit ?? '',
        category: payload.category ?? 'snack',
        notes: payload.notes ?? null,
        checked: false,
        added_via: 'restock',
      });
      if (error) throw error;
      showFlash(`Added "${payload.name}" to grocery list`);
    } catch (err) {
      console.error('Add to grocery failed:', err);
      Alert.alert('Error', 'Failed to add to grocery list.');
    }
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchFoods();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Pantry</Text>
        <TouchableOpacity
          style={styles.addTopBtn}
          onPress={openAdd}
          accessibilityLabel="Add pantry item"
        >
          <Text style={styles.addTopBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <SearchField
        value={filters.search}
        onChangeText={(text) => patchFilters({ search: text })}
        placeholder="Search pantry…"
        accessibilityLabel="Search pantry"
      />

      <View style={styles.filterRow}>
        <FilterChip
          active={filters.stock === 'all'}
          label={`All (${counts.all})`}
          onPress={() => patchFilters({ stock: 'all' })}
        />
        <FilterChip
          active={filters.stock === 'low'}
          label={`Low (${counts.low})`}
          tone="warning"
          onPress={() => patchFilters({ stock: filters.stock === 'low' ? 'all' : 'low' })}
        />
        <FilterChip
          active={filters.stock === 'out'}
          label={`Out (${counts.out})`}
          tone="error"
          onPress={() => patchFilters({ stock: filters.stock === 'out' ? 'all' : 'out' })}
        />
        <View style={{ flex: 1 }} />
        <FilterButton activeCount={activeCount} onPress={() => setFilterSheetOpen(true)} />
      </View>

      {flash && (
        <View style={styles.flash}>
          <Text style={styles.flashText}>{flash}</Text>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        // US-132: virtualization knobs for mid-range Android.
        removeClippedSubviews
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={10}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={({ item }) => {
          const cat = CATEGORIES.find((c) => c.key === item.category);
          const stock = foodStock(item.quantity);
          return (
            <View style={styles.itemRow}>
              <TouchableOpacity
                style={styles.itemTap}
                onPress={() => openEdit(item)}
                onLongPress={() => handleDelete(item)}
                accessibilityLabel={`Edit ${item.name}, stock ${item.quantity ?? 0}`}
                accessibilityHint="Long press to remove"
              >
                <View style={[styles.stockDot, styles[`stockDot_${stock}`]]} />
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {cat?.emoji} {cat?.label}
                    {item.unit ? `  ·  ${item.unit}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.qtyBlock}>
                <TouchableOpacity
                  onPress={() => adjustQty(item, -1)}
                  style={styles.qtyBtn}
                  accessibilityLabel="Decrease stock"
                >
                  <Text style={styles.qtyBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyVal}>{item.quantity ?? 0}</Text>
                <TouchableOpacity
                  onPress={() => adjustQty(item, 1)}
                  style={styles.qtyBtn}
                  accessibilityLabel="Increase stock"
                >
                  <Text style={styles.qtyBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => openAddToGrocery(item)}
                style={styles.cartBtn}
                accessibilityLabel={`Add ${item.name} to grocery list`}
              >
                <Text style={styles.cartBtnIcon}>🛒</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🥫</Text>
            <Text style={styles.emptyTitle}>
              {filters.search || activeCount > 0 || filters.stock !== 'all'
                ? 'No matches'
                : 'Pantry empty'}
            </Text>
            <Text style={styles.emptyText}>
              {filters.search || activeCount > 0 || filters.stock !== 'all'
                ? 'Try a different search or filter.'
                : 'Add items you have on hand to track stock.'}
            </Text>
          </View>
        }
      />

      <FilterSortSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter pantry"
        groups={filterGroups}
        sort={{
          options: FOOD_SORT_OPTIONS,
          value: filters.sortBy,
          onChange: (value) => patchFilters({ sortBy: value as FoodFilters['sortBy'] }),
        }}
        onReset={() =>
          setFilters((prev) => ({
            ...DEFAULT_FOOD_FILTERS,
            search: prev.search,
            stock: prev.stock,
          }))
        }
        activeCount={activeCount}
      />

      <ItemDetailModal
        visible={detailVisible}
        mode={detailMode}
        initial={detailInitial}
        onClose={() => setDetailVisible(false)}
        onSave={handleDetailSave}
      />

      <ItemDetailModal
        visible={groceryModalVisible}
        mode="add"
        initial={groceryInitial}
        onClose={() => setGroceryModalVisible(false)}
        onSave={handleGrocerySave}
      />
    </SafeAreaView>
  );
}

function FilterChip({
  active,
  label,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  tone?: 'warning' | 'error';
  onPress: () => void;
}) {
  const toneStyle =
    tone === 'warning' ? styles.chipWarning : tone === 'error' ? styles.chipError : undefined;
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive, active && toneStyle]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  addTopBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  addTopBtnText: { fontSize: fontSize.sm, color: colors.background, fontWeight: '700' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipWarning: { backgroundColor: colors.warning, borderColor: colors.warning },
  chipError: { backgroundColor: colors.error, borderColor: colors.error },
  chipText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.background, fontWeight: '700' },
  flash: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  flashText: { fontSize: fontSize.sm, color: colors.primaryDark, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
  },
  itemTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stockDot: { width: 10, height: 10, borderRadius: 5 },
  stockDot_ok: { backgroundColor: colors.success },
  stockDot_low: { backgroundColor: colors.warning },
  stockDot_out: { backgroundColor: colors.error },
  itemInfo: { flex: 1 },
  itemName: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  itemMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  qtyBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  qtyBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  qtyVal: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.text,
  },
  cartBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  cartBtnIcon: { fontSize: fontSize.md },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    textAlign: 'center',
  },
});

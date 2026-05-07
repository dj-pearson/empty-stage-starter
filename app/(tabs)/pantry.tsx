import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';
import { sanitizeTextInput } from '../../app/mobile/lib/validation';
import { CATEGORIES, suggestCategory } from '../../app/mobile/lib/unit-suggestions';
import { ItemDetailModal, type EditableItem } from '../../app/mobile/components/ItemDetailModal';

interface FoodRow {
  id: string;
  name: string;
  category: FoodCategory;
  quantity: number | null;
  unit: string | null;
  is_safe: boolean | null;
  aisle: string | null;
}

type StockFilter = 'all' | 'low' | 'out';

const LOW_STOCK_THRESHOLD = 2;

function stockOf(qty: number | null): 'out' | 'low' | 'ok' {
  const q = qty ?? 0;
  if (q === 0) return 'out';
  if (q <= LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

export default function PantryScreen() {
  const [foods, setFoods] = useState<FoodRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailMode, setDetailMode] = useState<'add' | 'edit'>('add');
  const [detailInitial, setDetailInitial] = useState<EditableItem | undefined>(undefined);
  const [groceryModalVisible, setGroceryModalVisible] = useState(false);
  const [groceryInitial, setGroceryInitial] = useState<EditableItem | undefined>(undefined);
  const [flash, setFlash] = useState<string | null>(null);

  const fetchFoods = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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

  useEffect(() => { fetchFoods(); }, [fetchFoods]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return foods.filter(f => {
      if (q && !f.name.toLowerCase().includes(q)) return false;
      const s = stockOf(f.quantity);
      if (filter === 'low' && s !== 'low') return false;
      if (filter === 'out' && s !== 'out') return false;
      return true;
    });
  }, [foods, query, filter]);

  const counts = useMemo(() => {
    const c = { all: foods.length, low: 0, out: 0 };
    foods.forEach(f => {
      const s = stockOf(f.quantity);
      if (s === 'low') c.low++;
      if (s === 'out') c.out++;
    });
    return c;
  }, [foods]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  const adjustQty = async (food: FoodRow, delta: number) => {
    const next = Math.max(0, Math.round(((food.quantity ?? 0) + delta) * 100) / 100);
    setFoods(prev => prev.map(f => f.id === food.id ? { ...f, quantity: next } : f));
    try {
      const { error } = await supabase
        .from('foods')
        .update({ quantity: next })
        .eq('id', food.id);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to update quantity:', err);
      setFoods(prev => prev.map(f => f.id === food.id ? { ...f, quantity: food.quantity } : f));
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
      const { data: { user } } = await supabase.auth.getUser();
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
        if (data) setFoods(prev => [...prev, data as FoodRow].sort((a, b) => a.name.localeCompare(b.name)));
      } else if (payload.id) {
        const updatePayload = {
          name: sanitizeTextInput(payload.name),
          quantity: payload.quantity ?? 0,
          unit: payload.unit ?? '',
          category: payload.category ?? 'snack',
        };
        setFoods(prev => prev.map(f => f.id === payload.id ? { ...f, ...updatePayload } as FoodRow : f));
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
          setFoods(prev => prev.filter(f => f.id !== food.id));
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
      const { data: { user } } = await supabase.auth.getUser();
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

  const onRefresh = () => { setIsRefreshing(true); fetchFoods(); };

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

      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search pantry…"
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel="Search pantry"
      />

      <View style={styles.filterRow}>
        <FilterChip
          active={filter === 'all'}
          label={`All (${counts.all})`}
          onPress={() => setFilter('all')}
        />
        <FilterChip
          active={filter === 'low'}
          label={`Low (${counts.low})`}
          tone="warning"
          onPress={() => setFilter('low')}
        />
        <FilterChip
          active={filter === 'out'}
          label={`Out (${counts.out})`}
          tone="error"
          onPress={() => setFilter('out')}
        />
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
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
        renderItem={({ item }) => {
          const cat = CATEGORIES.find(c => c.key === item.category);
          const stock = stockOf(item.quantity);
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
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
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
              {query || filter !== 'all' ? 'No matches' : 'Pantry empty'}
            </Text>
            <Text style={styles.emptyText}>
              {query || filter !== 'all'
                ? 'Try a different search or filter.'
                : 'Add items you have on hand to track stock.'}
            </Text>
          </View>
        }
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
  active, label, tone, onPress,
}: { active: boolean; label: string; tone?: 'warning' | 'error'; onPress: () => void }) {
  const toneStyle =
    tone === 'warning' ? styles.chipWarning
    : tone === 'error' ? styles.chipError
    : undefined;
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  screenTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  addTopBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
  },
  addTopBtnText: { fontSize: fontSize.sm, color: colors.background, fontWeight: '700' },
  search: {
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    height: 44, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
    fontSize: fontSize.md, color: colors.text, backgroundColor: colors.background,
  },
  filterRow: {
    flexDirection: 'row', gap: spacing.xs,
    paddingHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipWarning: { backgroundColor: colors.warning, borderColor: colors.warning },
  chipError: { backgroundColor: colors.error, borderColor: colors.error },
  chipText: { fontSize: fontSize.sm, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: colors.background, fontWeight: '700' },
  flash: {
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    padding: spacing.sm, borderRadius: borderRadius.md,
    backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: colors.primary,
  },
  flashText: { fontSize: fontSize.sm, color: colors.primaryDark, fontWeight: '600' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.border,
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
    width: 30, height: 30, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface,
  },
  qtyBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  qtyVal: {
    minWidth: 28, textAlign: 'center',
    fontSize: fontSize.sm, fontWeight: '700', color: colors.text,
  },
  cartBtn: {
    width: 36, height: 36, borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center', marginLeft: spacing.xs,
  },
  cartBtnIcon: { fontSize: fontSize.md },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  emptyText: {
    fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm,
    paddingHorizontal: spacing.xl, textAlign: 'center',
  },
});

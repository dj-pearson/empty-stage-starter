import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { FoodCategory, MealSlot } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { suggestCategory, CATEGORIES } from '../lib/unit-suggestions';
import { sanitizeTextInput } from '../lib/validation';

const SOURCE_TABS = [
  { key: 'all', label: 'All', emoji: '✨' },
  { key: 'pantry', label: 'Pantry', emoji: '🥫' },
  { key: 'recipes', label: 'Recipes', emoji: '🍳' },
] as const;
type SourceTab = (typeof SOURCE_TABS)[number]['key'];

interface PantryItem {
  id: string;
  name: string;
  category: FoodCategory | null;
  quantity: number | null;
  unit: string | null;
}

interface RecipeItem {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  food_ids: string[];
  prep_time: string | null;
  difficulty_level: string | null;
}

export type PlannerSelection =
  | {
      kind: 'pantry';
      food: PantryItem;
      deductFromPantry: boolean;
      addToGroceryIfShort: boolean;
    }
  | {
      kind: 'recipe';
      recipe: RecipeItem;
      addMissingToGrocery: boolean;
    }
  | {
      kind: 'new';
      name: string;
      category: FoodCategory;
      addToGrocery: boolean;
    };

interface Props {
  visible: boolean;
  slot: MealSlot | null;
  slotLabel: string;
  date: string;
  audienceLabel: string;
  onClose: () => void;
  onPick: (selection: PlannerSelection) => Promise<void> | void;
}

const SLOT_EMOJI: Record<MealSlot, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack1: '🍎',
  snack2: '🥨',
  try_bite: '👅',
};

function formatDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PlannerSearchSheet({
  visible,
  slot,
  slotLabel,
  date,
  audienceLabel,
  onClose,
  onPick,
}: Props) {
  const [tab, setTab] = useState<SourceTab>('all');
  const [query, setQuery] = useState('');
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [groceryNames, setGroceryNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deduct, setDeduct] = useState(true);
  const [autoGrocery, setAutoGrocery] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setTab('all');
    setBusyKey(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const [foodsRes, recipesRes, groceryRes] = await Promise.all([
          supabase
            .from('foods')
            .select('id, name, category, quantity, unit')
            .eq('user_id', user.id)
            .order('name'),
          supabase
            .from('recipes')
            .select('id, name, description, image_url, food_ids, prep_time, difficulty_level')
            .eq('user_id', user.id)
            .order('name'),
          supabase.from('grocery_items').select('name').eq('user_id', user.id).eq('checked', false),
        ]);
        if (cancelled) return;
        setPantry((foodsRes.data ?? []) as PantryItem[]);
        setRecipes((recipesRes.data ?? []) as RecipeItem[]);
        setGroceryNames(
          new Set((groceryRes.data ?? []).map((g: { name: string }) => g.name.trim().toLowerCase()))
        );
      } catch (err) {
        console.error('Planner search load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const q = query.trim().toLowerCase();

  const filteredPantry = useMemo(() => {
    if (!q) return pantry;
    return pantry.filter((p) => p.name.toLowerCase().includes(q));
  }, [pantry, q]);

  const filteredRecipes = useMemo(() => {
    if (!q) return recipes;
    return recipes.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }, [recipes, q]);

  const exactPantryMatch = useMemo(() => {
    if (!q) return false;
    return pantry.some((p) => p.name.trim().toLowerCase() === q);
  }, [pantry, q]);

  const showNewItemRow = q.length > 0 && !exactPantryMatch;
  const newItemInGrocery = q.length > 0 && groceryNames.has(q);

  const pickPantry = async (food: PantryItem) => {
    if (busyKey) return;
    setBusyKey(`pantry:${food.id}`);
    try {
      const stock = food.quantity ?? 0;
      await onPick({
        kind: 'pantry',
        food,
        deductFromPantry: deduct && stock > 0,
        addToGroceryIfShort: autoGrocery && stock <= 0,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const pickRecipe = async (recipe: RecipeItem) => {
    if (busyKey) return;
    if (recipe.food_ids.length === 0) {
      Alert.alert(
        'Recipe has no ingredients',
        'Open this recipe on the web to link ingredients before scheduling.'
      );
      return;
    }
    setBusyKey(`recipe:${recipe.id}`);
    try {
      await onPick({
        kind: 'recipe',
        recipe,
        addMissingToGrocery: autoGrocery,
      });
    } finally {
      setBusyKey(null);
    }
  };

  const pickNew = async () => {
    if (busyKey) return;
    const name = sanitizeTextInput(query, 80);
    if (!name) return;
    setBusyKey('new');
    try {
      await onPick({
        kind: 'new',
        name,
        category: suggestCategory(name) ?? 'snack',
        addToGrocery: autoGrocery,
      });
    } finally {
      setBusyKey(null);
    }
  };

  type Row =
    | { type: 'pantry'; item: PantryItem }
    | { type: 'recipe'; item: RecipeItem }
    | { type: 'new'; query: string };

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    if (tab === 'all' || tab === 'pantry') {
      filteredPantry.forEach((item) => list.push({ type: 'pantry', item }));
    }
    if (tab === 'all' || tab === 'recipes') {
      filteredRecipes.forEach((item) => list.push({ type: 'recipe', item }));
    }
    if (tab !== 'recipes' && showNewItemRow) {
      list.push({ type: 'new', query });
    }
    return list;
  }, [tab, filteredPantry, filteredRecipes, showNewItemRow, query]);

  const counts = {
    pantry: filteredPantry.length,
    recipes: filteredRecipes.length,
    all: filteredPantry.length + filteredRecipes.length,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {slot ? `${SLOT_EMOJI[slot]} Add to ${slotLabel}` : 'Add to plan'}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {formatDateLabel(date)} · {audienceLabel}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>🔎</Text>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search pantry, recipes, or type a new item…"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="Search planner items"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search">
                <Text style={styles.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.tabRow}>
            {SOURCE_TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                  {t.emoji} {t.label}
                  {t.key === 'pantry' ? ` · ${counts.pantry}` : ''}
                  {t.key === 'recipes' ? ` · ${counts.recipes}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.toggleRow}>
            <ToggleChip
              label="Pull from pantry"
              hint="Deduct stock when adding"
              active={deduct}
              onToggle={() => setDeduct((v) => !v)}
            />
            <ToggleChip
              label="Auto-grocery"
              hint="Add what's missing to groceries"
              active={autoGrocery}
              onToggle={() => setAutoGrocery((v) => !v)}
            />
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={rows}
              keyboardShouldPersistTaps="handled"
              keyExtractor={(row, idx) =>
                row.type === 'pantry'
                  ? `p-${row.item.id}`
                  : row.type === 'recipe'
                    ? `r-${row.item.id}`
                    : `new-${idx}`
              }
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyIcon}>🍽️</Text>
                  <Text style={styles.emptyTitle}>{q ? 'No matches' : 'Nothing yet'}</Text>
                  <Text style={styles.emptyText}>
                    {q
                      ? 'Type a name and tap "Add new" to drop it on the plan + grocery list.'
                      : 'Type to search your pantry and recipes.'}
                  </Text>
                </View>
              }
              renderItem={({ item: row }) => {
                if (row.type === 'pantry') {
                  const stock = row.item.quantity ?? 0;
                  const cat = CATEGORIES.find((c) => c.key === row.item.category);
                  const stockTone = stock <= 0 ? 'out' : stock <= 2 ? 'low' : 'ok';
                  return (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => pickPantry(row.item)}
                      disabled={!!busyKey}
                      accessibilityLabel={`Add ${row.item.name} from pantry`}
                    >
                      <View
                        style={[
                          styles.dot,
                          styles[`dot_${stockTone}` as 'dot_out' | 'dot_low' | 'dot_ok'],
                        ]}
                      />
                      <View style={styles.rowBody}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {row.item.name}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {cat ? `${cat.emoji} ${cat.label}` : 'Pantry'}
                          {' · '}
                          {stock <= 0
                            ? 'Out of stock'
                            : `${stock}${row.item.unit ? ` ${row.item.unit}` : ''} on hand`}
                        </Text>
                      </View>
                      {busyKey === `pantry:${row.item.id}` ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.rowAdd}>＋</Text>
                      )}
                    </TouchableOpacity>
                  );
                }
                if (row.type === 'recipe') {
                  return (
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => pickRecipe(row.item)}
                      disabled={!!busyKey}
                      accessibilityLabel={`Add recipe ${row.item.name}`}
                    >
                      <Text style={styles.recipeIcon}>🍳</Text>
                      <View style={styles.rowBody}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {row.item.name}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          Recipe · {row.item.food_ids.length} ingredient
                          {row.item.food_ids.length === 1 ? '' : 's'}
                          {row.item.prep_time ? ` · ${row.item.prep_time}` : ''}
                        </Text>
                      </View>
                      {busyKey === `recipe:${row.item.id}` ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Text style={styles.rowAdd}>＋</Text>
                      )}
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    style={[styles.row, styles.rowNew]}
                    onPress={pickNew}
                    disabled={!!busyKey}
                    accessibilityLabel={`Add new item ${row.query}`}
                  >
                    <Text style={styles.recipeIcon}>＋</Text>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        Add "{row.query}"
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={2}>
                        {newItemInGrocery
                          ? 'Already on grocery list — will plan it for this meal.'
                          : autoGrocery
                            ? "Not in pantry — we'll drop it on your grocery list too."
                            : 'Adds to plan only (toggle Auto-grocery to also buy).'}
                      </Text>
                    </View>
                    {busyKey === 'new' ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.rowAdd}>↵</Text>
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.list}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ToggleChip({
  label,
  hint,
  active,
  onToggle,
}: {
  label: string;
  hint: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.toggle, active && styles.toggleActive]}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`${label}. ${hint}`}
    >
      <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
        {active ? '✓ ' : ''}
        {label}
      </Text>
      <Text style={[styles.toggleHint, active && styles.toggleHintActive]} numberOfLines={1}>
        {hint}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  backdropPress: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    height: '92%',
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  closeText: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: { fontSize: fontSize.md },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.text, paddingVertical: 0 },
  searchClear: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 32,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: fontSize.xs, color: colors.text, fontWeight: '600' },
  tabTextActive: { color: colors.background },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  toggle: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleActive: { backgroundColor: '#ecfdf5', borderColor: colors.primary },
  toggleLabel: { fontSize: fontSize.xs, color: colors.text, fontWeight: '700' },
  toggleLabelActive: { color: colors.primaryDark },
  toggleHint: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  toggleHintActive: { color: colors.primaryDark },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  rowNew: {
    backgroundColor: '#f0fdf4',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    marginVertical: spacing.xs,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dot_ok: { backgroundColor: colors.success },
  dot_low: { backgroundColor: colors.warning },
  dot_out: { backgroundColor: colors.error },
  recipeIcon: { fontSize: fontSize.md, width: 18, textAlign: 'center' },
  rowBody: { flex: 1 },
  rowName: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  rowMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  rowAdd: {
    fontSize: fontSize.xl,
    color: colors.primary,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
  },
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

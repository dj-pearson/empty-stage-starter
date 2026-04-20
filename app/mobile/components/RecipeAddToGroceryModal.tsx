import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { FoodCategory } from '@/types';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { suggestCategory, CATEGORIES } from '../lib/unit-suggestions';

interface RecipeForGrocery {
  id: string;
  name: string;
  food_ids: string[];
}

interface FoodRow {
  id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
}

interface RecipeIngredientRow {
  id: string;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  food_id: string | null;
  is_optional: boolean | null;
}

type IngredientLine = {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  inStockQty: number;
  alreadyInList: boolean;
  isOptional: boolean;
  sourceFoodId?: string;
};

interface Props {
  visible: boolean;
  recipe: RecipeForGrocery | null;
  onClose: () => void;
  onAdded?: (count: number) => void;
}

export function RecipeAddToGroceryModal({ visible, recipe, onClose, onAdded }: Props) {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [lines, setLines] = useState<IngredientLine[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [servings, setServings] = useState(1);

  useEffect(() => {
    if (!visible || !recipe) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [ingredientsRes, foodsRes, groceryRes] = await Promise.all([
          supabase
            .from('recipe_ingredients')
            .select('id, ingredient_name, quantity, unit, food_id, is_optional')
            .eq('recipe_id', recipe.id)
            .order('sort_order', { ascending: true, nullsFirst: false }),
          recipe.food_ids.length > 0
            ? supabase
                .from('foods')
                .select('id, name, quantity, unit, category')
                .in('id', recipe.food_ids)
            : Promise.resolve({ data: [] as FoodRow[], error: null }),
          supabase
            .from('grocery_items')
            .select('name, checked')
            .eq('user_id', user.id)
            .eq('checked', false),
        ]);

        if (cancelled) return;

        const ingredients = (ingredientsRes.data ?? []) as RecipeIngredientRow[];
        const foods = (foodsRes.data ?? []) as FoodRow[];
        const foodById = new Map(foods.map(f => [f.id, f]));
        const groceryNames = new Set(
          (groceryRes.data ?? []).map((g: any) => (g.name as string).toLowerCase()),
        );

        const structured: IngredientLine[] = ingredients.map(ing => {
          const linked = ing.food_id ? foodById.get(ing.food_id) : undefined;
          const name = ing.ingredient_name;
          const category = (linked?.category as FoodCategory | undefined)
            ?? suggestCategory(name)
            ?? 'snack';
          return {
            key: `ing-${ing.id}`,
            name,
            quantity: ing.quantity ?? 1,
            unit: ing.unit ?? linked?.unit ?? '',
            category,
            inStockQty: linked?.quantity ?? 0,
            alreadyInList: groceryNames.has(name.toLowerCase()),
            isOptional: !!ing.is_optional,
            sourceFoodId: ing.food_id ?? undefined,
          };
        });

        const structuredFoodIds = new Set(
          ingredients.map(i => i.food_id).filter(Boolean) as string[],
        );
        const remainingFoods = foods.filter(f => !structuredFoodIds.has(f.id));
        const foodOnlyLines: IngredientLine[] = remainingFoods.map(f => {
          const category = (f.category as FoodCategory | undefined)
            ?? suggestCategory(f.name)
            ?? 'snack';
          return {
            key: `food-${f.id}`,
            name: f.name,
            quantity: 1,
            unit: f.unit ?? '',
            category,
            inStockQty: f.quantity ?? 0,
            alreadyInList: groceryNames.has(f.name.toLowerCase()),
            isOptional: false,
            sourceFoodId: f.id,
          };
        });

        const merged = [...structured, ...foodOnlyLines];
        setLines(merged);
        const defaultChecked = new Set(
          merged
            .filter(l => l.inStockQty < l.quantity && !l.alreadyInList && !l.isOptional)
            .map(l => l.key),
        );
        setChecked(defaultChecked);
        setServings(1);
      } catch (err) {
        console.error('Failed loading recipe ingredients:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, recipe]);

  const toggle = (key: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const buckets: { need: IngredientLine[]; low: IngredientLine[]; stocked: IngredientLine[] } = {
      need: [], low: [], stocked: [],
    };
    lines.forEach(l => {
      const scaled = l.quantity * servings;
      if (l.inStockQty <= 0) buckets.need.push(l);
      else if (l.inStockQty < scaled) buckets.low.push(l);
      else buckets.stocked.push(l);
    });
    return buckets;
  }, [lines, servings]);

  const handleAdd = async () => {
    if (!recipe) return;
    const toAdd = lines.filter(l => checked.has(l.key));
    if (toAdd.length === 0) return;

    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const inserts = toAdd.map(l => ({
        user_id: user.id,
        name: l.name,
        quantity: Math.max(1, Math.round((l.quantity * servings - l.inStockQty) * 100) / 100) || l.quantity * servings,
        unit: l.unit ?? '',
        category: l.category,
        checked: false,
        added_via: 'recipe',
        source_recipe_id: recipe.id,
      }));

      const { error } = await supabase.from('grocery_items').insert(inserts);
      if (error) throw error;

      onAdded?.(toAdd.length);
      onClose();
    } catch (err) {
      console.error('Add to grocery failed:', err);
      Alert.alert('Error', 'Failed to add items.');
    } finally {
      setAdding(false);
    }
  };

  if (!recipe) return null;

  const renderRow = (l: IngredientLine) => {
    const cat = CATEGORIES.find(c => c.key === l.category);
    const isChecked = checked.has(l.key);
    const scaledQty = Math.round(l.quantity * servings * 100) / 100;
    return (
      <TouchableOpacity
        key={l.key}
        style={styles.ingRow}
        onPress={() => toggle(l.key)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked }}
      >
        <View style={[styles.checkbox, isChecked && styles.checkboxActive]}>
          {isChecked && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.ingInfo}>
          <Text style={styles.ingName}>
            {l.name}
            {l.isOptional && <Text style={styles.optional}> (optional)</Text>}
          </Text>
          <Text style={styles.ingMeta}>
            {scaledQty} {l.unit || ''} · {cat?.emoji ?? ''} {cat?.label ?? ''}
            {l.inStockQty > 0 && `  ·  stock: ${l.inStockQty}`}
          </Text>
        </View>
        {l.alreadyInList && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>in list</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const totalSelected = checked.size;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropPress} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Add to grocery</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{recipe.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.servingsRow}>
            <Text style={styles.servingsLabel}>Servings</Text>
            <View style={styles.servingsCtrl}>
              <TouchableOpacity
                style={styles.servingsBtn}
                onPress={() => setServings(s => Math.max(1, s - 1))}
                accessibilityLabel="Decrease servings"
              >
                <Text style={styles.servingsBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.servingsValue}>{servings}</Text>
              <TouchableOpacity
                style={styles.servingsBtn}
                onPress={() => setServings(s => Math.min(20, s + 1))}
                accessibilityLabel="Increase servings"
              >
                <Text style={styles.servingsBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
              {grouped.need.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>🛒 Need to buy ({grouped.need.length})</Text>
                  {grouped.need.map(renderRow)}
                </>
              )}
              {grouped.low.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>⚠️ Low stock ({grouped.low.length})</Text>
                  {grouped.low.map(renderRow)}
                </>
              )}
              {grouped.stocked.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>✅ In stock ({grouped.stocked.length})</Text>
                  {grouped.stocked.map(renderRow)}
                </>
              )}
              {lines.length === 0 && (
                <Text style={styles.empty}>
                  This recipe has no tracked ingredients yet.
                </Text>
              )}
            </ScrollView>
          )}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, (totalSelected === 0 || adding) && styles.saveBtnDisabled]}
              disabled={totalSelected === 0 || adding}
              onPress={handleAdd}
            >
              {adding ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Text style={styles.saveText}>
                  Add {totalSelected > 0 ? totalSelected : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  backdropPress: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    height: '88%',
    paddingBottom: spacing.lg,
  },
  handle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  closeText: { fontSize: fontSize.xl, color: colors.textSecondary, paddingHorizontal: spacing.sm },
  servingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  servingsLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  servingsCtrl: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  servingsBtn: {
    width: 36, height: 36, borderRadius: borderRadius.md, borderWidth: 1,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.surface,
  },
  servingsBtnText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  servingsValue: {
    fontSize: fontSize.md, fontWeight: '600', color: colors.text,
    minWidth: 32, textAlign: 'center',
  },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  ingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, minHeight: 48,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: borderRadius.sm, borderWidth: 2,
    borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { fontSize: 12, color: colors.background, fontWeight: '700' },
  ingInfo: { flex: 1 },
  ingName: { fontSize: fontSize.md, color: colors.text },
  optional: { fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic' },
  ingMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  badge: {
    backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border,
  },
  badgeText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.xl },
  footer: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1, height: 48, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  saveBtn: {
    flex: 2, height: 48, borderRadius: borderRadius.md, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: fontSize.md, color: colors.background, fontWeight: '700' },
});

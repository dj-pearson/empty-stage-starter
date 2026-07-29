import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { FoodCategory } from '@/types';
import { convert } from '@/lib/unitNormalize';
import {
  ingredientMatchKey,
  planGroceryMerge,
  type ExistingGroceryItem,
  type GroceryAddInput,
} from '@/lib/groceryMerge';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { suggestCategory, CATEGORIES } from '../lib/unit-suggestions';

/**
 * US-593: how much of `required` still needs buying given what's in the pantry.
 *
 * The old inline maths was `Math.max(1, qty * servings - inStockQty)`, which
 * had two defects: it floored every amount at 1 (so a needed 0.5 tsp was
 * inserted as 1 tsp) and it subtracted the pantry quantity regardless of unit
 * (2 cup − 1 bag = 1). We now only subtract when the units genuinely convert,
 * and fail safe toward buying the full amount when they don't.
 */
function requiredAfterStock(
  required: number,
  requiredUnit: string,
  stocked: number,
  stockedUnit: string
): number {
  if (!(stocked > 0)) return required;
  const stockedInRequiredUnit = convert(
    stocked,
    stockedUnit || requiredUnit,
    requiredUnit || stockedUnit
  );
  // Incomparable units (e.g. recipe in cups, pantry in bags) — buy it all.
  if (stockedInRequiredUnit == null) return required;
  return Math.max(0, required - stockedInRequiredUnit);
}

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
  /** Unit the pantry stock is stored in — needed to subtract it correctly. */
  inStockUnit: string;
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
  const [existing, setExisting] = useState<ExistingGroceryItem[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [servings, setServings] = useState(1);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState('1');
  const [customUnit, setCustomUnit] = useState('');
  const customKeyRef = useRef(0);

  useEffect(() => {
    if (!visible || !recipe) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
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
            .select('id, name, quantity, unit, checked')
            .eq('user_id', user.id)
            .eq('checked', false),
        ]);

        if (cancelled) return;

        // US-593: these errors used to be swallowed by `?? []`, so an RLS or
        // schema failure looked identical to "this recipe has no ingredients".
        const loadError = ingredientsRes.error ?? foodsRes.error ?? groceryRes.error;
        if (loadError) throw loadError;

        // Live `recipe_ingredients` columns differ from the generated types
        // (see RecipeBuilderSheet header). Cast at this boundary.
        const ingredients = (ingredientsRes.data ?? []) as unknown as RecipeIngredientRow[];
        const foods = (foodsRes.data ?? []) as FoodRow[];
        const foodById = new Map(foods.map((f) => [f.id, f]));
        const existingGrocery = (groceryRes.data ?? []) as ExistingGroceryItem[];
        // US-593: match on the canonical ingredient key, not the raw lowercased
        // name, so "Ground Beef 80/20" is recognised as "ground beef".
        const groceryKeys = new Set(existingGrocery.map((g) => ingredientMatchKey(g.name)));

        const structured: IngredientLine[] = ingredients.map((ing) => {
          const linked = ing.food_id ? foodById.get(ing.food_id) : undefined;
          const name = ing.ingredient_name;
          const category =
            (linked?.category as FoodCategory | undefined) ?? suggestCategory(name) ?? 'snack';
          return {
            key: `ing-${ing.id}`,
            name,
            quantity: ing.quantity ?? 1,
            unit: ing.unit ?? linked?.unit ?? '',
            category,
            inStockQty: linked?.quantity ?? 0,
            inStockUnit: linked?.unit ?? '',
            alreadyInList: groceryKeys.has(ingredientMatchKey(name)),
            isOptional: !!ing.is_optional,
            sourceFoodId: ing.food_id ?? undefined,
          };
        });

        const structuredFoodIds = new Set(
          ingredients.map((i) => i.food_id).filter(Boolean) as string[]
        );
        const remainingFoods = foods.filter((f) => !structuredFoodIds.has(f.id));
        const foodOnlyLines: IngredientLine[] = remainingFoods.map((f) => {
          const category =
            (f.category as FoodCategory | undefined) ?? suggestCategory(f.name) ?? 'snack';
          return {
            key: `food-${f.id}`,
            name: f.name,
            quantity: 1,
            unit: f.unit ?? '',
            category,
            inStockQty: f.quantity ?? 0,
            inStockUnit: f.unit ?? '',
            alreadyInList: groceryKeys.has(ingredientMatchKey(f.name)),
            isOptional: false,
            sourceFoodId: f.id,
          };
        });

        const merged = [...structured, ...foodOnlyLines];
        setLines(merged);
        setExisting(existingGrocery);
        const defaultChecked = new Set(
          merged
            .filter(
              (l) =>
                requiredAfterStock(l.quantity, l.unit, l.inStockQty, l.inStockUnit) > 0 &&
                !l.alreadyInList &&
                !l.isOptional
            )
            .map((l) => l.key)
        );
        setChecked(defaultChecked);
        setServings(1);
        setCustomName('');
        setCustomQty('1');
        setCustomUnit('');
      } catch (err) {
        console.error('Failed loading recipe ingredients:', err);
        if (!cancelled) {
          Alert.alert(
            "Couldn't load ingredients",
            'Check your connection and try again.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, recipe]);

  const toggle = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Add an item that isn't part of the recipe (the "can't add items not in the
  // list" gap). It joins the list as a checked "Need to buy" line and is
  // inserted along with everything else on Add.
  const addCustomItem = () => {
    const name = (customName ?? '').trim();
    if (!name) return;
    const qty = parseFloat(customQty);
    const key = `custom-${customKeyRef.current++}`;
    const line: IngredientLine = {
      key,
      name,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: customUnit.trim(),
      category: suggestCategory(name) ?? 'snack',
      inStockQty: 0,
      inStockUnit: '',
      alreadyInList: false,
      isOptional: false,
    };
    setLines((prev) => [line, ...prev]);
    setChecked((prev) => new Set(prev).add(key));
    setCustomName('');
    setCustomQty('1');
    setCustomUnit('');
  };

  const grouped = useMemo(() => {
    const buckets: { need: IngredientLine[]; low: IngredientLine[]; stocked: IngredientLine[] } = {
      need: [],
      low: [],
      stocked: [],
    };
    lines.forEach((l) => {
      const scaled = l.quantity * servings;
      if (l.inStockQty <= 0) {
        buckets.need.push(l);
        return;
      }
      // US-593: compare stock against the requirement unit-aware instead of
      // comparing bare numbers across unrelated units.
      const stillNeeded = requiredAfterStock(scaled, l.unit, l.inStockQty, l.inStockUnit);
      if (stillNeeded > 0) buckets.low.push(l);
      else buckets.stocked.push(l);
    });
    return buckets;
  }, [lines, servings]);

  const handleAdd = async () => {
    if (!recipe) return;
    const toAdd = lines.filter((l) => checked.has(l.key));
    if (toAdd.length === 0) return;

    setAdding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // US-593: build the requested amounts with no quantity floor and with
      // unit-aware pantry subtraction, then let planGroceryMerge stack them
      // onto existing unchecked rows instead of inserting duplicates.
      const requested: GroceryAddInput[] = toAdd
        .map((l) => ({
          name: l.name,
          quantity:
            Math.round(
              requiredAfterStock(l.quantity * servings, l.unit, l.inStockQty, l.inStockUnit) * 100
            ) / 100,
          unit: l.unit ?? '',
          category: l.category,
          added_via: 'recipe',
          source_recipe_id: recipe.id,
        }))
        .filter((i) => i.quantity > 0);

      if (requested.length === 0) {
        Alert.alert('Nothing to add', 'Your pantry already covers these ingredients.');
        return;
      }

      const plan = planGroceryMerge(requested, existing);

      if (plan.inserts.length > 0) {
        const { error } = await supabase.from('grocery_items').insert(
          plan.inserts.map((i) => ({
            user_id: user.id,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit ?? '',
            category: i.category,
            checked: false,
            added_via: i.added_via,
            source_recipe_id: i.source_recipe_id,
          }))
        );
        if (error) throw error;
      }

      for (const update of plan.updates) {
        const { error } = await supabase
          .from('grocery_items')
          .update({ quantity: update.quantity, unit: update.unit })
          .eq('id', update.id)
          .eq('user_id', user.id);
        if (error) throw error;
      }

      onAdded?.(plan.inserts.length + plan.updates.length);
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
    const cat = CATEGORIES.find((c) => c.key === l.category);
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
              <Text style={styles.subtitle} numberOfLines={1}>
                {recipe.name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.servingsRow}>
            {/* US-593: this is a batch multiplier over the recipe's own yield,
                not an absolute serving count — label it honestly. */}
            <Text style={styles.servingsLabel}>Batches</Text>
            <View style={styles.servingsCtrl}>
              <TouchableOpacity
                style={styles.servingsBtn}
                onPress={() => setServings((s) => Math.max(1, s - 1))}
                accessibilityLabel="Decrease batches"
              >
                <Text style={styles.servingsBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.servingsValue}>{servings}</Text>
              <TouchableOpacity
                style={styles.servingsBtn}
                onPress={() => setServings((s) => Math.min(20, s + 1))}
                accessibilityLabel="Increase batches"
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
              <View style={styles.customBlock}>
                <Text style={styles.sectionTitle}>➕ Add an item not in this recipe</Text>
                <View style={styles.customRow}>
                  <TextInput
                    style={styles.customName}
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="Item name"
                    placeholderTextColor={colors.textSecondary}
                    onSubmitEditing={addCustomItem}
                    returnKeyType="done"
                    accessibilityLabel="Custom item name"
                  />
                  <TextInput
                    style={styles.customQty}
                    value={customQty}
                    onChangeText={setCustomQty}
                    keyboardType="decimal-pad"
                    placeholder="Qty"
                    placeholderTextColor={colors.textSecondary}
                    accessibilityLabel="Custom item quantity"
                  />
                  <TextInput
                    style={styles.customUnit}
                    value={customUnit}
                    onChangeText={setCustomUnit}
                    placeholder="Unit"
                    placeholderTextColor={colors.textSecondary}
                    accessibilityLabel="Custom item unit"
                  />
                  <TouchableOpacity
                    style={[styles.customAdd, !customName.trim() && styles.customAddDisabled]}
                    onPress={addCustomItem}
                    disabled={!customName.trim()}
                    accessibilityLabel="Add custom item"
                  >
                    <Text style={styles.customAddText}>Add</Text>
                  </TouchableOpacity>
                </View>
              </View>

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
                <Text style={styles.empty}>This recipe has no tracked ingredients yet.</Text>
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
                <Text style={styles.saveText}>Add {totalSelected > 0 ? totalSelected : ''}</Text>
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
  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  servingsLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text },
  servingsCtrl: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  servingsBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  servingsBtnText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  servingsValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    minWidth: 32,
    textAlign: 'center',
  },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  customBlock: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  customName: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.background,
  },
  customQty: {
    width: 52,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.background,
  },
  customUnit: {
    width: 60,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.background,
  },
  customAdd: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customAddDisabled: { opacity: 0.5 },
  customAddText: { fontSize: fontSize.sm, color: colors.background, fontWeight: '700' },
  ingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkmark: { fontSize: 12, color: colors.background, fontWeight: '700' },
  ingInfo: { flex: 1 },
  ingName: { fontSize: fontSize.md, color: colors.text },
  optional: { fontSize: fontSize.xs, color: colors.textSecondary, fontStyle: 'italic' },
  ingMeta: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  badge: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.xl },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: fontSize.md, color: colors.background, fontWeight: '700' },
});

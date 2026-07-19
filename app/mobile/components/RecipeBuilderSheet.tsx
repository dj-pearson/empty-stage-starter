import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { Database } from '@/integrations/supabase/types';
import type { FoodCategory } from '@/types';
import { searchRank } from '@/lib/mobileSearch';
import type { RecipeDifficulty } from '@/lib/recipeFilters';
import { colors, spacing, fontSize, borderRadius } from '../lib/theme';
import { CATEGORIES } from '../lib/unit-suggestions';
import { sanitizeTextInput } from '../lib/validation';

/**
 * Native recipe create/edit. Previously impossible on iOS — the Recipes screen
 * told users to "create recipes on the web app". This builder writes both the
 * `recipes` row and structured `recipe_ingredients` rows, and critically lets
 * you add free-text ingredients that aren't in your pantry (the "can't add
 * items not in the list" complaint).
 *
 * Schema note: `recipe_ingredients` has historical column drift between the
 * phase-1 migration (`ingredient_name` / `is_optional`) and US-265
 * (`name` / `optional_notes`). We deliberately read/write the SAME column names
 * the shipped mobile readers use (`app/(tabs)/recipes.tsx`,
 * `RecipeAddToGroceryModal.tsx`) — `ingredient_name` / `is_optional` — so a
 * recipe built here shows its ingredients everywhere in the app.
 */

export interface RecipeForEdit {
  id: string;
  name: string;
  description: string | null;
  category: FoodCategory | null;
  image_url: string | null;
  prep_time: string | null;
  cook_time: string | null;
  servings: string | null;
  difficulty_level: string | null;
  tags: string[] | null;
  instructions: string | null;
  tips: string | null;
  food_ids: string[];
}

interface PantryFood {
  id: string;
  name: string;
  unit: string | null;
  category: FoodCategory | null;
}

interface IngredientDraft {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  isOptional: boolean;
  foodId: string | null;
}

interface Props {
  visible: boolean;
  /** null = create mode; a recipe = edit mode. */
  recipe: RecipeForEdit | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const DIFFICULTIES: Array<{ key: RecipeDifficulty; label: string; emoji: string }> = [
  { key: 'easy', label: 'Easy', emoji: '🟢' },
  { key: 'medium', label: 'Medium', emoji: '🟡' },
  { key: 'hard', label: 'Hard', emoji: '🔴' },
];

export function RecipeBuilderSheet({ visible, recipe, onClose, onSaved }: Props) {
  const isEdit = !!recipe;
  const keyCounter = useRef(0);
  const nextKey = () => `ing-${keyCounter.current++}`;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [category, setCategory] = useState<FoodCategory | null>(null);
  const [difficulty, setDifficulty] = useState<RecipeDifficulty | null>(null);
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
  const [instructions, setInstructions] = useState('');
  const [tips, setTips] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [foods, setFoods] = useState<PantryFood[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);

    // Reset form each time the sheet opens.
    setName(recipe?.name ?? '');
    setDescription(recipe?.description ?? '');
    setImageUrl(recipe?.image_url ?? '');
    setCategory(recipe?.category ?? null);
    setDifficulty((recipe?.difficulty_level as RecipeDifficulty | null) ?? null);
    setPrepTime(recipe?.prep_time ?? '');
    setCookTime(recipe?.cook_time ?? '');
    setServings(recipe?.servings ?? '');
    setInstructions(recipe?.instructions ?? '');
    setTips(recipe?.tips ?? '');
    setTags(recipe?.tags ?? []);
    setTagDraft('');
    setIngredients([]);
    setFocusedKey(null);

    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const foodsPromise = supabase
          .from('foods')
          .select('id, name, unit, category')
          .eq('user_id', user.id)
          .order('name');

        const ingredientsPromise = recipe
          ? supabase
              .from('recipe_ingredients')
              .select('id, ingredient_name, quantity, unit, food_id, is_optional, sort_order')
              .eq('recipe_id', recipe.id)
              .order('sort_order', { ascending: true, nullsFirst: false })
          : Promise.resolve({ data: [] as unknown[] });

        const [foodsRes, ingredientsRes] = await Promise.all([foodsPromise, ingredientsPromise]);
        if (cancelled) return;

        setFoods((foodsRes.data ?? []) as PantryFood[]);

        // See file header: live `recipe_ingredients` columns differ from the
        // generated types. Cast at this boundary.
        const loaded = (ingredientsRes.data ?? []) as unknown as Array<{
          ingredient_name: string;
          quantity: number | null;
          unit: string | null;
          food_id: string | null;
          is_optional: boolean | null;
        }>;
        setIngredients(
          loaded.map((row) => ({
            key: nextKey(),
            name: row.ingredient_name,
            quantity: row.quantity != null ? String(row.quantity) : '',
            unit: row.unit ?? '',
            isOptional: !!row.is_optional,
            foodId: row.food_id,
          }))
        );
      } catch (err) {
        console.error('Recipe builder load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, recipe]);

  const addIngredient = () => {
    const key = nextKey();
    setIngredients((prev) => [
      ...prev,
      { key, name: '', quantity: '', unit: '', isOptional: false, foodId: null },
    ]);
    setFocusedKey(key);
  };

  const updateIngredient = (key: string, patch: Partial<IngredientDraft>) => {
    setIngredients((prev) => prev.map((ing) => (ing.key === key ? { ...ing, ...patch } : ing)));
  };

  const removeIngredient = (key: string) => {
    setIngredients((prev) => prev.filter((ing) => ing.key !== key));
  };

  const linkFood = (key: string, food: PantryFood) => {
    updateIngredient(key, {
      name: food.name,
      unit: food.unit ?? '',
      foodId: food.id,
    });
    setFocusedKey(null);
  };

  const addTag = () => {
    const t = sanitizeTextInput(tagDraft, 30);
    if (!t) return;
    if (!tags.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
      setTags((prev) => [...prev, t]);
    }
    setTagDraft('');
  };

  const suggestionsFor = (ing: IngredientDraft): PantryFood[] => {
    if (ing.foodId || !ing.name.trim()) return [];
    return searchRank(foods, ing.name, (f) => [{ value: f.name }]).slice(0, 4);
  };

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    const cleanName = sanitizeTextInput(name, 120);
    if (!cleanName) {
      Alert.alert('Name required', 'Give your recipe a name.');
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const cleanIngredients = ingredients
        .map((ing) => ({ ...ing, name: sanitizeTextInput(ing.name, 120) }))
        .filter((ing) => ing.name.length > 0);

      const foodIds = [
        ...new Set(cleanIngredients.map((i) => i.foodId).filter((id): id is string => !!id)),
      ];

      const recipePayload = {
        name: cleanName,
        description: sanitizeTextInput(description, 500) || null,
        category: category ?? null,
        image_url: imageUrl.trim() || null,
        prep_time: prepTime.trim() || null,
        cook_time: cookTime.trim() || null,
        servings: servings.trim() || null,
        difficulty_level: difficulty ?? null,
        tags,
        instructions: sanitizeTextInput(instructions, 4000) || null,
        tips: sanitizeTextInput(tips, 2000) || null,
        food_ids: foodIds,
      };

      let recipeId = recipe?.id;

      if (isEdit && recipeId) {
        const { error: updateErr } = await supabase
          .from('recipes')
          .update(recipePayload)
          .eq('id', recipeId);
        if (updateErr) throw updateErr;
        // Replace the ingredient set wholesale (simpler + correct vs diffing).
        const { error: delErr } = await supabase
          .from('recipe_ingredients')
          .delete()
          .eq('recipe_id', recipeId);
        if (delErr) throw delErr;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('recipes')
          .insert({ ...recipePayload, user_id: user.id })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        recipeId = (inserted as { id: string }).id;
      }

      if (recipeId && cleanIngredients.length > 0) {
        const rows = cleanIngredients.map((ing, index) => ({
          recipe_id: recipeId as string,
          ingredient_name: ing.name,
          quantity: parseQuantity(ing.quantity),
          unit: ing.unit.trim() || null,
          food_id: ing.foodId,
          is_optional: ing.isOptional,
          sort_order: index,
        }));
        // Column names follow the live phase-1 schema (ingredient_name/
        // is_optional), which the generated Insert type doesn't reflect
        // (see file header). Cast at this boundary.
        const { error: ingErr } = await supabase
          .from('recipe_ingredients')
          .insert(
            rows as unknown as Database['public']['Tables']['recipe_ingredients']['Insert'][]
          );
        if (ingErr) throw ingErr;
      }

      onSaved(isEdit ? `Updated "${cleanName}"` : `Created "${cleanName}"`);
      onClose();
    } catch (err) {
      console.error('Save recipe failed:', err);
      Alert.alert('Error', 'Could not save the recipe. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const ingredientCountLabel = useMemo(
    () => ingredients.filter((i) => i.name.trim().length > 0).length,
    [ingredients]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Cancel">
            <Text style={styles.headerCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isEdit ? 'Edit recipe' : 'New recipe'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={!canSave}
            accessibilityLabel="Save recipe"
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.headerSave, !canSave && styles.headerSaveDisabled]}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Taco night"
              placeholderTextColor={colors.textSecondary}
              autoFocus={!isEdit}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Short description (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            {/* Ingredients */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Ingredients ({ingredientCountLabel})</Text>
            </View>
            {ingredients.map((ing) => {
              const suggestions = focusedKey === ing.key ? suggestionsFor(ing) : [];
              return (
                <View key={ing.key} style={styles.ingCard}>
                  <View style={styles.ingTopRow}>
                    <TextInput
                      style={styles.ingName}
                      value={ing.name}
                      onChangeText={(text) =>
                        updateIngredient(ing.key, { name: text, foodId: null })
                      }
                      onFocus={() => setFocusedKey(ing.key)}
                      placeholder="Ingredient (any name — not just pantry)"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <TouchableOpacity
                      onPress={() => removeIngredient(ing.key)}
                      accessibilityLabel={`Remove ${ing.name || 'ingredient'}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.ingRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {suggestions.length > 0 && (
                    <View style={styles.suggestRow}>
                      {suggestions.map((food) => (
                        <TouchableOpacity
                          key={food.id}
                          style={styles.suggestChip}
                          onPress={() => linkFood(ing.key, food)}
                          accessibilityLabel={`Link to pantry item ${food.name}`}
                        >
                          <Text style={styles.suggestChipText}>🔗 {food.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <View style={styles.ingBottomRow}>
                    <TextInput
                      style={styles.ingQty}
                      value={ing.quantity}
                      onChangeText={(text) => updateIngredient(ing.key, { quantity: text })}
                      placeholder="Qty"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={styles.ingUnit}
                      value={ing.unit}
                      onChangeText={(text) => updateIngredient(ing.key, { unit: text })}
                      placeholder="Unit"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <TouchableOpacity
                      style={[styles.optionalToggle, ing.isOptional && styles.optionalToggleActive]}
                      onPress={() => updateIngredient(ing.key, { isOptional: !ing.isOptional })}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: ing.isOptional }}
                      accessibilityLabel="Optional ingredient"
                    >
                      <Text
                        style={[styles.optionalText, ing.isOptional && styles.optionalTextActive]}
                      >
                        {ing.isOptional ? '✓ Optional' : 'Optional'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {ing.foodId && <Text style={styles.linkedHint}>Linked to pantry item</Text>}
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.addIngredient}
              onPress={addIngredient}
              accessibilityLabel="Add ingredient"
            >
              <Text style={styles.addIngredientText}>＋ Add ingredient</Text>
            </TouchableOpacity>

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.chip, category === c.key && styles.chipActive]}
                  onPress={() => setCategory(category === c.key ? null : c.key)}
                  accessibilityState={{ selected: category === c.key }}
                >
                  <Text style={[styles.chipText, category === c.key && styles.chipTextActive]}>
                    {c.emoji} {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Difficulty */}
            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.chipRow}>
              {DIFFICULTIES.map((d) => (
                <TouchableOpacity
                  key={d.key}
                  style={[styles.chip, difficulty === d.key && styles.chipActive]}
                  onPress={() => setDifficulty(difficulty === d.key ? null : d.key)}
                  accessibilityState={{ selected: difficulty === d.key }}
                >
                  <Text style={[styles.chipText, difficulty === d.key && styles.chipTextActive]}>
                    {d.emoji} {d.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tags */}
            <Text style={styles.label}>Tags</Text>
            {tags.length > 0 && (
              <View style={styles.chipRow}>
                {tags.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.chip, styles.chipActive]}
                    onPress={() => setTags((prev) => prev.filter((t) => t !== tag))}
                    accessibilityLabel={`Remove tag ${tag}`}
                  >
                    <Text style={styles.chipTextActive}>{tag} ✕</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.tagInputRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={tagDraft}
                onChangeText={setTagDraft}
                placeholder="Add a tag (e.g. dinner)"
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={addTag}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={styles.tagAddBtn}
                onPress={addTag}
                accessibilityLabel="Add tag"
              >
                <Text style={styles.tagAddText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Times */}
            <View style={styles.timesRow}>
              <View style={styles.timeCell}>
                <Text style={styles.label}>Prep</Text>
                <TextInput
                  style={styles.input}
                  value={prepTime}
                  onChangeText={setPrepTime}
                  placeholder="15 min"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.timeCell}>
                <Text style={styles.label}>Cook</Text>
                <TextInput
                  style={styles.input}
                  value={cookTime}
                  onChangeText={setCookTime}
                  placeholder="30 min"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
              <View style={styles.timeCell}>
                <Text style={styles.label}>Serves</Text>
                <TextInput
                  style={styles.input}
                  value={servings}
                  onChangeText={setServings}
                  placeholder="4"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={styles.label}>Instructions</Text>
            <TextInput
              style={[styles.input, styles.multilineTall]}
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Step-by-step instructions (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            <Text style={styles.label}>Tips</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={tips}
              onChangeText={setTips}
              placeholder="Tips for picky eaters (optional)"
              placeholderTextColor={colors.textSecondary}
              multiline
            />

            <Text style={styles.label}>Photo URL</Text>
            <TextInput
              style={styles.input}
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://…"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerCancel: { fontSize: fontSize.md, color: colors.textSecondary, minWidth: 56 },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    textAlign: 'center',
  },
  headerSave: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'right',
  },
  headerSaveDisabled: { color: colors.textSecondary },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    backgroundColor: colors.background,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  multilineTall: { minHeight: 120, textAlignVertical: 'top' },
  sectionHeaderRow: { marginTop: spacing.lg, marginBottom: spacing.xs },
  sectionTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  ingCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  ingTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ingName: {
    flex: 1,
    minHeight: 40,
    fontSize: fontSize.md,
    color: colors.text,
    paddingVertical: spacing.xs,
  },
  ingRemove: { fontSize: fontSize.md, color: colors.textSecondary, paddingHorizontal: spacing.xs },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  suggestChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: '#ecfdf5',
  },
  suggestChipText: { fontSize: fontSize.xs, color: colors.primaryDark, fontWeight: '600' },
  ingBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  ingQty: {
    width: 64,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.background,
  },
  ingUnit: {
    width: 80,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    backgroundColor: colors.background,
  },
  optionalToggle: {
    flex: 1,
    height: 40,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  optionalToggleActive: { borderColor: colors.primary, backgroundColor: '#ecfdf5' },
  optionalText: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  optionalTextActive: { color: colors.primaryDark },
  linkedHint: { fontSize: fontSize.xs, color: colors.primary, marginTop: spacing.xs },
  addIngredient: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  addIngredientText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSize.sm, color: colors.text },
  chipTextActive: { color: colors.background, fontWeight: '600' },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  tagAddBtn: {
    paddingHorizontal: spacing.md,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagAddText: { fontSize: fontSize.sm, color: colors.background, fontWeight: '700' },
  timesRow: { flexDirection: 'row', gap: spacing.sm },
  timeCell: { flex: 1 },
});

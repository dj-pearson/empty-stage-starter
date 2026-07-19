import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  Image,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/integrations/supabase/client.mobile';
import type { FoodCategory } from '@/types';
import {
  DEFAULT_RECIPE_FILTERS,
  filterAndSortRecipes,
  collectRecipeTags,
  activeRecipeFilterCount,
  type RecipeFilters,
  type RecipeDifficulty,
} from '@/lib/recipeFilters';
import { colors, spacing, fontSize, borderRadius } from '../../app/mobile/lib/theme';
import { CATEGORIES } from '../../app/mobile/lib/unit-suggestions';
import { RecipeAddToGroceryModal } from '../../app/mobile/components/RecipeAddToGroceryModal';
import { RecipeAddToPlannerModal } from '../../app/mobile/components/RecipeAddToPlannerModal';
import { SearchField } from '../../app/mobile/components/SearchField';
import {
  FilterSortSheet,
  FilterButton,
  type FilterGroup,
} from '../../app/mobile/components/FilterSortSheet';
import { usePersistedFilters } from '../../app/mobile/hooks/usePersistedFilters';

interface RecipeRow {
  id: string;
  name: string;
  description: string | null;
  category: FoodCategory | null;
  image_url: string | null;
  prep_time: string | null;
  cook_time: string | null;
  servings: string | null;
  food_ids: string[];
  difficulty_level: string | null;
  kid_friendly_score: number | null;
  tags: string[] | null;
  instructions: string | null;
  additional_ingredients: string | null;
  tips: string | null;
  /** Ingredient names, loaded once for search (not persisted to DB shape). */
  ingredientNames?: string[];
  ingredientCount?: number;
}

const RECIPE_SORT_OPTIONS = [
  { key: 'recent', label: 'Newest' },
  { key: 'name', label: 'A–Z' },
  { key: 'prep-asc', label: 'Prep time' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'kid-friendly', label: 'Kid score' },
  { key: 'ingredients', label: 'Fewest ingredients' },
];

const DIFFICULTY_OPTIONS: Array<{ key: RecipeDifficulty; label: string; emoji: string }> = [
  { key: 'easy', label: 'Easy', emoji: '🟢' },
  { key: 'medium', label: 'Medium', emoji: '🟡' },
  { key: 'hard', label: 'Hard', emoji: '🔴' },
];

const QUICK_FILTER_OPTIONS = [
  { key: 'quick', label: 'Quick (<30m)', emoji: '⚡' },
  { key: 'kidApproved', label: 'Kid approved', emoji: '⭐' },
  { key: 'readyToCook', label: 'Ready to cook', emoji: '✅' },
];

interface IngredientView {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  is_optional: boolean | null;
}

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { filters, setFilters } = usePersistedFilters<RecipeFilters>(
    'eatpal.mobile.recipes.filters',
    DEFAULT_RECIPE_FILTERS
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const [detailRecipe, setDetailRecipe] = useState<RecipeRow | null>(null);
  const [detailIngredients, setDetailIngredients] = useState<IngredientView[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [groceryTarget, setGroceryTarget] = useState<RecipeRow | null>(null);
  const [plannerTarget, setPlannerTarget] = useState<RecipeRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const patchFilters = useCallback(
    (patch: Partial<RecipeFilters>) => setFilters((prev) => ({ ...prev, ...patch })),
    [setFilters]
  );

  const fetchRecipes = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('recipes')
        .select(
          'id, name, description, category, image_url, prep_time, cook_time, servings, food_ids, difficulty_level, kid_friendly_score, tags, instructions, additional_ingredients, tips'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const rows = (data ?? []) as RecipeRow[];

      // Enrich with ingredient names so search can match on ingredients, not
      // just the recipe title/description/tags. One extra query for all recipes.
      const ids = rows.map((r) => r.id);
      if (ids.length > 0) {
        const { data: ingredients } = await supabase
          .from('recipe_ingredients')
          .select('recipe_id, ingredient_name')
          .in('recipe_id', ids);
        if (ingredients) {
          const byRecipe = new Map<string, string[]>();
          for (const ing of ingredients as Array<{ recipe_id: string; ingredient_name: string }>) {
            const list = byRecipe.get(ing.recipe_id) ?? [];
            list.push(ing.ingredient_name);
            byRecipe.set(ing.recipe_id, list);
          }
          for (const row of rows) {
            const names = byRecipe.get(row.id);
            if (names) {
              row.ingredientNames = names;
              row.ingredientCount = names.length;
            }
          }
        }
      }

      setRecipes(rows);
    } catch (err) {
      console.error('Error fetching recipes:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);

  const openDetail = async (r: RecipeRow) => {
    setDetailRecipe(r);
    setDetailIngredients([]);
    setDetailLoading(true);
    try {
      const { data } = await supabase
        .from('recipe_ingredients')
        .select('id, ingredient_name, quantity, unit, is_optional, sort_order')
        .eq('recipe_id', r.id)
        .order('sort_order', { ascending: true, nullsFirst: false });
      const mapped: IngredientView[] = (data ?? []).map(
        (i: {
          id: string;
          ingredient_name: string;
          quantity: number | null;
          unit: string | null;
          is_optional: boolean | null;
        }) => ({
          id: i.id,
          name: i.ingredient_name,
          quantity: i.quantity,
          unit: i.unit,
          is_optional: i.is_optional,
        })
      );
      setDetailIngredients(mapped);
    } catch (err) {
      console.error('Error loading ingredients:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => filterAndSortRecipes(recipes, filters), [recipes, filters]);

  const availableTags = useMemo(() => collectRecipeTags(recipes), [recipes]);
  const activeCount = activeRecipeFilterCount(filters);

  const filterGroups = useMemo<FilterGroup[]>(() => {
    const groups: FilterGroup[] = [
      {
        key: 'category',
        title: 'Category',
        multi: false,
        options: CATEGORIES.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji })),
        selected: filters.category ? [filters.category] : [],
        onChange: (sel) => patchFilters({ category: (sel[0] as FoodCategory) ?? null }),
      },
      {
        key: 'difficulty',
        title: 'Difficulty',
        multi: false,
        options: DIFFICULTY_OPTIONS,
        selected: filters.difficulty ? [filters.difficulty] : [],
        onChange: (sel) => patchFilters({ difficulty: (sel[0] as RecipeDifficulty) ?? null }),
      },
      {
        key: 'quick',
        title: 'Quick filters',
        multi: true,
        options: QUICK_FILTER_OPTIONS,
        selected: [
          filters.quick ? 'quick' : '',
          filters.kidApproved ? 'kidApproved' : '',
          filters.readyToCook ? 'readyToCook' : '',
        ].filter(Boolean),
        onChange: (sel) =>
          patchFilters({
            quick: sel.includes('quick'),
            kidApproved: sel.includes('kidApproved'),
            readyToCook: sel.includes('readyToCook'),
          }),
      },
    ];
    if (availableTags.length > 0) {
      groups.push({
        key: 'tags',
        title: 'Tags',
        multi: true,
        options: availableTags.map((t) => ({ key: t, label: t })),
        selected: filters.tags,
        onChange: (sel) => patchFilters({ tags: sel }),
      });
    }
    return groups;
  }, [filters, availableTags, patchFilters]);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  };

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchRecipes();
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
        <Text style={styles.screenTitle}>Recipes</Text>
        <Text style={styles.count}>{filtered.length}</Text>
      </View>

      <SearchField
        value={filters.search}
        onChangeText={(text) => patchFilters({ search: text })}
        placeholder="Search recipes, tags, ingredients…"
        accessibilityLabel="Search recipes"
      />

      <View style={styles.toolbar}>
        <FilterButton activeCount={activeCount} onPress={() => setFilterSheetOpen(true)} />
        {activeCount > 0 && (
          <TouchableOpacity
            onPress={() =>
              setFilters((prev) => ({ ...DEFAULT_RECIPE_FILTERS, search: prev.search }))
            }
            accessibilityLabel="Clear filters"
          >
            <Text style={styles.clearFilters}>Clear</Text>
          </TouchableOpacity>
        )}
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
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => openDetail(item)}
            accessibilityLabel={`Open recipe ${item.name}`}
          >
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.cardImage} />
            ) : (
              <View style={[styles.cardImage, styles.cardImageEmpty]}>
                <Text style={styles.cardImageEmptyText}>🍽️</Text>
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.description && (
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
              <View style={styles.cardMeta}>
                {item.prep_time && <Text style={styles.metaItem}>⏱ {item.prep_time}</Text>}
                {item.difficulty_level && (
                  <Text style={styles.metaItem}>• {item.difficulty_level}</Text>
                )}
                {item.food_ids.length > 0 && (
                  <Text style={styles.metaItem}>• {item.food_ids.length} ing</Text>
                )}
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  setGroceryTarget(item);
                }}
                style={styles.quickAction}
                accessibilityLabel="Add to grocery list"
              >
                <Text style={styles.quickActionIcon}>🛒</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  setPlannerTarget(item);
                }}
                style={styles.quickAction}
                accessibilityLabel="Add to planner"
              >
                <Text style={styles.quickActionIcon}>📅</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🍳</Text>
            <Text style={styles.emptyTitle}>
              {filters.search || activeCount > 0 ? 'No matches' : 'No recipes yet'}
            </Text>
            <Text style={styles.emptyText}>
              {filters.search || activeCount > 0
                ? 'Try a different search or loosen your filters.'
                : 'Create recipes on the web app to start meal planning.'}
            </Text>
          </View>
        }
      />

      <FilterSortSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter recipes"
        groups={filterGroups}
        sort={{
          options: RECIPE_SORT_OPTIONS,
          value: filters.sortBy,
          onChange: (value) => patchFilters({ sortBy: value as RecipeFilters['sortBy'] }),
        }}
        onReset={() => setFilters((prev) => ({ ...DEFAULT_RECIPE_FILTERS, search: prev.search }))}
        activeCount={activeCount}
      />

      {/* Detail Modal */}
      <Modal
        visible={!!detailRecipe}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailRecipe(null)}
      >
        {detailRecipe && (
          <SafeAreaView style={styles.detailContainer} edges={['top']}>
            <View style={styles.detailHeader}>
              <TouchableOpacity onPress={() => setDetailRecipe(null)} accessibilityLabel="Close">
                <Text style={styles.detailBack}>‹ Back</Text>
              </TouchableOpacity>
              <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                {detailRecipe.name}
              </Text>
              <View style={{ width: 50 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
              {detailRecipe.image_url && (
                <Image source={{ uri: detailRecipe.image_url }} style={styles.detailImage} />
              )}

              <View style={styles.detailBody}>
                <Text style={styles.detailTitle}>{detailRecipe.name}</Text>
                {detailRecipe.description && (
                  <Text style={styles.detailDesc}>{detailRecipe.description}</Text>
                )}

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setGroceryTarget(detailRecipe)}
                    accessibilityLabel="Add to grocery list"
                  >
                    <Text style={styles.actionIcon}>🛒</Text>
                    <Text style={styles.actionLabel}>Add to grocery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setPlannerTarget(detailRecipe)}
                    accessibilityLabel="Add to planner"
                  >
                    <Text style={styles.actionIcon}>📅</Text>
                    <Text style={styles.actionLabel}>Add to planner</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.metaGrid}>
                  {detailRecipe.prep_time && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Prep</Text>
                      <Text style={styles.metaValue}>{detailRecipe.prep_time}</Text>
                    </View>
                  )}
                  {detailRecipe.cook_time && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Cook</Text>
                      <Text style={styles.metaValue}>{detailRecipe.cook_time}</Text>
                    </View>
                  )}
                  {detailRecipe.servings && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Serves</Text>
                      <Text style={styles.metaValue}>{detailRecipe.servings}</Text>
                    </View>
                  )}
                  {detailRecipe.difficulty_level && (
                    <View style={styles.metaCell}>
                      <Text style={styles.metaLabel}>Level</Text>
                      <Text style={styles.metaValue}>{detailRecipe.difficulty_level}</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.sectionHeader}>Ingredients</Text>
                {detailLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : detailIngredients.length > 0 ? (
                  detailIngredients.map((ing) => (
                    <View key={ing.id} style={styles.ingLine}>
                      <Text style={styles.ingBullet}>•</Text>
                      <Text style={styles.ingText}>
                        {ing.quantity ? `${ing.quantity}${ing.unit ? ' ' + ing.unit : ''} ` : ''}
                        {ing.name}
                        {ing.is_optional && <Text style={styles.optional}> (optional)</Text>}
                      </Text>
                    </View>
                  ))
                ) : detailRecipe.food_ids.length > 0 ? (
                  <Text style={styles.emptyInline}>
                    {detailRecipe.food_ids.length} ingredient
                    {detailRecipe.food_ids.length === 1 ? '' : 's'} linked — open on web to view
                    details.
                  </Text>
                ) : (
                  <Text style={styles.emptyInline}>No ingredients listed.</Text>
                )}

                {detailRecipe.additional_ingredients && (
                  <>
                    <Text style={styles.sectionHeader}>Also needed</Text>
                    <Text style={styles.bodyText}>{detailRecipe.additional_ingredients}</Text>
                  </>
                )}

                {detailRecipe.instructions && (
                  <>
                    <Text style={styles.sectionHeader}>Instructions</Text>
                    <Text style={styles.bodyText}>{detailRecipe.instructions}</Text>
                  </>
                )}

                {detailRecipe.tips && (
                  <>
                    <Text style={styles.sectionHeader}>Tips</Text>
                    <Text style={styles.bodyText}>{detailRecipe.tips}</Text>
                  </>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      <RecipeAddToGroceryModal
        visible={!!groceryTarget}
        recipe={groceryTarget}
        onClose={() => setGroceryTarget(null)}
        onAdded={(n) => showFlash(`Added ${n} item${n === 1 ? '' : 's'} to grocery list`)}
      />

      <RecipeAddToPlannerModal
        visible={!!plannerTarget}
        recipe={plannerTarget}
        onClose={() => setPlannerTarget(null)}
        onAdded={(info) =>
          showFlash(`Scheduled ${info.slot} on ${info.date} for ${info.kidCount || 'you'}`)
        }
      />
    </SafeAreaView>
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
  count: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  clearFilters: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
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
  card: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'stretch',
  },
  cardImage: { width: 80, height: '100%', minHeight: 80 },
  cardImageEmpty: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImageEmptyText: { fontSize: 28 },
  cardBody: { flex: 1, padding: spacing.sm, justifyContent: 'center' },
  cardName: { fontSize: fontSize.md, color: colors.text, fontWeight: '600' },
  cardDesc: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  cardMeta: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, flexWrap: 'wrap' },
  metaItem: { fontSize: fontSize.xs, color: colors.textSecondary },
  cardActions: {
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  quickAction: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionIcon: { fontSize: fontSize.md },
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
  detailContainer: { flex: 1, backgroundColor: colors.background },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailBack: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  detailHeaderTitle: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  detailImage: { width: '100%', height: 220 },
  detailBody: { padding: spacing.lg },
  detailTitle: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  detailDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  actionIcon: { fontSize: fontSize.md },
  actionLabel: { fontSize: fontSize.sm, color: colors.background, fontWeight: '700' },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  metaCell: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 80,
  },
  metaLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  metaValue: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600', marginTop: 2 },
  sectionHeader: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  ingLine: { flexDirection: 'row', paddingVertical: 2, gap: spacing.xs },
  ingBullet: { fontSize: fontSize.md, color: colors.primary, width: 16 },
  ingText: { flex: 1, fontSize: fontSize.sm, color: colors.text, lineHeight: 20 },
  optional: { color: colors.textSecondary, fontStyle: 'italic' },
  emptyInline: { fontSize: fontSize.sm, color: colors.textSecondary, fontStyle: 'italic' },
  bodyText: { fontSize: fontSize.sm, color: colors.text, lineHeight: 22 },
});

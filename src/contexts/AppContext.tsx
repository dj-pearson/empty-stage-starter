import React, { useCallback, useMemo, useEffect, useRef, createContext, useContext } from "react";
import { Food, Kid, PlanEntry, GroceryItem, Recipe } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { getStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { handleSupabaseAuthError } from "@/lib/supabaseAuthError";
import { selectLocalOnlyRecipes } from "@/lib/recipeMigration";
import { redactSnapshotForCache } from "@/lib/cacheSnapshot";
import { mergeWindowedPlanEntries } from "@/lib/planWindow";
import { AuthProvider, useAuth } from "./AuthContext";
import { FoodsProvider, useFoods } from "./FoodsContext";
import { KidsProvider, useKids } from "./KidsContext";
import { RecipesProvider, useRecipes, parseRecipeRows, RECIPE_WITH_INGREDIENTS_SELECT, selectRecipesWithFallback } from "./RecipesContext";
import { parseKidRows, parseFoodRows, parsePlanEntryRows, parseGroceryItemRows } from "@/lib/normalizeEntities";
import { PlanProvider, usePlan } from "./PlanContext";
import { GroceryProvider, useGrocery } from "./GroceryContext";
import { InventoryProvider, useInventory, parseMovementRows, parseStockRows, MOVEMENT_WINDOW_DAYS, MOVEMENT_LIMIT } from "./InventoryContext";
import { compareLedgerToLegacy, summarizeDivergences, type ComparableItem } from "@/lib/stockComparison";
import { buildStockComparisonSample, sampleSignature, type StockComparisonSample } from "@/lib/stockComparisonSample";
import type { GroceryAddInput } from "@/lib/groceryMerge";

// US-331: re-export the narrow domain hooks so components can subscribe to only
// the slice they use (e.g. `import { useFoods } from "@/contexts/AppContext"`)
// without reaching through the merged `useApp()` value. Each domain context
// value is independently memoized, so a grocery toggle no longer re-renders a
// foods-only component. Prefer these over useApp() in new code; useApp() pulls
// every domain and re-renders on any change.
export { useFoods } from "./FoodsContext";
export { useKids } from "./KidsContext";
export { useRecipes } from "./RecipesContext";
export { usePlan } from "./PlanContext";
export { useGrocery } from "./GroceryContext";
export { useInventory } from "./InventoryContext";

interface AppContextType {
  foods: Food[];
  kids: Kid[];
  recipes: Recipe[];
  activeKidId: string | null;
  planEntries: PlanEntry[];
  groceryItems: GroceryItem[];
  addFood: (food: Omit<Food, "id">) => Promise<boolean>;
  updateFood: (id: string, food: Partial<Food>) => void;
  deleteFood: (id: string) => void;
  addKid: (kid: Omit<Kid, "id">) => Promise<boolean>;
  updateKid: (id: string, kid: Partial<Kid>) => void;
  deleteKid: (id: string) => void;
  setActiveKid: (id: string | null) => void;
  setActiveKidId: (id: string | null) => void;
  addRecipe: (recipe: Omit<Recipe, "id">) => Promise<Recipe>;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  setPlanEntries: (entries: PlanEntry[]) => void;
  addPlanEntry: (entry: Omit<PlanEntry, "id">) => void;
  addPlanEntries: (entries: Omit<PlanEntry, "id">[]) => void;
  updatePlanEntry: (id: string, updates: Partial<PlanEntry>) => void;
  setGroceryItems: (items: GroceryItem[]) => void;
  addGroceryItem: (item: Omit<GroceryItem, "id" | "checked">) => void;
  addGroceryItemsMerged: (items: GroceryAddInput[]) => number;
  toggleGroceryItem: (id: string) => void;
  updateGroceryItem: (id: string, updates: Partial<GroceryItem>) => void;
  deleteGroceryItem: (id: string) => void;
  deleteGroceryItems: (ids: string[]) => void;
  clearCheckedGroceryItems: () => void;
  exportData: () => string;
  importData: (jsonData: string) => void;
  resetAllData: () => void;
  addFoods: (foods: Omit<Food, "id">[]) => Promise<boolean>;
  updateFoods: (updates: { id: string; updates: Partial<Food> }[]) => Promise<void>;
  deleteFoods: (ids: string[]) => Promise<void>;
  copyWeekPlan: (fromDate: string, toDate: string, kidId: string) => Promise<void>;
  deleteWeekPlan: (weekStart: string, kidId: string) => Promise<void>;
  refreshFoods?: () => Promise<void>;
  refreshRecipes?: () => Promise<void>;
  refreshKids?: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = "kid-meal-planner";

// US-671: how many individual divergences the dark-launch comparison logs
// before it stops and reports a count instead.
const LEDGER_DIVERGENCE_LOG_LIMIT = 50;

// Long enough that a burst of realtime events settles into one comparison.
const LEDGER_COMPARISON_DEBOUNCE_MS = 1000;

const STARTER_FOODS: Omit<Food, "id">[] = [
  { name: "Chicken Nuggets", category: "protein", is_safe: true, is_try_bite: false },
  { name: "Mac & Cheese", category: "carb", is_safe: true, is_try_bite: false },
  { name: "Pizza", category: "carb", is_safe: true, is_try_bite: false },
  { name: "Yogurt", category: "dairy", is_safe: true, is_try_bite: false },
  { name: "Apple Slices", category: "fruit", is_safe: true, is_try_bite: false },
  { name: "Banana", category: "fruit", is_safe: true, is_try_bite: false },
  { name: "Goldfish Crackers", category: "snack", is_safe: true, is_try_bite: false },
  { name: "String Cheese", category: "dairy", is_safe: true, is_try_bite: false },
  { name: "Grapes", category: "fruit", is_safe: true, is_try_bite: false },
  { name: "Carrots", category: "vegetable", is_safe: true, is_try_bite: false },
  { name: "Broccoli", category: "vegetable", is_safe: false, is_try_bite: true },
  { name: "Strawberries", category: "fruit", is_safe: false, is_try_bite: true },
  { name: "Hummus", category: "protein", is_safe: false, is_try_bite: true },
  { name: "Avocado", category: "vegetable", is_safe: false, is_try_bite: true },
  { name: "Turkey Slices", category: "protein", is_safe: false, is_try_bite: true },
];

/** Inner component that composes all domain contexts into a single AppContext for backward compatibility */
function AppContextComposer({ children }: { children: React.ReactNode }) {
  const { userId, householdId } = useAuth();
  const { foods, setFoods, addFood, updateFood, deleteFood, addFoods, updateFoods, deleteFoods, refreshFoods } = useFoods();
  const { kids, setKids, activeKidId, setActiveKidId, addKid, updateKid, deleteKid, setActiveKid, refreshKids } = useKids();
  const { recipes, setRecipes, addRecipe, updateRecipe, deleteRecipe, refreshRecipes } = useRecipes();
  const { planEntries, setPlanEntries, setPlanEntriesState, addPlanEntry, addPlanEntries, updatePlanEntry, copyWeekPlan, deleteWeekPlan } = usePlan();
  const { groceryItems, setGroceryItems, setGroceryItemsState, addGroceryItem, addGroceryItemsMerged, toggleGroceryItem, updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems } = useGrocery();
  // US-671: the ledger slices. Read-only here; nothing in the composer appends.
  const { movements, setMovements, itemStock, setItemStock, stockRows, ledgerReadsEnabled } = useInventory();

  // Tracks which (userId:householdId) scope has been loaded so the Supabase
  // sync runs once per scope, reloads when the household resolves/changes, and
  // can retry after a failure. A plain boolean here used to wedge: the effect
  // fires first with householdId=null (userId resolves before the household
  // RPC), and the second, correctly-scoped fire was skipped because the first
  // load was still in flight. Keying by scope fixes that.
  const loadedScopeRef = useRef<string | null>(null);

  // US-526 precedence guard: set true the moment the server-authoritative load
  // applies data. The mount cache-hydrate below reads storage asynchronously, so
  // if the server load resolves first, this flag stops the late cache hydrate
  // from overwriting fresh server data (which would resurrect a deleted /
  // cross-device-edited row — a violation of the US-341 precedence contract).
  const serverLoadAppliedRef = useRef(false);

  // Load from storage on mount (platform-aware)
  useEffect(() => {
    const loadData = async () => {
      try {
        const storage = await getStorage();
        const stored = await storage.getItem(STORAGE_KEY);
        // If the server load already won for this session, never apply the
        // (now-stale) cache — the server is authoritative once it answers.
        if (serverLoadAppliedRef.current) return;
        if (stored) {
          const data = JSON.parse(stored);
          setFoods(data.foods || []);
          setKids(data.kids || []);
          setRecipes(data.recipes || []);
          setActiveKidId(data.activeKidId || (data.kids?.[0]?.id ?? null));
          setPlanEntriesState(data.planEntries || []);
          setGroceryItemsState(data.groceryItems || []);
          // US-671: the ledger slices hydrate from the cache like every other
          // domain, so an offline pantry still has a balance to render.
          setMovements(parseMovementRows(data.movements || []));
          setItemStock(parseStockRows(data.itemStock || []));
        } else {
          const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
          setFoods(starterFoods);
          const defaultKid = { id: generateId(), name: "My Child", age: 5 };
          setKids([defaultKid]);
          setActiveKidId(defaultKid.id);
        }
      } catch (error) {
        logger.error("Error loading data from storage:", error);
        // Same precedence guard: don't seed starter data over server data.
        if (serverLoadAppliedRef.current) return;
        const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
        setFoods(starterFoods);
        const defaultKid = { id: generateId(), name: "My Child", age: 5 };
        setKids([defaultKid]);
        setActiveKidId(defaultKid.id);
      }
    };
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to storage whenever data changes (platform-aware, debounced).
  // US-537: a cancelable timer (not the fire-and-forget utils debounce) so a
  // pending save carrying child PII can be cancelled on sign-out and never
  // re-writes the cache after it has been scrubbed.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signedOutRef = useRef(false);
  // Don't persist an all-empty snapshot before anything has loaded — that would
  // clobber a valid cache backup before the server responds (US-537).
  const hydratedRef = useRef(false);

  const persistSnapshot = useCallback((snapshot: Record<string, unknown>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (signedOutRef.current) return;
    saveTimerRef.current = setTimeout(async () => {
      if (signedOutRef.current) return; // scrubbed since we were scheduled
      try {
        const storage = await getStorage();
        // Minimize sensitive child PII in the plaintext web cache.
        await storage.setItem(STORAGE_KEY, JSON.stringify(redactSnapshotForCache(snapshot)));
      } catch (error) {
        logger.error("Error saving data to storage:", error);
      }
    }, 500);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      const isEmpty =
        foods.length === 0 && kids.length === 0 && recipes.length === 0 &&
        planEntries.length === 0 && groceryItems.length === 0 &&
        movements.length === 0 && itemStock.length === 0;
      if (isEmpty) return; // nothing loaded yet — don't overwrite the cache
      hydratedRef.current = true;
    }
    persistSnapshot({ foods, kids, recipes, activeKidId, planEntries, groceryItems, movements, itemStock });
  }, [foods, kids, recipes, activeKidId, planEntries, groceryItems, movements, itemStock, persistSnapshot]);

  // Sync with Supabase when authenticated.
  //
  // US-341 load precedence (see CLAUDE.md "Load Precedence"): this load is
  // SERVER-AUTHORITATIVE. A successful fetch OVERWRITES each domain slice
  // wholesale (setFoods(serverData), setKids(...), ...) rather than merging the
  // localStorage cache back in, so a stale local backup can never resurrect a
  // row another device edited or deleted. The cache (loaded above on mount) is
  // only an offline-fallback / instant-paint source; once the server answers it
  // wins. Realtime events are then merged by id via the applyXRealtime helpers.
  //
  // Gate on householdId: `ensure_user_household` guarantees every signed-in
  // user resolves to a household, so a null here is only the brief window
  // before that RPC returns. Waiting for it avoids running the unscoped
  // queries (which can pull the wrong/no rows) and prevents that first load
  // from clobbering the correctly-scoped one.
  useEffect(() => {
    if (!userId || !householdId) return;
    // A new authenticated session — re-enable cache persistence disabled on a
    // prior sign-out (US-537).
    signedOutRef.current = false;
    const scope = `${userId}:${householdId}`;
    if (loadedScopeRef.current === scope) return;
    const prevUserId = loadedScopeRef.current?.split(':')[0] ?? null;
    loadedScopeRef.current = scope;

    // US-538 leak guard: if a DIFFERENT user resolves on this device without an
    // intervening SIGNED_OUT event (account switch, token change), clear the
    // previous user's in-memory data before loading the new user's. Foods/kids/
    // recipes/grocery are overwritten wholesale below, but plan entries are
    // MERGED with `prev` (mergeWindowedPlanEntries, to preserve out-of-window
    // history), so without this clear user A's out-of-window entries would leak
    // into user B's calendar. The awaited network load below runs after these
    // state resets flush, so the merge sees an empty `prev`.
    if (prevUserId && prevUserId !== userId) {
      setFoods([]);
      setKids([]);
      setRecipes([]);
      setActiveKidId(null);
      setPlanEntriesState([]);
      setGroceryItemsState([]);
      setMovements([]);
      setItemStock([]);
    }

    const loadUserData = async (retried = false): Promise<void> => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

        // US-550: this effect is gated on householdId above, so every query is
        // always household-scoped (the previous unscoped ternary branches were
        // dead code that relied solely on RLS).
        // US-671: movements are WINDOWED like plan entries, for the same
        // reason: an append-only log grows forever and a client does not need
        // all of it. item_stock is NOT windowed: it is one row per item and it
        // is the balance, so a partial fetch of it would be a wrong pantry.
        const movementWindowStart = new Date();
        movementWindowStart.setDate(movementWindowStart.getDate() - MOVEMENT_WINDOW_DAYS);

        const [kidsRes, foodsRes, recipesRes, planRes, groceryRes, movementsRes, stockRes] = await Promise.all([
          supabase.from('kids').select('*').eq('household_id', householdId).order('created_at', { ascending: true }),
          supabase.from('foods').select('*').eq('household_id', householdId).order('name', { ascending: true }).limit(500),
          // US-323: degrade to a plain select if the recipe_ingredients embed
          // isn't deployed in this environment, so recipes still load.
          selectRecipesWithFallback((sel) => supabase.from('recipes').select(sel).eq('household_id', householdId).order('created_at', { ascending: true }).limit(200)),
          supabase.from('plan_entries').select('*').eq('household_id', householdId)
            .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
            .lte('date', ninetyDaysFromNow.toISOString().split('T')[0])
            .order('date', { ascending: true }),
          supabase.from('grocery_items').select('*').eq('household_id', householdId).order('created_at', { ascending: true }).limit(500),
          supabase.from('inventory_movements').select('*').eq('household_id', householdId)
            .gte('occurred_at', movementWindowStart.toISOString())
            .order('occurred_at', { ascending: true })
            .limit(MOVEMENT_LIMIT),
          supabase.from('item_stock').select('*').eq('household_id', householdId)
        ]);

        // US-316: expired-JWT / 401 / PGRST301 come back as result.error (not
        // thrown), so without this an expired token silently renders an empty
        // app. Detect it on any read, refresh once, then retry or redirect.
        const firstError = [kidsRes, foodsRes, recipesRes, planRes, groceryRes, movementsRes, stockRes]
          .find(r => r.error)?.error;
        if (firstError) {
          const outcome = await handleSupabaseAuthError(firstError);
          if (outcome === 'refreshed' && !retried) {
            loadedScopeRef.current = scope;
            return loadUserData(true);
          }
          if (outcome !== 'not-auth-error') {
            // 'redirected' (or retry exhausted) — heading to /auth. Don't apply
            // the empty/partial data; leave the scope clear so a fresh session
            // reloads cleanly.
            loadedScopeRef.current = null;
            return;
          }
          // A non-auth error on one read — log it and still apply whatever
          // other reads succeeded (best-effort, matches prior behaviour).
          logger.error('Error loading user data from Supabase:', firstError);
        }

        // US-526: from here the server-authoritative load is applying its
        // slices. Mark it so a late mount cache-hydrate cannot overwrite them.
        serverLoadAppliedRef.current = true;

        if (kidsRes.data) {
          // US-333: normalize on load so the shape matches the realtime path.
          const loadedKids = parseKidRows(kidsRes.data as unknown[]);
          setKids(loadedKids);
          // Preserve a still-valid selection; otherwise default to the first
          // kid. Hard-resetting to null left the app with no child selected
          // after every sign-in, so calendar/dashboard/coach rendered empty.
          setActiveKidId((prev) =>
            prev && loadedKids.some((k) => k.id === prev)
              ? prev
              : (loadedKids[0]?.id ?? null)
          );
        }
        if (foodsRes.data) setFoods(parseFoodRows(foodsRes.data as unknown[]));
        if (recipesRes.data) {
          const dbRecipes = parseRecipeRows(recipesRes.data as unknown[]);
          // Check for local recipes and migrate them. Use the platform-aware
          // storage (not raw localStorage, which is undefined on React Native
          // and would throw here, aborting the whole sync).
          const migrationStorage = await getStorage();
          const localData = await migrationStorage.getItem(STORAGE_KEY);
          if (localData) {
            try {
              const parsed = JSON.parse(localData);
              const localRecipes: Recipe[] = parsed.recipes || [];
              // US-527/US-549: detect local-only recipes by SERVER PRESENCE, not
              // id shape (generateId now returns a UUID, so shape can't tell a
              // local id from a server id). Compare against the loaded page
              // first; only if some local recipe is missing there do we fetch
              // the COMPLETE server id set — so a recipe beyond the 200-row page
              // isn't mis-migrated as a duplicate.
              const pageIds = new Set(dbRecipes.map((r) => r.id));
              const maybeLocal = localRecipes.filter((lr) => !pageIds.has(lr.id));
              let serverRecipeIds = pageIds;
              if (maybeLocal.length > 0) {
                const { data: allIdRows } = await supabase
                  .from('recipes')
                  .select('id')
                  .eq('household_id', householdId);
                serverRecipeIds = new Set((allIdRows as { id: string }[] | null ?? []).map((r) => r.id));
              }
              const localOnlyRecipes = selectLocalOnlyRecipes(localRecipes, serverRecipeIds);
              if (localOnlyRecipes.length > 0) {
                logger.debug(`Migrating ${localOnlyRecipes.length} local recipes to database...`);
                const bulkPayload = localOnlyRecipes.map((localRecipe: Recipe) => {
                  const { id: _id, ...recipeData } = localRecipe;
                  const dbPayload: Record<string, unknown> = {
                    name: recipeData.name, description: recipeData.description,
                    food_ids: recipeData.food_ids, category: recipeData.category,
                    instructions: recipeData.instructions ?? recipeData.tips,
                    prep_time: recipeData.prepTime, cook_time: recipeData.cookTime,
                    servings: recipeData.servings, user_id: userId,
                    household_id: householdId || undefined,
                  };
                  Object.keys(dbPayload).forEach((k) => {
                    if (dbPayload[k] === undefined) delete dbPayload[k];
                  });
                  return dbPayload;
                });
                await supabase.from('recipes').insert(bulkPayload);
                const { data: updatedRecipes } = await supabase
                  .from('recipes')
                  .select(RECIPE_WITH_INGREDIENTS_SELECT)
                  .order('created_at', { ascending: true });
                if (updatedRecipes) setRecipes(parseRecipeRows(updatedRecipes as unknown[]));
              } else {
                setRecipes(dbRecipes);
              }
            } catch (e) {
              logger.error('Error migrating recipes:', e);
              setRecipes(dbRecipes);
            }
          } else {
            setRecipes(dbRecipes);
          }
        }
        if (planRes.data) {
          // US-538: the plan_entries fetch is windowed (-30d..+90d). Merge it
          // with existing state so cached history OUTSIDE the window is not
          // truncated (and then persisted-away by the write-through cache). The
          // in-window slice remains server-authoritative.
          const windowStart = thirtyDaysAgo.toISOString().split('T')[0];
          const windowEnd = ninetyDaysFromNow.toISOString().split('T')[0];
          const serverEntries = parsePlanEntryRows(planRes.data as unknown[]);
          setPlanEntriesState((prev) => mergeWindowedPlanEntries(prev, serverEntries, windowStart, windowEnd));
        }
        if (groceryRes.data) setGroceryItemsState(parseGroceryItemRows(groceryRes.data as unknown[]));
        // US-671: server-authoritative, same as every slice above. Append-only
        // makes the wholesale overwrite trivially safe for movements: there is
        // no local edit to a movement that an overwrite could discard, because
        // a movement is never edited.
        // Normalized on the way in, like every other slice: delta and
        // on_hand_canonical are NUMERIC and do not arrive as JS numbers on
        // every path.
        if (movementsRes.data) setMovements(parseMovementRows(movementsRes.data as unknown[]));
        if (stockRes.data) setItemStock(parseStockRows(stockRes.data as unknown[]));
      } catch (error) {
        // Don't leave the scope marked as loaded if it failed — clear it so
        // the next render retries instead of showing a permanently empty app.
        loadedScopeRef.current = null;
        // US-316: a thrown auth error (e.g. from the recipe-migration writes)
        // gets the same refresh-once-then-retry/redirect treatment.
        const outcome = await handleSupabaseAuthError(error);
        if (outcome === 'refreshed' && !retried) {
          loadedScopeRef.current = scope;
          return loadUserData(true);
        }
        if (outcome === 'not-auth-error') {
          logger.error('Error loading user data from Supabase:', error);
        }
      }
    };

    loadUserData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, householdId]);

  // Clear all app data on sign-out so the next user on this device (or the
  // same browser) never inherits the previous user's children, foods, or
  // meal plans. Without this, the persisted blob and in-memory state survive
  // sign-out and flash in / re-hydrate for whoever signs in next.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return;
      loadedScopeRef.current = null;
      serverLoadAppliedRef.current = false;
      // US-537: block + cancel any pending debounced save so it can't re-write
      // the cache (with child PII) after we scrub it below.
      signedOutRef.current = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setFoods([]);
      setKids([]);
      setRecipes([]);
      setActiveKidId(null);
      setPlanEntriesState([]);
      setGroceryItemsState([]);
      setMovements([]);
      setItemStock([]);
      getStorage()
        .then((storage) => storage.removeItem(STORAGE_KEY))
        .catch((error) => logger.error('Error clearing storage on sign-out:', error));
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // US-785: write one comparison sample per DISTINCT observation.
  //
  // The effect below re-runs on every realtime event and every pantry edit, so
  // inserting unconditionally would bill a household's noise as evidence and
  // bury the moment something actually changed. The signature covers the
  // counts, not the per-item detail or the time, because two runs disagreeing
  // about the same items in the same way are one observation.
  //
  // Failure is swallowed on purpose. This is instrumentation for a release
  // decision; it must never surface an error to a parent or interrupt a load.
  const lastSampleSignature = useRef<string | null>(null);
  const recordComparisonSample = useCallback((sample: StockComparisonSample) => {
    const signature = sampleSignature(sample);
    if (lastSampleSignature.current === signature) return;
    lastSampleSignature.current = signature;

    void supabase
      .from('stock_comparison_samples')
      .insert(sample)
      .then(({ error }) => {
        if (error) logger.warn('US-785: could not record comparison sample', { error });
      });
  }, []);

  // US-671 dark launch: with the flag OFF, check the ledger against the legacy
  // column and log what disagrees. This is the evidence the flag flip is
  // supposed to wait for ("compare, and flip only when they agree"), and it
  // deliberately changes nothing a parent sees.
  //
  // Debounced, because both inputs change on every realtime event and on every
  // pantry edit, and the interesting signal is the settled state rather than
  // each intermediate one.
  useEffect(() => {
    if (ledgerReadsEnabled) return; // the comparison is what precedes the flip
    if (foods.length === 0) return;

    const timer = setTimeout(() => {
      // No balances at all is one fact about the household, not one fact per
      // item. Before the US-669 backfill reaches a household every food would
      // otherwise report 'missing_stock_row', and 50 lines saying the same
      // thing is how the first real mismatch gets missed.
      if (stockRows.length === 0) {
        logger.warn('US-671 ledger comparison: no item_stock rows for this household', {
          householdId,
          items: foods.length,
        });
        return;
      }

      // `foods` carries the catalog columns the comparison reads
      // (canonical_unit, unit_conversions, density_g_per_ml): they ride along
      // through normalizeFoodFromDB's row spread but are not on the `Food`
      // interface yet, so the shape is widened here rather than narrowed.
      const divergences = compareLedgerToLegacy(stockRows, foods as ComparableItem[]);
      const summary = summarizeDivergences(divergences);
      if (summary.total === 0) {
        // US-785: a run that AGREES is the numerator of the agreement rate.
        // Returning silently here would record only the failures, and a rate
        // computed from failures alone is not a rate.
        recordComparisonSample(
          buildStockComparisonSample({
            householdId,
            itemCount: foods.length,
            stockRowCount: stockRows.length,
            divergences,
            summary,
            appVersion: import.meta.env.VITE_APP_VERSION || null,
          })
        );
        return;
      }

      logger.warn('US-671 ledger comparison: ledger and foods.quantity disagree', {
        householdId,
        items: foods.length,
        stockRows: stockRows.length,
        ...summary,
      });

      // Capped rather than unbounded: a household that has not been backfilled
      // yet diverges on every row, and 500 log lines would bury the first real
      // mismatch that appears after it HAS been backfilled.
      for (const d of divergences.slice(0, LEDGER_DIVERGENCE_LOG_LIMIT)) {
        logger.warn(`US-671 divergence [${d.kind}] item ${d.itemId}`, {
          itemId: d.itemId,
          ledgerValue: d.ledgerValue,
          legacyValue: d.legacyValue,
          canonicalUnit: d.canonicalUnit,
          displayUnit: d.displayUnit,
          detail: d.detail,
        });
      }
      if (divergences.length > LEDGER_DIVERGENCE_LOG_LIMIT) {
        logger.warn(
          `US-671 divergence: ${divergences.length - LEDGER_DIVERGENCE_LOG_LIMIT} further divergences not logged`
        );
      }

      // US-785: the logs above are Sentry breadcrumbs, and a breadcrumb only
      // transmits attached to a captured error -- so on a household where
      // nothing crashes this comparison disagreed with itself and told nobody.
      // Record it where it can be counted. The flag flip in US-739 is gated on
      // an agreement rate that cannot otherwise be measured.
      recordComparisonSample(
        buildStockComparisonSample({
          householdId,
          itemCount: foods.length,
          stockRowCount: stockRows.length,
          divergences,
          summary,
          appVersion: import.meta.env.VITE_APP_VERSION || null,
        })
      );
    }, LEDGER_COMPARISON_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [ledgerReadsEnabled, stockRows, foods, householdId, recordComparisonSample]);

  // US-331: keep a ref of the latest snapshot so exportData has a stable
  // identity instead of a new reference on every data change. Without this the
  // callback (and therefore the merged context value) churned on every edit.
  const snapshotRef = useRef({ foods, kids, recipes, activeKidId, planEntries, groceryItems });
  snapshotRef.current = { foods, kids, recipes, activeKidId, planEntries, groceryItems };

  const exportData = useCallback(() => {
    return JSON.stringify(snapshotRef.current, null, 2);
  }, []);

  const importData = useCallback((jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (data.foods) setFoods(data.foods);
      if (data.kids) setKids(data.kids);
      if (data.recipes) setRecipes(data.recipes);
      if (data.activeKidId) setActiveKidId(data.activeKidId);
      if (data.planEntries) setPlanEntriesState(data.planEntries);
      if (data.groceryItems) setGroceryItemsState(data.groceryItems);
    } catch {
      throw new Error("Invalid JSON data");
    }
  }, [setFoods, setKids, setRecipes, setActiveKidId, setPlanEntriesState, setGroceryItemsState]);

  const resetAllData = useCallback(() => {
    const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
    setFoods(starterFoods);
    const defaultKid = { id: generateId(), name: "My Child", age: 5 };
    setKids([defaultKid]);
    setActiveKidId(defaultKid.id);
    setPlanEntriesState([]);
    setGroceryItemsState([]);
  }, [setFoods, setKids, setActiveKidId, setPlanEntriesState, setGroceryItemsState]);

  const value = useMemo<AppContextType>(() => ({
    foods, kids, recipes, activeKidId, planEntries, groceryItems,
    addFood, updateFood, deleteFood,
    addKid, updateKid, deleteKid, setActiveKid, setActiveKidId,
    addRecipe, updateRecipe, deleteRecipe,
    setPlanEntries, addPlanEntry, addPlanEntries, updatePlanEntry,
    setGroceryItems, addGroceryItem, addGroceryItemsMerged, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems,
    exportData, importData, resetAllData,
    addFoods, updateFoods, deleteFoods,
    copyWeekPlan, deleteWeekPlan,
    refreshFoods, refreshRecipes, refreshKids,
  }), [
    foods, kids, recipes, activeKidId, planEntries, groceryItems,
    addFood, updateFood, deleteFood,
    addKid, updateKid, deleteKid, setActiveKid, setActiveKidId,
    addRecipe, updateRecipe, deleteRecipe,
    setPlanEntries, addPlanEntry, addPlanEntries, updatePlanEntry,
    setGroceryItems, addGroceryItem, addGroceryItemsMerged, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems,
    exportData, importData, resetAllData,
    addFoods, updateFoods, deleteFoods,
    copyWeekPlan, deleteWeekPlan,
    refreshFoods, refreshRecipes, refreshKids,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FoodsProvider>
        <KidsProvider>
          <RecipesProvider>
            <PlanProvider>
              <GroceryProvider>
                <InventoryProvider>
                  <AppContextComposer>
                    {children}
                  </AppContextComposer>
                </InventoryProvider>
              </GroceryProvider>
            </PlanProvider>
          </RecipesProvider>
        </KidsProvider>
      </FoodsProvider>
    </AuthProvider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}

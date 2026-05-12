/**
 * US-303: Web ingredient resolver.
 *
 * Maps free-text ingredient names ("tomatoes", "Roma Tomato", "extra-virgin
 * olive oil") to canonical `ingredients.id` from the US-302 catalog. Used
 * by AppContext create/update paths for `foods` (pantry), `recipe_ingredients`,
 * and `grocery_items` to populate the new nullable `ingredient_id` FK
 * alongside the legacy name field.
 *
 * Resolution order:
 *   1. Exact slug match  (input -> slugify -> ingredients.slug)
 *      Also tries the singularized form so "tomatoes" -> "tomato" hits.
 *   2. Exact alias match (case-insensitive ilike against ingredient_aliases.alias)
 *      Includes the singularized form too.
 *   3. Fuzzy match       (Sorensen-Dice on bigrams of name + slug across the
 *      cached ingredients list, threshold = confidenceFloor)
 *   4. Miss              -> insert into ingredient_aliases with
 *      source=user, confidence=0, ingredient_id=NULL  (pending admin curation
 *      via US-306) and return null.
 *
 * Ambiguity rule:
 *   Multiple high-confidence aliases pointing to DIFFERENT ingredient_ids
 *   returns null - the resolver refuses to pick an arbitrary winner. The
 *   raw name is queued so admin can disambiguate.
 *
 * Cache:
 *   `ingredients` rarely changes (admin-managed). We cache the full list in
 *   memory on first call - it's ~250 rows. `ingredient_aliases` is high-
 *   churn (the queue path writes on every miss) so we query it live.
 *
 * Until types.ts regen lands, `ingredients` and `ingredient_aliases` are
 * unknown to the generated Database type. The resolver isolates the
 * un-typed `client.from(...)` calls inside small helpers so the rest of
 * the module is properly typed.
 */
import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface ResolveResult {
  id: string;
  confidence: number;
  source: 'slug' | 'alias' | 'fuzzy';
}

export type TelemetryEvent =
  | { kind: 'hit'; source: ResolveResult['source']; confidence: number }
  | { kind: 'miss'; rawName: string; reason: 'no-match' | 'ambiguous' | 'empty-input' };

export type TelemetryHook = (ev: TelemetryEvent) => void;

export interface ResolveOptions {
  /** Minimum confidence to accept an alias or fuzzy match (0..1). Default 0.7. */
  confidenceFloor?: number;
  /** Disable the miss-queue alias insert. Default true (always queue). */
  queuePendingAlias?: boolean;
  /** Per-call telemetry hook. Overrides the resolver-instance default. */
  onTelemetry?: TelemetryHook;
}

export interface IngredientResolver {
  resolve(name: string, opts?: ResolveOptions): Promise<ResolveResult | null>;
  /** Drop the in-memory ingredients cache - next resolve will reload. */
  invalidateCache(): void;
  /** Force-load the cache (useful at app boot to avoid first-call latency). */
  warmCache(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------
interface IngredientRow {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  default_unit: string | null;
}

interface AliasRow {
  ingredient_id: string | null;
  confidence: number;
}

interface IngredientCache {
  bySlug: Map<string, IngredientRow>;
  byNameLower: Map<string, IngredientRow>;
  all: IngredientRow[];
}

/**
 * Loose client shape. We only need `from(...)`; once
 * src/integrations/supabase/types.ts regenerates to include the US-302
 * tables, we can narrow this to `SupabaseClient<Database>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = { from: (table: string) => any };

const DEFAULT_FLOOR = 0.7;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createIngredientResolver(
  client: SupabaseLike,
  resolverTelemetry?: TelemetryHook,
): IngredientResolver {
  let cache: IngredientCache | null = null;
  let pendingLoad: Promise<IngredientCache> | null = null;

  async function loadCache(): Promise<IngredientCache> {
    const result = await client
      .from('ingredients')
      .select('id, name, slug, category, default_unit');
    if (result.error) {
      throw new Error(`ingredientResolver: load failed: ${result.error.message ?? 'unknown'}`);
    }
    const rows: IngredientRow[] = (result.data ?? []) as IngredientRow[];
    const next: IngredientCache = {
      bySlug: new Map(),
      byNameLower: new Map(),
      all: rows,
    };
    for (const r of rows) {
      next.bySlug.set(r.slug, r);
      next.byNameLower.set(r.name.toLowerCase(), r);
    }
    return next;
  }

  async function ensureCache(): Promise<IngredientCache> {
    if (cache) return cache;
    if (!pendingLoad) {
      pendingLoad = loadCache().then((c) => {
        cache = c;
        pendingLoad = null;
        return c;
      });
    }
    return pendingLoad;
  }

  /**
   * Case-insensitive alias lookup. Returns ALL matches (so we can detect
   * ambiguity) - the caller filters by confidence and picks a winner.
   */
  async function findAliases(alias: string): Promise<AliasRow[]> {
    // ilike with no wildcards = case-insensitive exact match.
    const result = await client
      .from('ingredient_aliases')
      .select('ingredient_id, confidence')
      .ilike('alias', alias)
      .not('ingredient_id', 'is', null)
      .order('confidence', { ascending: false });
    if (result.error) {
      // Alias miss is not fatal - log and continue with empty result.
      console.warn('[ingredientResolver] alias query failed:', result.error.message ?? result.error);
      return [];
    }
    return (result.data ?? []) as AliasRow[];
  }

  async function queuePending(rawName: string): Promise<void> {
    const result = await client.from('ingredient_aliases').insert({
      alias: rawName,
      source: 'user',
      confidence: 0,
      ingredient_id: null,
    });
    if (result.error) {
      // Queueing is best-effort - a duplicate insert or an offline write
      // shouldn't break the user-facing flow.
      console.warn('[ingredientResolver] pending-alias queue failed:', result.error.message ?? result.error);
    }
  }

  function emit(ev: TelemetryEvent, opts?: ResolveOptions) {
    const hook = opts?.onTelemetry ?? resolverTelemetry;
    if (hook) {
      try { hook(ev); } catch (err) {
        // Telemetry must never throw into the caller.
        console.warn('[ingredientResolver] telemetry hook threw:', err);
      }
    }
  }

  async function resolve(
    rawInput: string,
    opts?: ResolveOptions,
  ): Promise<ResolveResult | null> {
    const trimmed = (rawInput ?? '').trim();
    if (!trimmed) {
      emit({ kind: 'miss', rawName: rawInput ?? '', reason: 'empty-input' }, opts);
      return null;
    }

    const floor = opts?.confidenceFloor ?? DEFAULT_FLOOR;
    const lower = trimmed.toLowerCase();
    const singular = singularize(lower);
    const slugOrig = slugify(lower);
    const slugSing = slugify(singular);

    const cacheNow = await ensureCache();

    // 1. Exact slug match (original or singularized).
    const slugHit =
      cacheNow.bySlug.get(slugOrig) ??
      (slugSing !== slugOrig ? cacheNow.bySlug.get(slugSing) : undefined);
    if (slugHit) {
      const result: ResolveResult = { id: slugHit.id, confidence: 1.0, source: 'slug' };
      emit({ kind: 'hit', source: 'slug', confidence: 1.0 }, opts);
      return result;
    }

    // Also try exact lowercased-name match against the cache (cheap).
    const nameHit =
      cacheNow.byNameLower.get(lower) ??
      (singular !== lower ? cacheNow.byNameLower.get(singular) : undefined);
    if (nameHit) {
      const result: ResolveResult = { id: nameHit.id, confidence: 1.0, source: 'slug' };
      emit({ kind: 'hit', source: 'slug', confidence: 1.0 }, opts);
      return result;
    }

    // 2. Alias match.
    const aliasesOrig = await findAliases(trimmed);
    const aliasesSing = singular !== lower ? await findAliases(singular) : [];
    const merged = [...aliasesOrig, ...aliasesSing];
    if (merged.length > 0) {
      const high = merged.filter(
        (a): a is AliasRow & { ingredient_id: string } =>
          a.ingredient_id !== null && a.confidence >= floor,
      );
      const distinctHigh = new Set(high.map((a) => a.ingredient_id));
      if (distinctHigh.size > 1) {
        // Ambiguous - multiple ingredients above floor. Refuse to guess.
        emit({ kind: 'miss', rawName: trimmed, reason: 'ambiguous' }, opts);
        if (opts?.queuePendingAlias !== false) await queuePending(trimmed);
        return null;
      }
      if (distinctHigh.size === 1) {
        const winner = high[0];
        const result: ResolveResult = {
          id: winner.ingredient_id,
          confidence: winner.confidence,
          source: 'alias',
        };
        emit({ kind: 'hit', source: 'alias', confidence: winner.confidence }, opts);
        return result;
      }
      // No alias rows above floor; fall through to fuzzy.
    }

    // 3. Fuzzy match against catalog (Sorensen-Dice on bigrams).
    const fuzzy = bestFuzzy(cacheNow.all, lower, singular);
    if (fuzzy.score >= floor && fuzzy.row) {
      const result: ResolveResult = {
        id: fuzzy.row.id,
        confidence: round2(fuzzy.score),
        source: 'fuzzy',
      };
      emit({ kind: 'hit', source: 'fuzzy', confidence: result.confidence }, opts);
      return result;
    }

    // 4. Miss - queue for admin curation.
    if (opts?.queuePendingAlias !== false) await queuePending(trimmed);
    emit({ kind: 'miss', rawName: trimmed, reason: 'no-match' }, opts);
    return null;
  }

  return {
    resolve,
    invalidateCache() {
      cache = null;
      pendingLoad = null;
    },
    async warmCache() {
      cache = await loadCache();
    },
  };
}

// ---------------------------------------------------------------------------
// Default resolver bound to the production supabase client.
// ---------------------------------------------------------------------------
export const defaultIngredientResolver = createIngredientResolver(
  supabase as unknown as SupabaseLike,
  defaultTelemetry,
);

/** Convenience wrapper - calls the default resolver. */
export function resolveIngredient(
  name: string,
  opts?: ResolveOptions,
): Promise<ResolveResult | null> {
  return defaultIngredientResolver.resolve(name, opts);
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** kebab-case, alnum-only. Matches the seed slug shape from US-302. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Best-effort English singularization for resolver lookups. Conservative:
 * if we're unsure, return the input unchanged. False positives here just
 * mean an extra catalog miss; false negatives are silent.
 */
export function singularize(s: string): string {
  if (s.length < 2) return s;
  // Common irregulars first - keep this list short and focused on food.
  const irregulars: Record<string, string> = {
    leaves: 'leaf',
    loaves: 'loaf',
    halves: 'half',
    knives: 'knife',
    wolves: 'wolf',
    geese: 'goose',
    teeth: 'tooth',
    feet: 'foot',
    mice: 'mouse',
    children: 'child',
  };
  if (irregulars[s]) return irregulars[s];
  if (s.endsWith('ies') && s.length > 3) return s.slice(0, -3) + 'y';
  if (/(ch|sh|x|z|ss)es$/.test(s)) return s.slice(0, -2);
  if (s.endsWith('ses') && s.length > 3) return s.slice(0, -2);
  // Preserve Latin-ish singulars (asparagus, octopus, analysis, basis, etc.) -
  // they look plural but aren't. Conservative: skip `-us`, `-is`, `-os` words.
  if (/(us|is|os)$/.test(s)) return s;
  if (s.endsWith('s') && !s.endsWith('ss') && s.length > 1) return s.slice(0, -1);
  return s;
}

// ---------------------------------------------------------------------------
// Fuzzy matching (Sorensen-Dice on character bigrams)
// ---------------------------------------------------------------------------

function bigrams(s: string): string[] {
  const n = s.replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  for (let i = 0; i < n.length - 1; i++) {
    out.push(n.slice(i, i + 2));
  }
  return out;
}

export function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  // Multiset intersection.
  const bCount = new Map<string, number>();
  for (const g of B) bCount.set(g, (bCount.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of A) {
    const c = bCount.get(g) ?? 0;
    if (c > 0) {
      inter++;
      bCount.set(g, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

interface FuzzyHit {
  row: IngredientRow | null;
  score: number;
}

function bestFuzzy(catalog: IngredientRow[], lower: string, singular: string): FuzzyHit {
  let best: FuzzyHit = { row: null, score: 0 };
  for (const row of catalog) {
    const slugScore = Math.max(
      diceCoefficient(lower, row.slug.replace(/-/g, ' ')),
      diceCoefficient(singular, row.slug.replace(/-/g, ' ')),
    );
    const nameScore = Math.max(
      diceCoefficient(lower, row.name.toLowerCase()),
      diceCoefficient(singular, row.name.toLowerCase()),
    );
    const score = Math.max(slugScore, nameScore);
    if (score > best.score) {
      best = { row, score };
    }
  }
  return best;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Default telemetry stub - logs in dev, no-op in prod. Real telemetry
// integration is a separate plumbing task; this hook is the seam.
// ---------------------------------------------------------------------------
function defaultTelemetry(ev: TelemetryEvent): void {
  if (import.meta.env.DEV) {
    if (ev.kind === 'hit') {
      console.debug('[ingredientResolver] hit', ev.source, ev.confidence);
    } else {
      console.debug('[ingredientResolver] miss', ev.rawName, ev.reason);
    }
  }
}

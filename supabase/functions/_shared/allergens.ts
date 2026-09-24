/**
 * One allergen comparison for the web planner and the edge functions.
 *
 * Kid allergens come from the profile pickers ("peanuts", "tree nuts"). Food
 * allergens come from manual entry, USDA, OpenFoodFacts ("en:peanuts") and the
 * shared catalog, so the same allergen arrives as "Peanuts", "peanut",
 * "en:tree-nuts" or "tree_nuts". An exact string compare let every one of those
 * variants through, which is how a plan generator could schedule a child's
 * allergen. Both sides go through normalizeAllergen and the synonym map
 * (canonicalAllergen) before comparing.
 *
 * Pure TypeScript with no Deno or browser imports: the web app re-exports it
 * from src/lib/allergens.ts and vitest covers it there.
 */

/** Lowercase, drop a language prefix ("en:"), unify separators, singularize. */
export function normalizeAllergen(value: unknown): string {
  const s = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]{2}:/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "peanuts" -> "peanut", "tree nuts" -> "tree nut", "eggs" -> "egg".
  // "shellfish" and "fish" end in "h"; "sesame", "soy", "milk" are unaffected.
  return singularize(s);
}

/**
 * The plural rules an allergen list needs: "strawberries" -> "strawberry",
 * "tomatoes" -> "tomato", "peaches" -> "peach", then a bare trailing "s".
 * Only the last word of a phrase is touched.
 */
function singularize(s: string): string {
  if (s.length > 4 && s.endsWith('ies')) return `${s.slice(0, -3)}y`;
  if (s.length > 4 && s.endsWith('oes')) return s.slice(0, -2);
  if (s.length > 5 && (s.endsWith('ches') || s.endsWith('shes'))) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
  return s;
}

/**
 * Spellings that name the same allergen once normalized. The kid pickers store
 * the left-hand canonical word ("sesame", "soy", "tree nut"), while
 * OpenFoodFacts tags the same thing "en:sesame-seeds", "en:soybeans" or
 * "en:nuts", and a parent typing by hand writes "dairy" or "gluten". Without
 * this map every one of those was a miss, which is a food the child reacts to
 * reading as safe.
 *
 * Only synonyms that are unambiguous for an allergy check belong here. "nut"
 * maps to "tree nut" because OpenFoodFacts' "en:nuts" is the tree-nut tag;
 * peanut stays separate. Gluten maps to wheat because wheat is the picker
 * value; a child with a barley-only reaction still needs "barley" entered.
 */
const ALLERGEN_SYNONYMS: Readonly<Record<string, string>> = {
  'sesame seed': 'sesame',
  soybean: 'soy',
  soya: 'soy',
  gluten: 'wheat',
  nut: 'tree nut',
  crustacean: 'shellfish',
  mollusc: 'shellfish',
  mollusk: 'shellfish',
  dairy: 'milk',
  lactose: 'milk',
};

/** normalizeAllergen, then fold known synonyms onto the picker's word. */
export function canonicalAllergen(value: unknown): string {
  const n = normalizeAllergen(value);
  return ALLERGEN_SYNONYMS[n] ?? n;
}

/**
 * Allergen families (item 28). A child allergic to "tree nuts" reacts to an
 * almond, so a food tagged "almonds" (OpenFoodFacts "en:almonds") has to read
 * as a tree-nut hit. The map runs one way only: the family catches its
 * members, but a child with an "almond" allergy is not flagged for every tree
 * nut, because that is not what the parent recorded.
 *
 * Keys are canonical kid-side words; members are written the way
 * normalizeAllergen leaves them (singular, lowercase), and are normalized
 * again when the lookup is built so a plural slip here cannot break a match.
 *
 * Deliberately left out, pending an owner decision:
 *  - coconut: the FDA listed it as a tree nut until 2025, most allergists do
 *    not, and many tree-nut-allergic children eat it. Not a member.
 *  - pine nut: botanically a seed. Not a member, though a food NAMED
 *    "pine nuts" still hits through the bare word "nut" (see TEXT_TERMS).
 *  - barley, rye, oats for gluten: gluten folds onto wheat (the picker value)
 *    and a barley reaction still has to be entered as "barley".
 * Chestnut is a member (it is a true tree nut); water chestnut, a vegetable,
 * is guarded against in the name scan below.
 */
const ALLERGEN_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  'tree nut': [
    'almond',
    'cashew',
    'walnut',
    'pecan',
    'pistachio',
    'hazelnut',
    'filbert',
    'macadamia',
    'brazil nut',
    'chestnut',
    'marzipan',
    'praline',
  ],
  shellfish: [
    'shrimp',
    'crab',
    'lobster',
    'prawn',
    'crayfish',
    'crawfish',
    'langoustine',
    'scallop',
    'clam',
    'mussel',
    'oyster',
    'squid',
    'calamari',
    'octopus',
  ],
  fish: [
    'salmon',
    'tuna',
    'cod',
    'tilapia',
    'trout',
    'halibut',
    'haddock',
    'pollock',
    'sardine',
    'anchovy',
    'anchovie',
    'mackerel',
    'catfish',
    'snapper',
    'swordfish',
    'herring',
    'flounder',
    'mahi mahi',
    'sea bass',
    'whitefish',
  ],
  milk: [
    'cheese',
    'butter',
    'buttermilk',
    'yogurt',
    'yoghurt',
    'cream',
    'whey',
    'casein',
    'caseinate',
    'ghee',
    'kefir',
    'mozzarella',
    'cheddar',
    'parmesan',
    'ricotta',
    'feta',
  ],
  wheat: [
    'spelt',
    'semolina',
    'durum',
    'farina',
    'farro',
    'kamut',
    'einkorn',
    'emmer',
    'bulgur',
    'couscous',
    'seitan',
    'triticale',
  ],
  egg: ['egg white', 'egg yolk', 'meringue', 'mayonnaise'],
  soy: ['tofu', 'edamame', 'tempeh', 'miso'],
  sesame: ['tahini'],
};

/** normalized member -> family key. */
const FAMILY_OF: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const [family, members] of Object.entries(ALLERGEN_FAMILIES)) {
    for (const m of members) out.set(normalizeAllergen(m), family);
  }
  return out;
})();

/** The family a food-side allergen belongs to ("almond" -> "tree nut"), or null. */
export function allergenFamilyOf(value: unknown): string | null {
  return FAMILY_OF.get(canonicalAllergen(value)) ?? null;
}

/** The members a family catches, for tests and labels. Empty for a non-family. */
export function allergenFamilyMembers(family: unknown): readonly string[] {
  return ALLERGEN_FAMILIES[canonicalAllergen(family)] ?? [];
}

/**
 * Does the food-side allergen `value` hit the kid-side canonical key `kidKey`?
 * Direct (after synonyms) or through the food allergen's family.
 */
function hitsKey(foodCanonical: string, kid: ReadonlySet<string>): string | null {
  if (kid.has(foodCanonical)) return foodCanonical;
  const family = FAMILY_OF.get(foodCanonical);
  if (family && kid.has(family)) return family;
  return null;
}

// ---------------------------------------------------------------------------
// Free-text scan: food names, and allergen tags written as phrases.
// ---------------------------------------------------------------------------

/** Lowercase letters only, split to words, each singularized like normalizeAllergen. */
function tokenize(text: unknown): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/^[a-z]{2}:/, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(singularize);
}

interface TextTerm {
  words: readonly string[];
  /** The canonical allergen the phrase names (kid-side key it can hit). */
  key: string;
  /** Skip when the phrase is preceded by one of these words or phrases. */
  notAfter?: readonly string[];
  /** Skip when the phrase is followed by one of these words or phrases. */
  notBefore?: readonly string[];
}

/** Plant words that make "milk", "butter", "cream" or "yogurt" dairy-free. */
const PLANT_PREFIXES = [
  'almond',
  'oat',
  'soy',
  'soya',
  'rice',
  'coconut',
  'cashew',
  'hemp',
  'pea',
  'flax',
  'macadamia',
  'hazelnut',
  'pecan',
  'walnut',
  'pistachio',
  'peanut',
  'sunflower',
  'pumpkin',
  'sesame',
  'seed',
  'nut',
  'apple',
  'cocoa',
  'cacao',
  'shea',
  'vegan',
];

/**
 * Words and phrases that name an allergen inside free text. Each entry maps to
 * the canonical key it can hit; family members are listed under their own
 * word, and the family is added when the scan runs, so the one-way rule holds
 * here too.
 */
const TEXT_TERMS: readonly TextTerm[] = (() => {
  const terms: TextTerm[] = [];
  const add = (phrase: string, guards: Omit<TextTerm, 'words' | 'key'> = {}) => {
    terms.push({ words: tokenize(phrase), key: canonicalAllergen(phrase), ...guards });
  };
  // Picker words and their synonyms.
  add('peanut');
  add('tree nut');
  // "mixed nuts" is the OpenFoodFacts "en:nuts" tag in prose.
  add('nut', { notAfter: ['pea', 'ground', 'tiger', 'water', 'dough', 'coco'] });
  // Cocoa and shea make butter dairy-free, not milk: "cocoa milk" is dairy.
  add('milk', { notAfter: PLANT_PREFIXES.filter((w) => !['cocoa', 'cacao', 'shea'].includes(w)) });
  add('dairy');
  add('lactose');
  add('egg', { notBefore: ['plant'] });
  add('fish', { notAfter: ['swedish', 'gold', 'star', 'jelly', 'cuttle'] });
  add('shellfish');
  add('crustacean');
  add('mollusc');
  add('mollusk');
  add('soy');
  add('soya');
  add('soybean');
  add('wheat');
  add('gluten');
  add('sesame');
  add('sesame seed');
  // Family members, with the guards that stop the known false positives.
  const guarded: Record<string, Omit<TextTerm, 'words' | 'key'>> = {
    chestnut: { notAfter: ['water'] },
    butter: { notAfter: PLANT_PREFIXES, notBefore: ['bean', 'lettuce', 'squash', 'nut'] },
    cream: { notAfter: ['coconut', 'cashew', 'oat', 'soy', 'vegan'], notBefore: ['of tartar'] },
    yogurt: { notAfter: PLANT_PREFIXES },
    yoghurt: { notAfter: PLANT_PREFIXES },
    cheese: { notAfter: ['vegan', 'cashew', 'plant'] },
    crab: { notBefore: ['apple'] },
    mayonnaise: { notAfter: ['vegan', 'eggless'] },
  };
  for (const members of Object.values(ALLERGEN_FAMILIES)) {
    for (const m of members) add(m, guarded[m] ?? {});
  }
  return terms;
})();

/** The keys a term hits: its own, plus its family for a member. */
function termKeys(term: Pick<TextTerm, 'key'>): string[] {
  const family = FAMILY_OF.get(term.key);
  return family ? [term.key, family] : [term.key];
}

/** Keys the vocabulary knows, so the custom-word fallback leaves them to the guarded terms. */
const VOCABULARY_KEYS: ReadonlySet<string> = new Set(TEXT_TERMS.flatMap(termKeys));

/** Single words that name an allergen, and the keys each hits. */
const WORD_KEYS: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const out = new Map<string, Set<string>>();
  for (const term of TEXT_TERMS) {
    if (term.words.length !== 1) continue;
    const set = out.get(term.words[0]) ?? new Set<string>();
    for (const k of termKeys(term)) set.add(k);
    out.set(term.words[0], set);
  }
  return out;
})();

/** Words that, right before a term, say the text is about its absence. */
const NEGATING_BEFORE = new Set(['no', 'non', 'without']);

function sequenceAt(tokens: readonly string[], at: number, phrase: string): boolean {
  const words = tokenize(phrase);
  if (at < 0 || words.length === 0) return false;
  for (let j = 0; j < words.length; j++) if (tokens[at + j] !== words[j]) return false;
  return true;
}

function termAt(tokens: readonly string[], i: number, term: TextTerm): boolean {
  const n = term.words.length;
  for (let j = 0; j < n; j++) if (tokens[i + j] !== term.words[j]) return false;
  const prev = tokens[i - 1];
  // "nut-free", "dairy free", "egg-free".
  // "free-range" is not "free": "Peanut free-range chicken" still names peanut.
  if (tokens[i + n] === 'free' && tokens[i + n + 1] !== 'range') return false;
  // "non-dairy", "no nuts", "without eggs".
  if (prev !== undefined && NEGATING_BEFORE.has(prev)) return false;
  // "dairy-free cheese", "gluten free spelt": the free-of word covers this term.
  if (prev === 'free' && i >= 2) {
    const freeOf = WORD_KEYS.get(tokens[i - 2]);
    if (freeOf && termKeys(term).some((k) => freeOf.has(k))) return false;
  }
  for (const phrase of term.notAfter ?? []) {
    if (sequenceAt(tokens, i - tokenize(phrase).length, phrase)) return false;
  }
  for (const phrase of term.notBefore ?? []) {
    if (sequenceAt(tokens, i + n, phrase)) return false;
  }
  return true;
}

/**
 * Canonical allergens a piece of free text names: the word itself plus, for a
 * family member, its family ("Almond flour" -> {"almond", "tree nut"}).
 * Whole words only, so "butternut squash", "nutmeg", "coconut", "eggplant" and
 * "buckwheat" name nothing.
 */
export function allergensInText(text: unknown): Set<string> {
  const tokens = tokenize(text);
  const out = new Set<string>();
  if (tokens.length === 0) return out;
  for (const term of TEXT_TERMS) {
    for (let i = 0; i + term.words.length <= tokens.length; i++) {
      if (!termAt(tokens, i, term)) continue;
      for (const k of termKeys(term)) out.add(k);
      break;
    }
  }
  return out;
}

/**
 * True when the text names a kid's custom allergen ("kiwi", "strawberry") as
 * whole words. Keys the vocabulary covers are left to its guarded terms, so
 * "almond milk" never reads as "milk" through this fallback.
 */
function textNamesKey(tokens: readonly string[], key: string): boolean {
  if (VOCABULARY_KEYS.has(key)) return false;
  const words = tokenize(key);
  if (words.length === 0) return false;
  const term: TextTerm = { words, key };
  for (let i = 0; i + words.length <= tokens.length; i++) if (termAt(tokens, i, term)) return true;
  return false;
}

/**
 * The first allergen the food's allergen list carries that the child reacts
 * to, or null. Matches canonically (spelling, prefixes, synonyms) and through
 * families, one way: a food's "almonds" hits a kid's "tree nuts", a food's
 * "tree nuts" does not hit a kid's "almond". Returns the kid-side canonical key.
 */
export function matchingAllergen(
  kidAllergens: readonly unknown[] | null | undefined,
  foodAllergens: readonly unknown[] | null | undefined,
): string | null {
  const kid = new Set((kidAllergens ?? []).map(canonicalAllergen).filter(Boolean));
  if (kid.size === 0) return null;
  for (const a of foodAllergens ?? []) {
    const n = canonicalAllergen(a);
    if (!n) continue;
    const hit = hitsKey(n, kid);
    if (hit) return hit;
  }
  return null;
}

/** The part of a food the allergen check reads. */
export interface AllergenCheckedFood {
  name?: string | null;
  allergens?: readonly unknown[] | null;
}

/**
 * matchingAllergen over the whole food: its allergen list first, then the
 * words of each allergen entry ("Peanut Oil") and of the food's name
 * ("Almond butter" with no tags at all). The name scan is whole-word and
 * guarded (see allergensInText), so "Butternut squash" and "Water chestnuts"
 * stay clear. Returns the kid-side canonical key, or null.
 */
export function matchingFoodAllergen(
  kidAllergens: readonly unknown[] | null | undefined,
  food: AllergenCheckedFood | null | undefined,
): string | null {
  if (!food) return null;
  const kid = new Set((kidAllergens ?? []).map(canonicalAllergen).filter(Boolean));
  if (kid.size === 0) return null;
  const direct = matchingAllergen(kidAllergens, food.allergens);
  if (direct) return direct;
  const texts: unknown[] = [...(food.allergens ?? []), food.name];
  for (const text of texts) {
    const named = allergensInText(text);
    for (const key of kid) if (named.has(key)) return key;
    const tokens = tokenize(text);
    for (const key of kid) if (textNamesKey(tokens, key)) return key;
  }
  return null;
}

/** True when the food is safe to schedule for the child as far as allergens go. */
export function isAllergenSafeFor(
  kid: { allergens?: readonly unknown[] | null },
  food: AllergenCheckedFood,
): boolean {
  return matchingFoodAllergen(kid.allergens, food) === null;
}

// ---------------------------------------------------------------------------
// Severity (item 29).
// ---------------------------------------------------------------------------

export type AllergenSeverityLevel = 'mild' | 'moderate' | 'severe';

/**
 * The severity a parent recorded for the kid-side canonical allergen `key`,
 * matched canonically ("Peanuts" in allergen_severity answers "peanut"), or
 * null when none was recorded.
 */
export function allergenSeverityFor(
  kid: { allergen_severity?: Readonly<Record<string, unknown>> | null } | null | undefined,
  key: string,
): AllergenSeverityLevel | null {
  const map = kid?.allergen_severity;
  if (!map) return null;
  const want = canonicalAllergen(key);
  for (const [k, v] of Object.entries(map)) {
    if (canonicalAllergen(k) !== want) continue;
    if (v === 'mild' || v === 'moderate' || v === 'severe') return v;
  }
  return null;
}

/** A hit whose recorded severity is "severe". Unknown severity is not severe, but is still a hit. */
export function isSevereAllergen(
  kid: { allergen_severity?: Readonly<Record<string, unknown>> | null } | null | undefined,
  key: string | null | undefined,
): boolean {
  return Boolean(key) && allergenSeverityFor(kid, key as string) === 'severe';
}

/**
 * Every kid-side canonical key the food hits, through tags, families and the
 * name scan, in the kid's own order. matchingFoodAllergen stops at the first
 * hit; a food carrying milk and egg for a child mild to milk and severe to egg
 * needs both, or the severe one is hidden behind the mild one.
 */
export function matchingFoodAllergens(
  kidAllergens: readonly unknown[] | null | undefined,
  food: AllergenCheckedFood | null | undefined,
): string[] {
  if (!food) return [];
  const keys = [...new Set((kidAllergens ?? []).map(canonicalAllergen).filter(Boolean))];
  return keys.filter((key) => matchingFoodAllergen([key], food) !== null);
}

const SEVERITY_RANK: Readonly<Record<AllergenSeverityLevel, number>> = {
  mild: 1,
  moderate: 2,
  severe: 3,
};

/**
 * The worst allergen hit the food carries for this child: severe beats
 * moderate beats mild beats unrated. Null when the food is safe. Use this,
 * not matchingFoodAllergen, wherever the severity of the hit changes what a
 * surface does.
 */
export function worstFoodAllergen(
  kid:
    | {
        allergens?: readonly unknown[] | null;
        allergen_severity?: Readonly<Record<string, unknown>> | null;
      }
    | null
    | undefined,
  food: AllergenCheckedFood | null | undefined,
): { allergen: string; severity: AllergenSeverityLevel | null } | null {
  const hits = matchingFoodAllergens(kid?.allergens, food);
  let best: { allergen: string; severity: AllergenSeverityLevel | null } | null = null;
  for (const allergen of hits) {
    const severity = allergenSeverityFor(kid, allergen);
    const rank = severity ? SEVERITY_RANK[severity] : 0;
    const bestRank = best?.severity ? SEVERITY_RANK[best.severity] : 0;
    if (!best || rank > bestRank) best = { allergen, severity };
  }
  return best;
}

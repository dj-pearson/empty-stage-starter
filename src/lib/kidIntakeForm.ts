/**
 * Form model for the child profile editor (item 30).
 *
 * The Kids page used to have two editors for one row: a quick-edit dialog
 * (name, birthday, photo, allergies, notes, favorites) and a seven-step intake
 * wizard (everything else). They disagreed on what "Not sure yet" meant and on
 * which fields they sent. There is now one editor, opened on one section at a
 * time, and this module is its whole data side:
 *
 * - kidFormFromKid: the saved Kid -> form state.
 * - buildSectionPatch: form state -> the patch for ONE section, holding only
 *   the fields that section owns and, of those, only the ones that changed.
 * - buildAddPayload: form state -> the addKid payload for a new child.
 *
 * Nothing here talks to Supabase; saving goes through KidsContext.
 */
import type { Kid } from "@/types";
import { canonicalAllergen, normalizeKidAllergenInput, pruneAllergenSeverity } from "@/lib/allergens";
import type { PickinessLevel } from "@/lib/validations";

/**
 * What the parent said about allergies, separately from the list:
 * - "has": save the ticked list.
 * - "none": save [] (confirmed no known allergies).
 * - "unsure": "Not recorded". A new child is saved with allergens: null; on an
 *   existing child it leaves kids.allergens alone, so it never erases an answer.
 */
export type AllergyStatus = "has" | "none" | "unsure";

export const KID_SECTION_IDS = [
  "basics",
  "allergies",
  "safeFoods",
  "alwaysEats",
  "dislikes",
  "textures",
  "behavior",
  "goals",
  "notes",
] as const;

export type KidSectionId = (typeof KID_SECTION_IDS)[number];

export function isKidSectionId(value: unknown): value is KidSectionId {
  return typeof value === "string" && (KID_SECTION_IDS as readonly string[]).includes(value);
}

export const NAME_MAX = 100;
export const NOTES_MAX = 1000;

export interface KidEditorForm {
  name: string;
  /** yyyy-MM-dd, or "" for none. Kept as the stored string so no timezone can shift it. */
  date_of_birth: string;
  profile_picture_url: string | null;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  allergy_status: AllergyStatus;
  allergens: string[];
  allergen_severity: Record<string, string>;
  cross_contamination_sensitive: boolean;
  dietary_restrictions: string[];
  favorite_foods: string[];
  always_eats_foods: string[];
  disliked_foods: string[];
  texture_sensitivity_level: string;
  texture_dislikes: string[];
  texture_preferences: string[];
  preferred_preparations: string[];
  eating_behavior: string;
  new_food_willingness: string;
  behavioral_notes: string;
  /** Shown, never edited: saved as pickinessFromAnswers of the two behavior answers. */
  pickiness_level: string;
  health_goals: string[];
  nutrition_concerns: string[];
  notes: string;
}

export const EMPTY_KID_FORM: KidEditorForm = {
  name: "",
  date_of_birth: "",
  profile_picture_url: null,
  gender: "",
  height_cm: null,
  weight_kg: null,
  allergy_status: "unsure",
  allergens: [],
  allergen_severity: {},
  cross_contamination_sensitive: false,
  dietary_restrictions: [],
  favorite_foods: [],
  always_eats_foods: [],
  disliked_foods: [],
  texture_sensitivity_level: "",
  texture_dislikes: [],
  texture_preferences: [],
  preferred_preparations: [],
  eating_behavior: "",
  new_food_willingness: "",
  behavioral_notes: "",
  pickiness_level: "",
  health_goals: [],
  nutrition_concerns: [],
  notes: "",
};

type ListField =
  | "dietary_restrictions"
  | "favorite_foods"
  | "always_eats_foods"
  | "disliked_foods"
  | "texture_dislikes"
  | "texture_preferences"
  | "preferred_preparations"
  | "health_goals"
  | "nutrition_concerns";

type TextField =
  | "gender"
  | "texture_sensitivity_level"
  | "eating_behavior"
  | "new_food_willingness"
  | "behavioral_notes";

const LIST_FIELDS: readonly ListField[] = [
  "dietary_restrictions",
  "favorite_foods",
  "always_eats_foods",
  "disliked_foods",
  "texture_dislikes",
  "texture_preferences",
  "preferred_preparations",
  "health_goals",
  "nutrition_concerns",
];

const TEXT_FIELDS: readonly TextField[] = [
  "gender",
  "texture_sensitivity_level",
  "eating_behavior",
  "new_food_willingness",
  "behavioral_notes",
];

/**
 * Loose on purpose: a realtime row can carry null in any nullable column, and
 * the Kid type does not say so.
 */
type KidLike = { [K in keyof Kid]?: Kid[K] | null };

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** Saved kid -> form state. A null or missing column becomes the form's empty value. */
export function kidFormFromKid(kid: KidLike): KidEditorForm {
  const allergens = kid.allergens;
  const severity: Record<string, string> = {};
  for (const [key, value] of Object.entries(kid.allergen_severity ?? {})) {
    if (typeof value === "string") severity[key] = value;
  }
  const form: KidEditorForm = {
    ...EMPTY_KID_FORM,
    name: text(kid.name),
    date_of_birth: text(kid.date_of_birth).slice(0, 10),
    profile_picture_url: text(kid.profile_picture_url) || null,
    height_cm: num(kid.height_cm),
    weight_kg: num(kid.weight_kg),
    // kids.allergens is nullable: null/absent is "not recorded", [] is "none known".
    allergy_status: Array.isArray(allergens) ? (allergens.length > 0 ? "has" : "none") : "unsure",
    allergens: list(allergens),
    allergen_severity: severity,
    cross_contamination_sensitive: kid.cross_contamination_sensitive === true,
    pickiness_level: text(kid.pickiness_level),
    notes: text(kid.notes),
  };
  for (const key of LIST_FIELDS) form[key] = list(kid[key]);
  for (const key of TEXT_FIELDS) form[key] = text(kid[key]);
  return form;
}

/**
 * Pickiness from the two eating-behavior answers. The behavior section shows
 * it and saves it to kids.pickiness_level; it is never asked for directly.
 *
 * "very_limited" (fewer than 10 foods) is the narrower diet and "limited"
 * (10-15) the wider one, so very_limited maps to the stronger level.
 */
export function pickinessFromAnswers(behavior: string, willingness: string): PickinessLevel {
  if (behavior === "wide_variety" && willingness === "willing") return "not_picky";
  if (behavior === "very_limited" || willingness === "refuses") return "extremely_picky";
  if (behavior === "limited" || willingness === "very_hesitant") return "very_picky";
  return "somewhat_picky";
}

/** A kid patch where null clears a nullable column. Mirrors KidsContext's KidPatch. */
export type KidEditorPatch = { [K in keyof Kid]?: Kid[K] | null };

/** The addKid payload: every Kid field but id, with allergens: null for "not recorded". */
export type KidAddPayload = Omit<Kid, "id" | "allergens"> & { allergens?: string[] | null };

const cleanList = (values: readonly string[]): string[] => values.map((v) => v.trim()).filter(Boolean);

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameSeverity(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return sameList(ka, kb) && ka.every((k) => a[k] === b[k]);
}

/**
 * The allergen list the form would save, or null for "not recorded".
 * "has" with nothing ticked is [] here; the caller decides whether that is a
 * removal of the last allergen or a mistake.
 */
export function effectiveAllergens(form: Pick<KidEditorForm, "allergy_status" | "allergens">): string[] | null {
  if (form.allergy_status === "unsure") return null;
  if (form.allergy_status === "none") return [];
  return normalizeKidAllergenInput(form.allergens);
}

/** Allergens the base had that the form no longer lists. "Not sure yet" removes nothing. */
export function removedAllergens(base: KidEditorForm, form: KidEditorForm): string[] {
  const before = effectiveAllergens(base);
  const after = effectiveAllergens(form);
  if (!before || after === null) return [];
  const kept = new Set(after.map((a) => canonicalAllergen(a)));
  return before.filter((a) => !kept.has(canonicalAllergen(a)));
}

/** Which fields each section writes. A section's patch never holds another's field. */
export const SECTION_FIELDS: Readonly<Record<KidSectionId, readonly (keyof Kid)[]>> = {
  basics: ["name", "date_of_birth", "profile_picture_url", "gender", "height_cm", "weight_kg"],
  allergies: ["allergens", "allergen_severity", "cross_contamination_sensitive", "dietary_restrictions"],
  safeFoods: ["favorite_foods"],
  alwaysEats: ["always_eats_foods"],
  dislikes: ["disliked_foods"],
  textures: ["texture_sensitivity_level", "texture_dislikes", "texture_preferences", "preferred_preparations"],
  behavior: ["eating_behavior", "new_food_willingness", "behavioral_notes", "pickiness_level"],
  goals: ["health_goals", "nutrition_concerns"],
  notes: ["notes"],
};

/** The form keys one section edits: its columns, plus allergy_status for Allergies. */
export function sectionFormKeys(section: KidSectionId): (keyof KidEditorForm)[] {
  const keys = SECTION_FIELDS[section].filter((k): k is keyof KidEditorForm & keyof Kid => k in EMPTY_KID_FORM);
  return section === "allergies" ? [...keys, "allergy_status"] : keys;
}

/**
 * True when the saved child (`live`) no longer matches the baseline the editor
 * opened on, in the fields this section writes. Saving then would write a list
 * computed against the old baseline and silently drop what another device
 * (or the server load that replaced a cached row) added.
 */
export function sectionChangedSince(section: KidSectionId, base: KidEditorForm, live: KidEditorForm): boolean {
  if (Object.keys(buildSectionPatch(section, live, base)).length > 0) return true;
  if (section !== "allergies") return false;
  // buildSectionPatch skips allergy columns for "not recorded"; compare those directly.
  return JSON.stringify(effectiveAllergens(base)) !== JSON.stringify(effectiveAllergens(live));
}

/** `form` with this section's fields taken from `live`. */
export function withSectionFrom(section: KidSectionId, form: KidEditorForm, live: KidEditorForm): KidEditorForm {
  const next = { ...form } as Record<keyof KidEditorForm, unknown>;
  for (const key of sectionFormKeys(section)) next[key] = live[key];
  return next as KidEditorForm;
}

function diffText(out: Record<string, unknown>, key: string, next: string, prev: string): void {
  const a = next.trim();
  if (a !== prev.trim()) out[key] = a || null;
}

function diffNumber(out: Record<string, unknown>, key: string, next: number | null, prev: number | null): void {
  if (next !== prev) out[key] = next;
}

function diffList(out: Record<string, unknown>, key: ListField, form: KidEditorForm, base: KidEditorForm): void {
  const next = cleanList(form[key]);
  // [] rather than null when cleared: a null list fails KidUpdateSchema.
  if (!sameList(next, cleanList(base[key]))) out[key] = next;
}

function allergyPatch(form: KidEditorForm, base: KidEditorForm, out: Record<string, unknown>): void {
  diffList(out, "dietary_restrictions", form, base);
  const next = effectiveAllergens(form);
  // "Not sure yet" on a saved child leaves every allergy column as it is.
  if (next === null) return;
  const prev = effectiveAllergens(base);
  if (prev === null || !sameList(next, prev)) out.allergens = next;

  const severity = pruneAllergenSeverity(next, form.allergen_severity);
  const baseSeverity = pruneAllergenSeverity(prev ?? [], base.allergen_severity);
  if (!sameSeverity(severity, baseSeverity) || (out.allergens !== undefined && !sameSeverity(severity, base.allergen_severity))) {
    out.allergen_severity = severity;
  }

  const crossContact = next.length > 0 && form.cross_contamination_sensitive;
  if (crossContact !== base.cross_contamination_sensitive) out.cross_contamination_sensitive = crossContact;
}

function behaviorPatch(form: KidEditorForm, base: KidEditorForm, out: Record<string, unknown>): void {
  diffText(out, "eating_behavior", form.eating_behavior, base.eating_behavior);
  diffText(out, "new_food_willingness", form.new_food_willingness, base.new_food_willingness);
  diffText(out, "behavioral_notes", form.behavioral_notes, base.behavioral_notes);
  // Pickiness follows the two answers, and only moves when one of them did,
  // so a level another client set is not rewritten by an unrelated save.
  if ("eating_behavior" in out || "new_food_willingness" in out) {
    const behavior = form.eating_behavior.trim();
    const willingness = form.new_food_willingness.trim();
    out.pickiness_level = behavior || willingness ? pickinessFromAnswers(behavior, willingness) : null;
  }
}

/**
 * The patch for one section: only that section's fields, and only those that
 * differ from `base` (the kid as it was when the editor opened). A cleared text
 * or number is sent as null, a cleared list as [].
 */
export function buildSectionPatch(section: KidSectionId, form: KidEditorForm, base: KidEditorForm): KidEditorPatch {
  const out: Record<string, unknown> = {};
  switch (section) {
    case "basics": {
      const name = form.name.trim().slice(0, NAME_MAX);
      // The name is required; an empty one is a validation error, never a clear.
      if (name && name !== base.name.trim()) out.name = name;
      if (form.date_of_birth !== base.date_of_birth) out.date_of_birth = form.date_of_birth || null;
      if ((form.profile_picture_url ?? null) !== (base.profile_picture_url ?? null)) {
        out.profile_picture_url = form.profile_picture_url ?? null;
      }
      diffText(out, "gender", form.gender, base.gender);
      diffNumber(out, "height_cm", form.height_cm, base.height_cm);
      diffNumber(out, "weight_kg", form.weight_kg, base.weight_kg);
      break;
    }
    case "allergies":
      allergyPatch(form, base, out);
      break;
    case "safeFoods":
      diffList(out, "favorite_foods", form, base);
      break;
    case "alwaysEats":
      diffList(out, "always_eats_foods", form, base);
      break;
    case "dislikes":
      diffList(out, "disliked_foods", form, base);
      break;
    case "textures":
      diffText(out, "texture_sensitivity_level", form.texture_sensitivity_level, base.texture_sensitivity_level);
      diffList(out, "texture_dislikes", form, base);
      diffList(out, "texture_preferences", form, base);
      diffList(out, "preferred_preparations", form, base);
      break;
    case "behavior":
      behaviorPatch(form, base, out);
      break;
    case "goals":
      diffList(out, "health_goals", form, base);
      diffList(out, "nutrition_concerns", form, base);
      break;
    case "notes": {
      const notes = form.notes.trim().slice(0, NOTES_MAX);
      if (notes !== base.notes.trim()) out.notes = notes || null;
      break;
    }
  }
  return out as KidEditorPatch;
}

/**
 * A new child from the Basics and Allergies sections. Empty answers are left
 * out; "Not sure yet" is sent as allergens: null, because an absent key would
 * let the column default ('{}', "no known allergies") apply.
 */
export function buildAddPayload(form: KidEditorForm): KidAddPayload {
  const allergens = effectiveAllergens(form);
  const payload: KidAddPayload = {
    name: form.name.trim().slice(0, NAME_MAX),
    allergens,
  };
  if (form.date_of_birth) payload.date_of_birth = form.date_of_birth;
  if (form.profile_picture_url) payload.profile_picture_url = form.profile_picture_url;
  if (form.gender.trim()) payload.gender = form.gender.trim();
  if (form.height_cm !== null) payload.height_cm = form.height_cm;
  if (form.weight_kg !== null) payload.weight_kg = form.weight_kg;
  const dietary = cleanList(form.dietary_restrictions);
  if (dietary.length > 0) payload.dietary_restrictions = dietary;
  if (allergens && allergens.length > 0) {
    const severity = pruneAllergenSeverity(allergens, form.allergen_severity);
    if (Object.keys(severity).length > 0) payload.allergen_severity = severity;
    if (form.cross_contamination_sensitive) payload.cross_contamination_sensitive = true;
  }
  return payload;
}

const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 100;

/**
 * Add what was typed in a chip input to its list. The draft may hold several
 * comma-separated entries; each is trimmed and capped at 100 characters, and
 * one already on the list (in any case) is skipped. The list stops at 50.
 */
export function commitListDraft(current: readonly string[], draft: string): string[] {
  const out = [...current];
  const seen = new Set(current.map((v) => v.trim().toLowerCase()));
  for (const part of draft.split(",")) {
    if (out.length >= MAX_LIST_ITEMS) break;
    const item = part.trim().slice(0, MAX_ITEM_LENGTH).trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Household food names that start with (then contain) the draft, for chip autocomplete. */
export function suggestFoodNames(
  names: readonly string[],
  draft: string,
  exclude: readonly string[],
  limit = 6,
): string[] {
  const q = draft.trim().toLowerCase();
  if (!q) return [];
  const taken = new Set(exclude.map((v) => v.trim().toLowerCase()));
  const starts: string[] = [];
  const contains: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || taken.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (key.startsWith(q)) starts.push(name.trim());
    else if (key.includes(q)) contains.push(name.trim());
  }
  return [...starts, ...contains].slice(0, limit);
}

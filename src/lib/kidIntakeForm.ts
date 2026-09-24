/**
 * Intake questionnaire form state and the mapping from a saved `kids` row.
 *
 * The questionnaire used to start from EMPTY_INTAKE_FORM and save it over the
 * child's profile, which erased allergens a parent had already entered. It now
 * prefills from the saved row through intakeFormFromRow before Save is enabled,
 * and builds what it saves with intakeFormToUpdate.
 */
import type { Kid } from "@/types";
import { normalizeKidAllergenInput, pruneAllergenSeverity } from "@/lib/allergens";
import type { PickinessLevel } from "@/lib/validations";

/**
 * What the parent said about allergies, separately from the list:
 * - "has": save the ticked list.
 * - "none": save [] (confirmed no known allergies).
 * - "unsure": leave kids.allergens alone; null there reads as "not recorded".
 * - "": not answered yet, treated like "unsure".
 */
export type AllergyStatus = "" | "has" | "none" | "unsure";

export const EMPTY_INTAKE_FORM = {
  gender: "",
  height_cm: null as number | null,
  weight_kg: null as number | null,
  allergy_status: "" as AllergyStatus,
  allergens: [] as string[],
  allergen_severity: {} as Record<string, string>,
  cross_contamination_sensitive: false,
  dietary_restrictions: [] as string[],
  health_goals: [] as string[],
  nutrition_concerns: [] as string[],
  eating_behavior: "",
  new_food_willingness: "",
  behavioral_notes: "",
  texture_sensitivity_level: "",
  texture_dislikes: [] as string[],
  texture_preferences: [] as string[],
  preferred_preparations: [] as string[],
  favorite_foods: [] as string[],
  always_eats_foods: [] as string[],
  disliked_foods: [] as string[],
  pickiness_level: "",
};

export type IntakeFormData = typeof EMPTY_INTAKE_FORM;

export type IntakeRow = {
  [K in keyof IntakeFormData]?: IntakeFormData[K] | null;
};

/** Saved kid row -> form state; a null column falls back to the form's empty value. */
export function intakeFormFromRow(row: IntakeRow): IntakeFormData {
  const form: Record<string, unknown> = { ...EMPTY_INTAKE_FORM };
  for (const key of Object.keys(EMPTY_INTAKE_FORM) as (keyof IntakeFormData)[]) {
    const value = row[key];
    if (value !== null && value !== undefined) {
      form[key] = value;
    }
  }
  // kids.allergens is nullable: null is "not recorded", [] is "none known".
  // allergy_status is not a column, so it is derived here rather than read.
  if (!row.allergy_status) {
    const allergens = row.allergens;
    form.allergy_status = Array.isArray(allergens)
      ? allergens.length > 0 ? "has" : "none"
      : "unsure";
  }
  return form as IntakeFormData;
}

/**
 * Pickiness from the two eating-behavior answers. The review step shows it and
 * intakeFormToUpdate saves it to kids.pickiness_level; it is never asked for
 * directly.
 *
 * "very_limited" (fewer than 10 foods) is the narrower diet and "limited"
 * (10-15) the wider one, so very_limited maps to the stronger level. The old
 * calculator had those two the other way round.
 */
export function pickinessFromAnswers(behavior: string, willingness: string): PickinessLevel {
  if (behavior === "wide_variety" && willingness === "willing") return "not_picky";
  if (behavior === "very_limited" || willingness === "refuses") return "extremely_picky";
  if (behavior === "limited" || willingness === "very_hesitant") return "very_picky";
  return "somewhat_picky";
}

/** A kid patch where null clears a nullable column. Mirrors KidsContext's KidPatch. */
export type KidIntakeUpdate = { [K in keyof Kid]?: Kid[K] | null };

const LIST_FIELDS = [
  "dietary_restrictions",
  "health_goals",
  "nutrition_concerns",
  "texture_dislikes",
  "texture_preferences",
  "preferred_preparations",
  "favorite_foods",
  "always_eats_foods",
  "disliked_foods",
] as const satisfies readonly (keyof IntakeFormData & keyof Kid)[];

const TEXT_FIELDS = [
  "gender",
  "eating_behavior",
  "new_food_willingness",
  "behavioral_notes",
  "texture_sensitivity_level",
] as const satisfies readonly (keyof IntakeFormData & keyof Kid)[];

const NUMBER_FIELDS = ["height_cm", "weight_kg"] as const satisfies readonly (keyof IntakeFormData & keyof Kid)[];

/**
 * Form state -> the patch to save.
 *
 * An empty answer is left out, so an unanswered question never overwrites
 * anything. The one exception is a field that `loaded` had a value for and the
 * parent cleared: a text or number field is sent as null, a list as []. (A
 * null list would fail KidUpdateSchema, and null in kids.allergens means "not
 * recorded", which is not what clearing a list says.)
 *
 * pickiness_level is computed from eating_behavior and new_food_willingness
 * whenever either is answered; form.pickiness_level is ignored. With neither
 * answered it is left out, so a level set elsewhere (the iOS editor) stays.
 * If the parent cleared both answers that were saved before, it is cleared too.
 */
export function intakeFormToUpdate(form: IntakeFormData, loaded: IntakeFormData): KidIntakeUpdate {
  const out: Record<string, unknown> = {};

  for (const key of TEXT_FIELDS) {
    const value = (form[key] ?? "").trim();
    if (value) out[key] = value;
    else if ((loaded[key] ?? "").trim()) out[key] = null;
  }

  for (const key of NUMBER_FIELDS) {
    const value = form[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof loaded[key] === "number") out[key] = null;
  }

  for (const key of LIST_FIELDS) {
    const value = (form[key] ?? []).map((v) => v.trim()).filter(Boolean);
    if (value.length > 0) out[key] = value;
    else if ((loaded[key] ?? []).length > 0) out[key] = [];
  }

  if (form.eating_behavior.trim() || form.new_food_willingness.trim()) {
    out.pickiness_level = pickinessFromAnswers(form.eating_behavior.trim(), form.new_food_willingness.trim());
  } else if ((loaded.eating_behavior ?? "").trim() || (loaded.new_food_willingness ?? "").trim()) {
    out.pickiness_level = null;
  }

  // Allergens: "Not sure yet" (or no answer) leaves the column as it is.
  const status = form.allergy_status;
  if (status === "has" || status === "none") {
    const allergens = status === "has" ? normalizeKidAllergenInput(form.allergens) : [];
    if (status === "none" || allergens.length > 0) {
      out.allergens = allergens;
      const severity = pruneAllergenSeverity(allergens, form.allergen_severity);
      if (Object.keys(severity).length > 0 || Object.keys(loaded.allergen_severity ?? {}).length > 0) {
        out.allergen_severity = severity;
      }
      const crossContact = allergens.length > 0 && form.cross_contamination_sensitive;
      if (crossContact || loaded.cross_contamination_sensitive) {
        out.cross_contamination_sensitive = crossContact;
      }
    }
  }

  return out as KidIntakeUpdate;
}

const MAX_LIST_ITEMS = 50;
const MAX_ITEM_LENGTH = 100;

/**
 * Add what was typed in a chip input to its list. The draft may hold several
 * comma-separated entries; each is trimmed and capped at 100 characters, and
 * one already on the list (in any case) is skipped. The list stops at 50.
 */
export function commitListDraft(list: readonly string[], draft: string): string[] {
  const out = [...list];
  const seen = new Set(list.map((v) => v.trim().toLowerCase()));
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

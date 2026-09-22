/**
 * Intake questionnaire form state and the mapping from a saved `kids` row.
 *
 * The questionnaire used to start from EMPTY_INTAKE_FORM and save it over the
 * child's profile, which erased allergens a parent had already entered. It now
 * prefills from the saved row through intakeFormFromRow before Save is enabled.
 */

export const EMPTY_INTAKE_FORM = {
  gender: "",
  height_cm: null as number | null,
  weight_kg: null as number | null,
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
  return form as IntakeFormData;
}

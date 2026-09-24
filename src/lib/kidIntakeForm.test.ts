import { describe, it, expect } from "vitest";
import {
  EMPTY_INTAKE_FORM,
  commitListDraft,
  intakeFormFromRow,
  intakeFormToUpdate,
  pickinessFromAnswers,
  type IntakeFormData,
} from "./kidIntakeForm";
import { KidSchema, KidUpdateSchema, PICKINESS_LEVELS } from "./validations";

const BEHAVIORS = ["", "wide_variety", "moderate", "limited", "very_limited"];
const WILLINGNESS = ["", "willing", "hesitant", "very_hesitant", "refuses"];
const CLIENT_ONLY = ["pickiness_level", "texture_sensitivity_level", "preferred_preparations"];

const form = (patch: Partial<IntakeFormData>): IntakeFormData => ({ ...EMPTY_INTAKE_FORM, ...patch });

describe("intakeFormToUpdate", () => {
  it("passes KidUpdateSchema for every eating_behavior x new_food_willingness answer", () => {
    for (const eating_behavior of BEHAVIORS) {
      for (const new_food_willingness of WILLINGNESS) {
        const patch = intakeFormToUpdate(
          form({
            eating_behavior,
            new_food_willingness,
            pickiness_level: pickinessFromAnswers(eating_behavior, new_food_willingness),
            texture_sensitivity_level: "strong",
            preferred_preparations: ["Only cold foods"],
          }),
          EMPTY_INTAKE_FORM,
        );
        const result = KidUpdateSchema.safeParse(patch);
        expect(result.success, `${eating_behavior} x ${new_food_willingness}`).toBe(true);
        for (const key of CLIENT_ONLY) expect(patch).not.toHaveProperty(key);
      }
    }
  });

  it("leaves out an empty answer that was never set", () => {
    expect(intakeFormToUpdate(EMPTY_INTAKE_FORM, EMPTY_INTAKE_FORM)).toEqual({});
  });

  it("sends null for a cleared height that was saved before, and it validates", () => {
    const loaded = form({ height_cm: 110, gender: "female", disliked_foods: ["peas"] });
    const patch = intakeFormToUpdate(form({ height_cm: null }), loaded);
    expect(patch.height_cm).toBeNull();
    expect(patch.gender).toBeNull();
    expect(patch.disliked_foods).toEqual([]);
    expect(KidUpdateSchema.safeParse(patch).success).toBe(true);
  });

  it("leaves allergens alone for 'Not sure yet' and sends [] for 'No known allergies'", () => {
    const loaded = intakeFormFromRow({ allergens: ["peanuts"], allergen_severity: { peanuts: "severe" } });
    expect(loaded.allergy_status).toBe("has");
    const unsure = intakeFormToUpdate({ ...loaded, allergy_status: "unsure" }, loaded);
    expect(unsure).not.toHaveProperty("allergens");
    expect(unsure).not.toHaveProperty("allergen_severity");
    const none = intakeFormToUpdate({ ...loaded, allergy_status: "none" }, loaded);
    expect(none.allergens).toEqual([]);
    expect(none.allergen_severity).toEqual({});
  });

  it("normalizes allergens and prunes orphaned severities", () => {
    const patch = intakeFormToUpdate(
      form({
        allergy_status: "has",
        allergens: ["dairy", "Milk", " Kiwi "],
        allergen_severity: { dairy: "severe", peanuts: "mild", Kiwi: "bogus" },
      }),
      EMPTY_INTAKE_FORM,
    );
    expect(patch.allergens).toEqual(["milk", "Kiwi"]);
    expect(patch.allergen_severity).toEqual({ milk: "severe" });
    expect(KidUpdateSchema.safeParse(patch).success).toBe(true);
  });

  it("derives allergy_status from a row: null is unsure, [] is none", () => {
    expect(intakeFormFromRow({ allergens: null }).allergy_status).toBe("unsure");
    expect(intakeFormFromRow({ allergens: [] }).allergy_status).toBe("none");
  });
});

describe("commitListDraft", () => {
  it("splits on commas and trims", () => {
    expect(commitListDraft([], "mac and cheese, peas")).toEqual(["mac and cheese", "peas"]);
  });

  it("dedupes case-insensitively, against the list and within the draft", () => {
    expect(commitListDraft(["Peas"], "peas, Carrots, carrots")).toEqual(["Peas", "Carrots"]);
  });

  it("caps the list at 50 and each item at 100 characters", () => {
    const many = Array.from({ length: 60 }, (_, i) => `food ${i}`).join(",");
    expect(commitListDraft([], many)).toHaveLength(50);
    expect(commitListDraft([], "x".repeat(150))[0]).toHaveLength(100);
  });
});

describe("pickinessFromAnswers", () => {
  it.each([
    ["wide_variety", "willing", "not_picky"],
    ["wide_variety", "hesitant", "somewhat_picky"],
    ["moderate", "willing", "somewhat_picky"],
    ["moderate", "hesitant", "somewhat_picky"],
    ["limited", "willing", "very_picky"],
    ["moderate", "very_hesitant", "very_picky"],
    ["very_limited", "willing", "extremely_picky"],
    ["limited", "refuses", "extremely_picky"],
    ["", "", "somewhat_picky"],
  ])("%s + %s -> %s", (behavior, willingness, expected) => {
    expect(pickinessFromAnswers(behavior, willingness)).toBe(expected);
  });

  it("only ever returns a level the schema accepts", () => {
    for (const b of BEHAVIORS) for (const w of WILLINGNESS) {
      expect(PICKINESS_LEVELS).toContain(pickinessFromAnswers(b, w));
    }
  });
});

describe("KidSchema", () => {
  it("still accepts the ManageKidsDialog add payload", () => {
    expect(() =>
      KidSchema.parse({
        name: "Maya",
        date_of_birth: "2020-04-01",
        notes: undefined,
        allergens: ["peanuts"],
        profile_picture_url: undefined,
        favorite_foods: undefined,
      }),
    ).not.toThrow();
  });
});

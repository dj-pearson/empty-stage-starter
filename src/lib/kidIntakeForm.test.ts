import { describe, it, expect } from "vitest";
import {
  EMPTY_KID_FORM,
  KID_SECTION_IDS,
  SECTION_FIELDS,
  buildAddPayload,
  buildSectionPatch,
  commitListDraft,
  kidFormFromKid,
  pickinessFromAnswers,
  removedAllergens,
  sectionChangedSince,
  withSectionFrom,
  suggestFoodNames,
  type KidEditorForm,
} from "./kidIntakeForm";
import { KidSchema, KidUpdateSchema, PICKINESS_LEVELS } from "./validations";
import type { Kid } from "@/types";

const BEHAVIORS = ["", "wide_variety", "moderate", "limited", "very_limited"];
const WILLINGNESS = ["", "willing", "hesitant", "very_hesitant", "refuses"];

const form = (patch: Partial<KidEditorForm>): KidEditorForm => ({ ...EMPTY_KID_FORM, ...patch });

const maya: Kid = {
  id: "k1",
  name: "Maya",
  date_of_birth: "2020-04-01",
  allergens: ["peanuts"],
  allergen_severity: { peanuts: "severe" },
  cross_contamination_sensitive: true,
  favorite_foods: ["crackers"],
  always_eats_foods: ["toast"],
  disliked_foods: ["peas"],
  texture_sensitivity_level: "High",
  preferred_preparations: ["Steamed"],
  eating_behavior: "limited",
  new_food_willingness: "hesitant",
  pickiness_level: "very_picky",
  height_cm: 110,
  gender: "female",
  notes: "Loves dips",
};

describe("kidFormFromKid", () => {
  it("derives allergy_status: missing is unsure, [] is none, a list is has", () => {
    expect(kidFormFromKid({ id: "a", name: "A" }).allergy_status).toBe("unsure");
    expect(kidFormFromKid({ id: "a", name: "A", allergens: [] }).allergy_status).toBe("none");
    expect(kidFormFromKid(maya).allergy_status).toBe("has");
  });

  it("reads null columns from a realtime row as empty answers", () => {
    const f = kidFormFromKid({ id: "a", name: "A", gender: null, height_cm: null, health_goals: null });
    expect(f.gender).toBe("");
    expect(f.height_cm).toBeNull();
    expect(f.health_goals).toEqual([]);
  });

  it("round-trips: an untouched form produces an empty patch for every section", () => {
    const base = kidFormFromKid(maya);
    for (const section of KID_SECTION_IDS) {
      expect(buildSectionPatch(section, base, base), section).toEqual({});
    }
  });
});

describe("buildSectionPatch", () => {
  it("never puts another section's field in a patch", () => {
    const base = kidFormFromKid(maya);
    const everything = form({
      name: "Mia",
      date_of_birth: "2021-01-01",
      gender: "other",
      height_cm: 120,
      weight_kg: 22,
      allergy_status: "has",
      allergens: ["peanuts", "sesame"],
      dietary_restrictions: ["halal"],
      favorite_foods: ["rice"],
      always_eats_foods: ["pasta"],
      disliked_foods: [],
      texture_sensitivity_level: "mild",
      texture_dislikes: ["Slimy"],
      preferred_preparations: ["Baked"],
      eating_behavior: "moderate",
      new_food_willingness: "willing",
      behavioral_notes: "Only eats specific brands",
      health_goals: ["More protein"],
      nutrition_concerns: ["ADHD"],
      notes: "",
    });
    for (const section of KID_SECTION_IDS) {
      const patch = buildSectionPatch(section, everything, base);
      const allowed = new Set<string>(SECTION_FIELDS[section]);
      for (const key of Object.keys(patch)) expect(allowed.has(key), `${section}: ${key}`).toBe(true);
      expect(KidUpdateSchema.safeParse(patch).success, section).toBe(true);
    }
  });

  it("basics: sends only the changed field, and a cleared value as null", () => {
    const base = kidFormFromKid(maya);
    expect(buildSectionPatch("basics", { ...base, height_cm: null }, base)).toEqual({ height_cm: null });
    expect(buildSectionPatch("basics", { ...base, date_of_birth: "" }, base)).toEqual({ date_of_birth: null });
    expect(buildSectionPatch("basics", { ...base, name: "  Mia " }, base)).toEqual({ name: "Mia" });
  });

  it("basics: an emptied name is never sent", () => {
    const base = kidFormFromKid(maya);
    expect(buildSectionPatch("basics", { ...base, name: " " }, base)).toEqual({});
  });

  it("allergies: 'Not sure yet' on a saved child sends no allergy column", () => {
    const base = kidFormFromKid(maya);
    const patch = buildSectionPatch("allergies", { ...base, allergy_status: "unsure" }, base);
    expect(patch).toEqual({});
  });

  it("allergies: 'No known allergies' sends [], an empty severity map and clears cross-contact", () => {
    const base = kidFormFromKid(maya);
    const patch = buildSectionPatch("allergies", { ...base, allergy_status: "none" }, base);
    expect(patch).toEqual({ allergens: [], allergen_severity: {}, cross_contamination_sensitive: false });
  });

  it("allergies: a severity change alone sends only the severity map", () => {
    const base = kidFormFromKid(maya);
    const patch = buildSectionPatch("allergies", { ...base, allergen_severity: { peanuts: "mild" } }, base);
    expect(patch).toEqual({ allergen_severity: { peanuts: "mild" } });
  });

  it("allergies: normalizes the list and prunes orphaned severities", () => {
    const patch = buildSectionPatch(
      "allergies",
      form({
        allergy_status: "has",
        allergens: ["dairy", "Milk", " Kiwi "],
        allergen_severity: { dairy: "severe", peanuts: "mild", Kiwi: "bogus" },
      }),
      EMPTY_KID_FORM,
    );
    expect(patch.allergens).toEqual(["milk", "Kiwi"]);
    expect(patch.allergen_severity).toEqual({ milk: "severe" });
    expect(KidUpdateSchema.safeParse(patch).success).toBe(true);
  });

  it("food lists: a cleared list is sent as []", () => {
    const base = kidFormFromKid(maya);
    expect(buildSectionPatch("dislikes", { ...base, disliked_foods: [] }, base)).toEqual({ disliked_foods: [] });
    expect(buildSectionPatch("safeFoods", { ...base, favorite_foods: ["crackers", "rice"] }, base)).toEqual({
      favorite_foods: ["crackers", "rice"],
    });
  });

  it("textures: leaves an iOS texture label alone unless it was changed", () => {
    const base = kidFormFromKid(maya);
    expect(buildSectionPatch("textures", { ...base, preferred_preparations: [] }, base)).toEqual({
      preferred_preparations: [],
    });
    expect(buildSectionPatch("textures", { ...base, texture_sensitivity_level: "" }, base)).toEqual({
      texture_sensitivity_level: null,
    });
  });

  it("behavior: recomputes pickiness only when an answer moved, for every answer pair", () => {
    for (const eating_behavior of BEHAVIORS) {
      for (const new_food_willingness of WILLINGNESS) {
        const patch = buildSectionPatch("behavior", form({ eating_behavior, new_food_willingness }), EMPTY_KID_FORM);
        expect(KidUpdateSchema.safeParse(patch).success).toBe(true);
        if (eating_behavior || new_food_willingness) {
          expect(patch.pickiness_level).toBe(pickinessFromAnswers(eating_behavior, new_food_willingness));
        } else {
          expect(patch).toEqual({});
        }
      }
    }
  });

  it("behavior: a habit change leaves a pickiness level set elsewhere alone", () => {
    const base = kidFormFromKid({ ...maya, pickiness_level: "Very Picky" });
    const patch = buildSectionPatch("behavior", { ...base, behavioral_notes: "Only eats specific brands" }, base);
    expect(patch).toEqual({ behavioral_notes: "Only eats specific brands" });
  });

  it("behavior: clearing both answers clears pickiness", () => {
    const base = kidFormFromKid(maya);
    const patch = buildSectionPatch("behavior", { ...base, eating_behavior: "", new_food_willingness: "" }, base);
    expect(patch).toEqual({ eating_behavior: null, new_food_willingness: null, pickiness_level: null });
  });

  it("notes: trims and clears to null", () => {
    const base = kidFormFromKid(maya);
    expect(buildSectionPatch("notes", { ...base, notes: "  " }, base)).toEqual({ notes: null });
  });
});

describe("removedAllergens", () => {
  it("lists what the form dropped, and nothing for 'Not sure yet'", () => {
    const base = kidFormFromKid({ ...maya, allergens: ["peanuts", "eggs"] });
    expect(removedAllergens(base, { ...base, allergens: ["eggs"] })).toEqual(["peanuts"]);
    expect(removedAllergens(base, { ...base, allergy_status: "none" })).toEqual(["peanuts", "eggs"]);
    expect(removedAllergens(base, { ...base, allergy_status: "unsure" })).toEqual([]);
  });
});

describe("buildAddPayload", () => {
  it("records 'Not sure yet' as allergens: null and leaves empty answers out", () => {
    expect(buildAddPayload(form({ name: " Leo " }))).toEqual({ name: "Leo", allergens: null });
  });

  it("carries basics and the allergy answers, and validates", () => {
    const payload = buildAddPayload(
      form({
        name: "Leo",
        date_of_birth: "2021-06-01",
        height_cm: 95,
        allergy_status: "has",
        allergens: ["peanuts"],
        allergen_severity: { peanuts: "severe" },
        cross_contamination_sensitive: true,
        dietary_restrictions: ["halal"],
      }),
    );
    expect(payload).toEqual({
      name: "Leo",
      date_of_birth: "2021-06-01",
      height_cm: 95,
      allergens: ["peanuts"],
      allergen_severity: { peanuts: "severe" },
      cross_contamination_sensitive: true,
      dietary_restrictions: ["halal"],
    });
    expect(KidSchema.safeParse(payload).success).toBe(true);
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

describe("suggestFoodNames", () => {
  it("puts prefix matches first and skips names already on the list", () => {
    const names = ["Mac and cheese", "Cheese stick", "Macaroni", "Apple"];
    expect(suggestFoodNames(names, "mac", [])).toEqual(["Mac and cheese", "Macaroni"]);
    expect(suggestFoodNames(names, "chee", ["cheese stick"])).toEqual(["Mac and cheese"]);
    expect(suggestFoodNames(names, " ", [])).toEqual([]);
  });
});

describe("pickinessFromAnswers", () => {
  it.each([
    ["wide_variety", "willing", "not_picky"],
    ["wide_variety", "hesitant", "somewhat_picky"],
    ["moderate", "willing", "somewhat_picky"],
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

describe("sectionChangedSince / withSectionFrom", () => {
  const base = kidFormFromKid({ id: "k", name: "Alex", allergens: ["peanuts"], notes: "a" });

  it("sees an allergen added elsewhere, and ignores other sections' fields", () => {
    const live = kidFormFromKid({ id: "k", name: "Alex", allergens: ["peanuts", "sesame"], notes: "b" });
    expect(sectionChangedSince("allergies", base, live)).toBe(true);
    expect(sectionChangedSince("basics", base, live)).toBe(false);
    expect(sectionChangedSince("notes", base, live)).toBe(true);
  });

  it("sees allergies going back to not recorded", () => {
    const live = kidFormFromKid({ id: "k", name: "Alex", allergens: null });
    expect(sectionChangedSince("allergies", base, live)).toBe(true);
  });

  it("takes only the section's fields from the live row", () => {
    const live = kidFormFromKid({ id: "k", name: "Other", allergens: ["sesame"] });
    const next = withSectionFrom("allergies", { ...base, notes: "draft" }, live);
    expect(next.allergens).toEqual(["sesame"]);
    expect(next.allergy_status).toBe("has");
    expect(next.name).toBe("Alex");
    expect(next.notes).toBe("draft");
  });
});

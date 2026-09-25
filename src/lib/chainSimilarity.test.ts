import { describe, it, expect } from "vitest";
import type { Food, FoodCategory } from "@/types";
import {
  CHAIN_SCORE_THRESHOLD,
  closenessLevel,
  mergeRpcSuggestions,
  normalizeReason,
  scoreChainCandidates,
  type FoodPropsLite,
} from "./chainSimilarity";

const food = (id: string, name: string, category: FoodCategory = "carb"): Food => ({
  id,
  name,
  category,
  is_safe: false,
  is_try_bite: false,
});

const plainPasta = food("f-plain", "Plain pasta");
const buttered = food("f-butter", "Buttered pasta");
const sauce = food("f-sauce", "Pasta with a little sauce");
const broccoli = food("f-broc", "Broccoli", "vegetable");
const goldfish = food("f-gold", "Goldfish", "snack");
const cheeseCrackers = food("f-cc", "Cheese crackers", "snack");

describe("scoreChainCandidates", () => {
  it("ranks the pasta steps above broccoli for plain pasta", () => {
    const out = scoreChainCandidates(plainPasta, [broccoli, sauce, buttered, plainPasta]);
    const ids = out.map((s) => s.foodId);
    expect(ids).toContain("f-butter");
    expect(ids).toContain("f-sauce");
    const brocIndex = ids.indexOf("f-broc");
    if (brocIndex !== -1) {
      expect(ids.indexOf("f-butter")).toBeLessThan(brocIndex);
      expect(ids.indexOf("f-sauce")).toBeLessThan(brocIndex);
    }
    for (const s of out) {
      expect(s.similarityScore).toBeGreaterThanOrEqual(CHAIN_SCORE_THRESHOLD);
      expect(s.similarityScore).toBeLessThanOrEqual(100);
    }
  });

  it("gives color and texture as reasons for Goldfish to cheese crackers", () => {
    const [top] = scoreChainCandidates(goldfish, [cheeseCrackers]);
    expect(top.foodId).toBe("f-cc");
    expect(top.reasons).toEqual(expect.arrayContaining(["color", "texture"]));
  });

  it("uses food_properties when both foods have them", () => {
    const apple = food("f-apple", "Apple slices", "fruit");
    const pear = food("f-pear", "Pear slices", "fruit");
    const props = new Map<string, FoodPropsLite>([
      ["f-apple", { food_id: "f-apple", texture_primary: "Crunchy", flavor_profile: "{sweet,sour}", color_primary: "green" }],
      ["f-pear", { food_id: "f-pear", texture_primary: "crunchy", flavor_profile: ["sweet"], color_secondary: "Green" }],
    ]);
    const [top] = scoreChainCandidates(apple, [pear], props);
    expect(top.reasons).toEqual(expect.arrayContaining(["texture", "taste", "color", "type"]));
  });

  it("never lists the anchor itself", () => {
    const out = scoreChainCandidates(plainPasta, [plainPasta, buttered, food("dup", "plain pasta")]);
    expect(out.map((s) => s.foodId)).toEqual(["f-butter"]);
  });

  it("returns [] when nothing reaches the threshold", () => {
    expect(scoreChainCandidates(plainPasta, [broccoli, food("f-sal", "Salmon", "protein")])).toEqual([]);
  });

  it("is deterministic regardless of pantry order", () => {
    const pantry = [broccoli, sauce, buttered, food("f-noodle", "Egg noodles"), food("f-rice", "White rice")];
    const a = scoreChainCandidates(plainPasta, pantry);
    const b = scoreChainCandidates(plainPasta, [...pantry].reverse());
    expect(a).toEqual(b);
    // Equal scores fall back to id order.
    for (let i = 1; i < a.length; i++) {
      if (a[i - 1].similarityScore === a[i].similarityScore) {
        expect(a[i - 1].foodId < a[i].foodId).toBe(true);
      }
    }
  });

  it("scans at most 500 pantry rows", () => {
    const pantry = Array.from({ length: 600 }, (_, i) => food(`p-${String(i).padStart(3, "0")}`, `Pasta ${i}`));
    const out = scoreChainCandidates(plainPasta, pantry);
    expect(out.length).toBe(500);
    expect(out.some((s) => s.foodId === "p-550")).toBe(false);
  });
});

describe("normalizeReason", () => {
  it("maps the legacy keys and drops unknown ones", () => {
    expect(normalizeReason("similar_texture")).toBe("texture");
    expect(normalizeReason("similar_flavor")).toBe("taste");
    expect(normalizeReason("same_category")).toBe("type");
    expect(normalizeReason("similar_color")).toBe("color");
    expect(normalizeReason("similar_shape")).toBe("shape");
    expect(normalizeReason("vibes")).toBeNull();
    expect(normalizeReason("")).toBeNull();
  });
});

describe("mergeRpcSuggestions", () => {
  it("dedupes by id, keeps the max score and unions the reasons", () => {
    const client = [
      { foodId: "a", foodName: "Buttered pasta", similarityScore: 60, reasons: ["texture" as const] },
      { foodId: "b", foodName: "Rice", similarityScore: 40, reasons: ["color" as const] },
    ];
    const out = mergeRpcSuggestions(client, [
      { food_id: "a", food_name: "Buttered pasta", similarity_score: 80, reasons: ["similar_flavor", "mystery"] },
      { food_id: "c", food_name: "Toast", similarity_score: null, reasons: null },
    ]);
    expect(out.map((s) => s.foodId)).toEqual(["a", "b", "c"]);
    expect(out[0]).toEqual({ foodId: "a", foodName: "Buttered pasta", similarityScore: 80, reasons: ["taste", "texture"] });
    expect(out[2].similarityScore).toBe(0);
    expect(out[2].reasons).toEqual([]);
  });
});

describe("closenessLevel", () => {
  it("buckets scores", () => {
    expect(closenessLevel(70)).toBe("small");
    expect(closenessLevel(69)).toBe("medium");
    expect(closenessLevel(50)).toBe("medium");
    expect(closenessLevel(49)).toBe("big");
  });
});

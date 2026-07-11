import { describe, it, expect } from "vitest";
import { redactKidForCache, redactSnapshotForCache, SENSITIVE_KID_FIELDS } from "./cacheSnapshot";
import type { Kid } from "@/types";

const fullKid = (): Kid => ({
  id: "k1",
  name: "Sam",
  age: 5,
  date_of_birth: "2020-01-01",
  notes: "secret notes",
  allergens: ["peanut", "egg"],
  dietary_restrictions: ["vegetarian"],
  health_goals: ["more iron"],
  favorite_foods: ["pizza"],
  profile_picture_url: "https://x/y.jpg",
} as unknown as Kid);

describe("redactKidForCache (US-537)", () => {
  it("drops every sensitive field but keeps id/name/age", () => {
    const out = redactKidForCache(fullKid()) as Record<string, unknown>;
    expect(out.id).toBe("k1");
    expect(out.name).toBe("Sam");
    expect(out.age).toBe(5);
    for (const field of SENSITIVE_KID_FIELDS) {
      expect(out[field], `expected ${field} to be redacted`).toBeUndefined();
    }
  });

  it("does not mutate the original kid", () => {
    const kid = fullKid();
    redactKidForCache(kid);
    expect((kid as Record<string, unknown>).allergens).toEqual(["peanut", "egg"]);
  });
});

describe("redactSnapshotForCache (US-537)", () => {
  it("minimizes the kids slice and leaves other slices intact", () => {
    const snapshot = {
      foods: [{ id: "f1", name: "Milk" }],
      kids: [fullKid()],
      recipes: [{ id: "r1" }],
      planEntries: [],
      groceryItems: [],
      activeKidId: "k1",
    };
    const out = redactSnapshotForCache(snapshot);
    expect(out.foods).toEqual(snapshot.foods);
    expect(out.recipes).toEqual(snapshot.recipes);
    expect(out.activeKidId).toBe("k1");
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("peanut");
    expect(serialized).not.toContain("secret notes");
    expect(serialized).toContain("Sam"); // name still cached for offline paint
  });

  it("is a no-op when kids is not an array", () => {
    const snapshot = { kids: undefined, foods: [] };
    expect(redactSnapshotForCache(snapshot)).toBe(snapshot);
  });
});

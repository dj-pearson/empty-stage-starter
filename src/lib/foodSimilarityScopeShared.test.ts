// Vitest mirror for calculate-food-similarity's household scoping, so the
// decision runs in CI without Deno. Deno twin:
// supabase/functions/_shared/foodSimilarityScope.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  parseSimilarityRequest,
  resolveSimilarityScope,
  scopeCandidateFoods,
  type HouseholdScopedRow,
} from "../../supabase/functions/_shared/foodSimilarityScope";

const MINE = "hh-mine";
const THEIRS = "hh-theirs";

interface Row extends HouseholdScopedRow {
  name: string;
}

const FOODS: Row[] = [
  { id: "apple", household_id: MINE, name: "Apple" },
  { id: "pear", household_id: MINE, name: "Pear" },
  { id: "their-mango", household_id: THEIRS, name: "Mango" },
  { id: "orphan", household_id: null, name: "Orphan" },
];
const KIDS: Row[] = [
  { id: "my-kid", household_id: MINE, name: "Sam" },
  { id: "their-kid", household_id: THEIRS, name: "Alex" },
];

// The loaders ignore the household argument on purpose, standing in for a
// query that forgot its filter: the helper must still refuse.
function harness(userId: string | null | undefined, body: unknown, household: string | null = MINE) {
  const seen = { householdLookups: [] as string[], foodsFor: [] as string[], kidLoads: 0, sourceLoads: 0 };
  const run = () =>
    resolveSimilarityScope<Row, Row>({
      userId,
      body,
      lookupHousehold: (uid) => {
        seen.householdLookups.push(uid);
        return Promise.resolve(household);
      },
      loadSourceFood: (id) => {
        seen.sourceLoads += 1;
        return Promise.resolve(FOODS.find((f) => f.id === id) ?? null);
      },
      loadKid: (id) => {
        seen.kidLoads += 1;
        return Promise.resolve(KIDS.find((k) => k.id === id) ?? null);
      },
      loadHouseholdFoods: (hh) => {
        seen.foodsFor.push(hh);
        return Promise.resolve(FOODS);
      },
    });
  return { seen, run };
}

describe("resolveSimilarityScope", () => {
  it.each([undefined, null, ""])("refuses a caller with no verified user (%s) with 401 and loads nothing", async (userId) => {
    const h = harness(userId, { sourceFoodId: "apple" });
    const out = await h.run();
    expect(out).toMatchObject({ kind: "refused", refusal: { status: 401, error: "Unauthorized" } });
    expect(h.seen).toEqual({ householdLookups: [], foodsFor: [], kidLoads: 0, sourceLoads: 0 });
  });

  it("refuses another household's kid with 403 before loading a single food", async () => {
    const h = harness("user-1", { sourceFoodId: "apple", kidId: "their-kid" });
    const out = await h.run();
    expect(out).toMatchObject({ kind: "refused", refusal: { status: 403, error: "Forbidden", reason: "kid_not_in_household" } });
    expect(h.seen.foodsFor).toEqual([]);
  });

  it("refuses a kid id that does not resolve with 403", async () => {
    const out = await harness("user-1", { sourceFoodId: "apple", kidId: "nobody" }).run();
    expect(out).toMatchObject({ kind: "refused", refusal: { status: 403 } });
  });

  it("answers another household's source food with 404, same as a missing one", async () => {
    const foreign = await harness("user-1", { sourceFoodId: "their-mango" }).run();
    const missing = await harness("user-1", { sourceFoodId: "no-such-food" }).run();
    expect(foreign).toMatchObject({ kind: "refused", refusal: { status: 404, error: "Food not found" } });
    expect(missing).toEqual(foreign);
  });

  it("returns only the caller's household foods, minus the source food", async () => {
    const out = await harness("user-1", { sourceFoodId: "apple", kidId: "my-kid" }).run();
    expect(out.kind).toBe("scoped");
    if (out.kind !== "scoped") return;
    expect(out.householdId).toBe(MINE);
    expect(out.candidates.map((f) => f.id)).toEqual(["pear"]);
    expect(out.kid?.id).toBe("my-kid");
    expect(out.sourceFood.id).toBe("apple");
  });

  it("ignores a household id supplied in the body", async () => {
    const h = harness("user-1", { sourceFoodId: "apple", household_id: THEIRS, householdId: THEIRS });
    const out = await h.run();
    expect(h.seen.householdLookups).toEqual(["user-1"]);
    expect(h.seen.foodsFor).toEqual([MINE]);
    expect(out).toMatchObject({ kind: "scoped", householdId: MINE });
  });

  it("keeps the old 400 message for a missing sourceFoodId", async () => {
    for (const body of [{}, null, "text", { sourceFoodId: "  " }, { sourceFoodId: 42 }]) {
      const out = await harness("user-1", body).run();
      expect(out).toMatchObject({ kind: "refused", refusal: { status: 400, error: "Source food ID is required" } });
    }
  });

  it("refuses a user with no household with 403", async () => {
    const out = await harness("user-1", { sourceFoodId: "apple" }, null).run();
    expect(out).toMatchObject({ kind: "refused", refusal: { status: 403, reason: "no_household" } });
  });

  it("lets a loader throw propagate so the handler answers a generic 500", async () => {
    await expect(
      resolveSimilarityScope<Row, Row>({
        userId: "user-1",
        body: { sourceFoodId: "apple" },
        lookupHousehold: () => Promise.reject(new Error("rpc down")),
        loadSourceFood: () => Promise.resolve(null),
        loadKid: () => Promise.resolve(null),
        loadHouseholdFoods: () => Promise.resolve([]),
      }),
    ).rejects.toThrow("rpc down");
  });
});

describe("parseSimilarityRequest and scopeCandidateFoods", () => {
  it("reads only sourceFoodId and kidId", () => {
    expect(parseSimilarityRequest({ sourceFoodId: "a", kidId: "k", household_id: THEIRS })).toEqual({
      ok: true,
      request: { sourceFoodId: "a", kidId: "k" },
    });
  });

  it("drops rows from other households and rows with no household", () => {
    expect(scopeCandidateFoods(FOODS, MINE, "apple").map((f) => f.id)).toEqual(["pear"]);
  });
});

describe("calculate-food-similarity wiring", () => {
  const source = readFileSync(
    path.join(process.cwd(), "supabase", "functions", "calculate-food-similarity", "index.ts"),
    "utf8",
  );

  it("routes its reads through the scope helper", () => {
    expect(source).toContain("resolveSimilarityScope");
    expect(source).toContain("userId: gate.userId");
  });

  it("does not read foods or kids with the service role key", () => {
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

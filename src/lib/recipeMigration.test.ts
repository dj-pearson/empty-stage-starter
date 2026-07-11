import { describe, it, expect } from "vitest";
import { isUuid, selectLocalOnlyRecipes } from "./recipeMigration";
import { generateId } from "./utils";
import type { Recipe } from "@/types";

const recipe = (id: string, name = "R"): Recipe =>
  ({ id, name, food_ids: [], recipe_ingredients: [] } as unknown as Recipe);

describe("isUuid (US-527)", () => {
  it("recognizes canonical UUIDs and rejects locally-generated ids", () => {
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    // generateId() -> `${Date.now()}-${rand}` — always has a '-' but is NOT a UUID.
    const localId = generateId();
    expect(localId).toContain("-");
    expect(isUuid(localId)).toBe(false);
  });
});

describe("selectLocalOnlyRecipes (US-527)", () => {
  it("detects a locally-generated recipe as local-only so it is migrated", () => {
    const localId = generateId();
    const local = [recipe(localId, "Grandma's Soup")];
    const db: Recipe[] = [];
    const localOnly = selectLocalOnlyRecipes(local, db);
    expect(localOnly).toHaveLength(1);
    expect(localOnly[0].id).toBe(localId);
  });

  it("does not re-migrate a recipe already on the server (matched by id)", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const local = [recipe(uuid)];
    const db = [recipe(uuid)];
    expect(selectLocalOnlyRecipes(local, db)).toHaveLength(0);
  });

  it("treats server UUID recipes as non-local even if absent from the db slice", () => {
    // A UUID id is server-shaped; never re-insert it as a new local recipe.
    expect(selectLocalOnlyRecipes([recipe("3f2504e0-4f89-41d3-9a0c-0305e82c3301")], [])).toHaveLength(0);
  });

  it("migrates only the local-only subset from a mixed list", () => {
    const localId = generateId();
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const local = [recipe(localId, "Local"), recipe(uuid, "Synced")];
    const db = [recipe(uuid, "Synced")];
    const localOnly = selectLocalOnlyRecipes(local, db);
    expect(localOnly.map((r) => r.id)).toEqual([localId]);
  });
});

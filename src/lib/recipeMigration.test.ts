import { describe, it, expect } from "vitest";
import { isUuid, selectLocalOnlyRecipes } from "./recipeMigration";
import { generateId } from "./utils";
import type { Recipe } from "@/types";

const recipe = (id: string, name = "R"): Recipe =>
  ({ id, name, food_ids: [], recipe_ingredients: [] } as unknown as Recipe);

describe("isUuid (US-527/US-549)", () => {
  it("recognizes canonical UUIDs, including generateId() output", () => {
    expect(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    // US-549: generateId() now returns a real UUID.
    expect(isUuid(generateId())).toBe(true);
    expect(isUuid("1720000000000-abc123")).toBe(false); // old-style local id
  });
});

describe("selectLocalOnlyRecipes (US-527/US-549)", () => {
  it("detects a recipe absent from the server id set as local-only", () => {
    const localId = generateId();
    const local = [recipe(localId, "Grandma's Soup"), recipe("srv-1", "Synced")];
    const serverIds = new Set(["srv-1"]);
    const localOnly = selectLocalOnlyRecipes(local, serverIds);
    expect(localOnly.map((r) => r.id)).toEqual([localId]);
  });

  it("does not flag a recipe present on the server (even with a UUID id)", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(selectLocalOnlyRecipes([recipe(uuid)], new Set([uuid]))).toHaveLength(0);
  });

  it("returns nothing when every local recipe is already on the server", () => {
    const ids = [generateId(), generateId()];
    const local = ids.map((id) => recipe(id));
    expect(selectLocalOnlyRecipes(local, new Set(ids))).toHaveLength(0);
  });
});

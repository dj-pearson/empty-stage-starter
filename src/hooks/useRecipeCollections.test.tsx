import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "@/i18n";

vi.mock("@/integrations/supabase/client", async () => (await import("@/test/fakeCollectionsSupabase")).fakeSupabaseModule);
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { toast } from "sonner";
import { fake } from "@/test/fakeCollectionsSupabase";
import { useRecipeCollections } from "./useRecipeCollections";

const USER = "11111111-1111-4111-8111-111111111111";
const HOUSE = "22222222-2222-4222-8222-222222222222";
const OTHER_USER = "33333333-3333-4333-8333-333333333333";

function seed() {
  fake.reset({
    recipe_collections: [
      { id: "c-week", user_id: USER, household_id: HOUSE, name: "Weeknight", sort_order: 0, is_default: false },
      { id: "c-kids", user_id: USER, household_id: HOUSE, name: "Kid favorites", sort_order: 0, is_default: false },
      { id: "c-other", user_id: OTHER_USER, household_id: null, name: "Not mine", sort_order: 0, is_default: false },
    ],
    recipe_collection_items: [
      { id: "i1", collection_id: "c-week", recipe_id: "r1" },
      { id: "i2", collection_id: "c-kids", recipe_id: "r1" },
      { id: "i3", collection_id: "c-kids", recipe_id: "r2" },
      { id: "i4", collection_id: "c-other", recipe_id: "r9" },
    ],
  });
}

async function mount() {
  const hook = renderHook(() => useRecipeCollections(USER, HOUSE));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe("useRecipeCollections", () => {
  beforeEach(() => {
    seed();
    vi.mocked(toast.error).mockClear();
  });

  it("scopes the items query to the loaded collection ids", async () => {
    const { result } = await mount();
    expect(result.current.collections.map((c) => c.id).sort()).toEqual(["c-kids", "c-week"]);
    const itemsQuery = fake.calls.find((c) => c.table === "recipe_collection_items" && c.op === "select");
    expect(itemsQuery?.filters).toContainEqual(["in", ["collection_id", ["c-week", "c-kids"]]]);
    expect(result.current.itemsByCollection["c-kids"]).toEqual(new Set(["r1", "r2"]));
    expect(result.current.collectionIdsByRecipe.r1.sort()).toEqual(["c-kids", "c-week"]);
    expect(result.current.itemsByCollection["c-other"]).toBeUndefined();
  });

  it("skips the items query when there are no collections", async () => {
    fake.reset();
    await mount();
    expect(fake.calls.some((c) => c.table === "recipe_collection_items")).toBe(false);
  });

  it("create shows the collection without a refetch", async () => {
    const { result } = await mount();
    const selectsBefore = fake.calls.filter((c) => c.op === "select").length;
    let created: Awaited<ReturnType<typeof result.current.create>> = null;
    await act(async () => {
      created = await result.current.create({ name: "  Lunchbox  ", color: "green" });
    });
    expect(created).not.toBeNull();
    expect(result.current.collections.find((c) => c.name === "Lunchbox")?.id).toBe(created!.id);
    expect(fake.calls.filter((c) => c.op === "select").length).toBe(selectsBefore);
  });

  it("create rolls back when the insert fails", async () => {
    const { result } = await mount();
    fake.failNext = { table: "recipe_collections", op: "insert" };
    await act(async () => {
      await result.current.create({ name: "Doomed" });
    });
    expect(result.current.collections.some((c) => c.name === "Doomed")).toBe(false);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("remove drops the collection and its undo restores it with its members", async () => {
    const { result } = await mount();
    let snapshot: Awaited<ReturnType<typeof result.current.remove>> = null;
    await act(async () => {
      snapshot = await result.current.remove("c-kids");
    });
    expect(result.current.collections.some((c) => c.id === "c-kids")).toBe(false);
    expect(result.current.collectionIdsByRecipe.r2).toBeUndefined();
    expect(fake.tables.recipe_collection_items.some((i) => i.collection_id === "c-kids")).toBe(false);
    // One delete statement: the cascade takes the members, no pre-delete.
    expect(fake.calls.filter((c) => c.op === "delete")).toHaveLength(1);

    expect(snapshot!.recipeIds.sort()).toEqual(["r1", "r2"]);
    await act(async () => {
      await snapshot!.undo();
    });
    expect(result.current.collections.some((c) => c.id === "c-kids")).toBe(true);
    expect(result.current.itemsByCollection["c-kids"]).toEqual(new Set(["r1", "r2"]));
    expect(fake.tables.recipe_collections.some((c) => c.id === "c-kids")).toBe(true);
    expect(
      fake.tables.recipe_collection_items.filter((i) => i.collection_id === "c-kids").map((i) => i.recipe_id).sort(),
    ).toEqual(["r1", "r2"]);
  });

  it("setMembership upserts additions and deletes removals", async () => {
    const { result } = await mount();
    await act(async () => {
      await result.current.setMembership("r2", ["c-week"]);
    });
    expect(result.current.collectionIdsByRecipe.r2).toEqual(["c-week"]);
    const upsert = fake.calls.find((c) => c.op === "upsert");
    expect(upsert?.options).toEqual({ onConflict: "collection_id,recipe_id", ignoreDuplicates: true });
    expect(upsert?.payload).toEqual([{ collection_id: "c-week", recipe_id: "r2" }]);
    expect(fake.calls.filter((c) => c.op === "delete")).toHaveLength(1);
  });

  it("setMembership rolls back on failure", async () => {
    const { result } = await mount();
    fake.failNext = { table: "recipe_collection_items", op: "upsert" };
    await act(async () => {
      await result.current.setMembership("r2", ["c-week", "c-kids"]);
    });
    expect(result.current.collectionIdsByRecipe.r2).toEqual(["c-kids"]);
  });

  it("dropRecipe prunes the recipe from every collection locally", async () => {
    const { result } = await mount();
    const callsBefore = fake.calls.length;
    act(() => result.current.dropRecipe("r1"));
    expect(result.current.collectionIdsByRecipe.r1).toBeUndefined();
    expect(result.current.itemsByCollection["c-kids"]).toEqual(new Set(["r2"]));
    expect(result.current.countsByCollection["c-week"]).toBe(0);
    expect(fake.calls.length).toBe(callsBefore);
  });

  it("a load error is exposed, not toasted, and retried when the browser comes online", async () => {
    fake.failNext = { table: "recipe_collections", op: "select" };
    const { result } = await mount();
    expect(result.current.error).toBeInstanceOf(Error);
    expect(toast.error).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.collections).toHaveLength(2);
  });
});

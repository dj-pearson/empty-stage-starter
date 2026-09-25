import { describe, it, expect } from "vitest";
import {
  ACCOUNT_EXPORT_TABLES,
  HOUSEHOLD_EXPORT_TABLES,
  buildAccountExport,
  serializeAccountExport,
  summarizeExport,
  type AccountExportTable,
  type ExportClient,
  type ExportFilterBuilder,
  type ExportQueryResult,
  type ExportRow,
} from "./accountExport";

interface Call {
  table: AccountExportTable;
  filters: Array<[string, string, unknown]>;
  range: [number, number] | null;
}

/**
 * A fake PostgREST client. `rows[table]` is every row the table holds; a range
 * returns that slice. `fail` makes a table answer with an error.
 */
function fakeClient(
  rows: Partial<Record<AccountExportTable, ExportRow[]>>,
  fail: Partial<Record<AccountExportTable, string>> = {}
) {
  const calls: Call[] = [];
  const client: ExportClient = {
    from(table) {
      return {
        select() {
          const call: Call = { table, filters: [], range: null };
          calls.push(call);
          const builder: ExportFilterBuilder = {
            eq(column, value) {
              call.filters.push(["eq", column, value]);
              return builder;
            },
            in(column, values) {
              call.filters.push(["in", column, [...values]]);
              return builder;
            },
            order() {
              return builder;
            },
            range(from, to) {
              call.range = [from, to];
              return builder;
            },
            then<A = ExportQueryResult, B = never>(
              onfulfilled?: ((value: ExportQueryResult) => A | PromiseLike<A>) | null,
              onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
            ): PromiseLike<A | B> {
              const all = rows[table] ?? [];
              const [from, to] = call.range ?? [0, all.length - 1];
              const result: ExportQueryResult = fail[table]
                ? { data: null, error: { message: fail[table] as string } }
                : { data: all.slice(from, to + 1), error: null };
              return Promise.resolve(result).then(onfulfilled, onrejected);
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, calls };
}

describe("buildAccountExport", () => {
  it("never asks for meal_voting, which is not a table", async () => {
    const { client, calls } = fakeClient({});
    const result = await buildAccountExport(client, { userId: "u1" });
    expect((ACCOUNT_EXPORT_TABLES as readonly string[]).includes("meal_voting")).toBe(false);
    expect(calls.some((c) => (c.table as string) === "meal_voting")).toBe(false);
    expect(Object.keys(result.data)).not.toContain("meal_voting");
  });

  it("marks a failing table as an error and the export as partial", async () => {
    const { client } = fakeClient({ foods: [{ id: "f1" }] }, { food_attempts: "permission denied" });
    const result = await buildAccountExport(client, {
      userId: "u1",
      householdId: "h1",
    });
    // food_attempts needs kid ids to be queried at all.
    expect(result.manifest.find((e) => e.table === "food_attempts")?.status).toBe("ok");

    const withKids = fakeClient(
      { kids: [{ id: "k1" }], foods: [{ id: "f1" }] },
      { food_attempts: "permission denied" }
    );
    const failed = await buildAccountExport(withKids.client, { userId: "u1", householdId: "h1" });
    const entry = failed.manifest.find((e) => e.table === "food_attempts");
    expect(entry).toMatchObject({ status: "error", message: "permission denied", rows: 0 });
    expect(failed.partial).toBe(true);
    expect(failed.manifest.find((e) => e.table === "foods")).toMatchObject({ status: "ok", rows: 1 });
    expect(summarizeExport(failed)).toEqual({
      ok: ACCOUNT_EXPORT_TABLES.length - 1,
      total: ACCOUNT_EXPORT_TABLES.length,
      failed: ["food_attempts"],
    });
  });

  it("is not partial when every table answers", async () => {
    const { client } = fakeClient({ kids: [{ id: "k1" }] });
    const result = await buildAccountExport(client, { userId: "u1" });
    expect(result.partial).toBe(false);
    expect(result.manifest).toHaveLength(ACCOUNT_EXPORT_TABLES.length);
  });

  it("pages with .range() and concatenates the chunks", async () => {
    const foods = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}` }));
    const { client, calls } = fakeClient({ foods });
    const result = await buildAccountExport(client, { userId: "u1", householdId: "h1", pageSize: 2 });
    expect(result.data.foods).toEqual(foods);
    const ranges = calls.filter((c) => c.table === "foods").map((c) => c.range);
    expect(ranges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("filters household tables by household_id when there is one", async () => {
    const { client, calls } = fakeClient({});
    await buildAccountExport(client, { userId: "u1", householdId: "h1" });
    for (const table of HOUSEHOLD_EXPORT_TABLES) {
      const call = calls.find((c) => c.table === table);
      expect(call?.filters, table).toEqual([["eq", "household_id", "h1"]]);
    }
    // Personal tables stay on the user.
    expect(calls.find((c) => c.table === "user_preferences")?.filters).toEqual([
      ["eq", "user_id", "u1"],
    ]);
  });

  it("falls back to user_id for household tables without a household", async () => {
    const { client, calls } = fakeClient({});
    await buildAccountExport(client, { userId: "u1", householdId: null });
    expect(calls.find((c) => c.table === "kids")?.filters).toEqual([["eq", "user_id", "u1"]]);
  });

  it("reads per-child tables by the exported kids' ids", async () => {
    const { client, calls } = fakeClient({ kids: [{ id: "k1" }, { id: "k2" }] });
    await buildAccountExport(client, { userId: "u1", householdId: "h1" });
    expect(calls.find((c) => c.table === "kid_food_ladder")?.filters).toEqual([
      ["in", "kid_id", ["k1", "k2"]],
    ]);
  });

  it("reads meal_plan_generations by email, and skips it without one", async () => {
    const withEmail = fakeClient({});
    await buildAccountExport(withEmail.client, { userId: "u1", email: "a@b.co" });
    expect(withEmail.calls.find((c) => c.table === "meal_plan_generations")?.filters).toEqual([
      ["eq", "email", "a@b.co"],
    ]);
    const without = fakeClient({});
    await buildAccountExport(without.client, { userId: "u1" });
    expect(without.calls.some((c) => c.table === "meal_plan_generations")).toBe(false);
  });

  it("puts the manifest inside the downloaded file", async () => {
    const { client } = fakeClient({}, { recipes: "boom" });
    const result = await buildAccountExport(client, { userId: "u1" });
    const file = JSON.parse(
      serializeAccountExport(result, { id: "u1", email: null, displayName: null, createdAt: null })
    );
    expect(file.complete).toBe(false);
    expect(file.manifest).toEqual(result.manifest);
  });
});

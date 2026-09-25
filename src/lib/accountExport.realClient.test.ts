/**
 * buildAccountExport against the real supabase-js query builder.
 *
 * useAccountExport hands the generated client to buildAccountExport through
 * `as unknown as ExportClient`, because TypeScript cannot compare the two
 * (TS2589). That cast means nothing checks that the real PostgREST builder
 * has the eq/in/order/range chain the builder calls, that it is awaitable,
 * or that `.range()` becomes the row window PostgREST pages by. The other
 * suite drives a hand-written fake; this one creates a real client whose only
 * stub is `fetch`, and reads the requests it actually sends.
 */
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildAccountExport, ACCOUNT_EXPORT_TABLES, type ExportClient } from "./accountExport";

interface Seen {
  table: string;
  params: URLSearchParams;
  range: string | null;
}

function realClient(rowsFor: (table: string, params: URLSearchParams) => unknown[]) {
  const seen: Seen[] = [];
  const fetchStub: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const headers = new Headers(init?.headers);
    seen.push({ table, params: url.searchParams, range: headers.get("Range") });
    return new Response(JSON.stringify(rowsFor(table, url.searchParams)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const client = createClient<Database>("https://example.test", "anon-key-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub },
  });
  return { client: client as unknown as ExportClient, seen };
}

describe("buildAccountExport with the real supabase-js client", () => {
  it("scopes household tables by household, kid tables by the exported kids, and pages by Range", async () => {
    const { client, seen } = realClient((table) =>
      table === "kids" ? [{ id: "kid-1" }, { id: "kid-2" }] : []
    );

    const result = await buildAccountExport(client, {
      userId: "user-1",
      householdId: "house-1",
      email: "parent@example.test",
      pageSize: 50,
    });

    expect(result.partial).toBe(false);
    expect(result.manifest.map((m) => m.table).sort()).toEqual([...ACCOUNT_EXPORT_TABLES].sort());
    expect(result.data.kids).toEqual([{ id: "kid-1" }, { id: "kid-2" }]);

    const byTable = (t: string) => seen.find((s) => s.table === t);

    // A co-parent's rows come along: household tables filter on household_id.
    expect(byTable("plan_entries")?.params.get("household_id")).toBe("eq.house-1");
    expect(byTable("plan_entries")?.params.get("user_id")).toBeNull();
    // Per-child tables use the kid ids the kids query returned.
    expect(byTable("food_attempts")?.params.get("kid_id")).toBe("in.(kid-1,kid-2)");
    // Email-keyed and user-keyed tables.
    expect(byTable("meal_plan_generations")?.params.get("email")).toBe("eq.parent@example.test");
    expect(byTable("user_preferences")?.params.get("user_id")).toBe("eq.user-1");
    // Stable order and the page window supabase-js sends for .range().
    expect(byTable("picky_win_preferences")?.params.get("order")).toBe("user_id.asc");
    const kidsReq = byTable("kids");
    expect(kidsReq?.params.get("order")).toBe("id.asc");
    expect(kidsReq?.params.get("offset")).toBe("0");
    expect(kidsReq?.params.get("limit")).toBe("50");
  });

  it("asks for the next page when a page comes back full", async () => {
    const { client, seen } = realClient((table, params) => {
      if (table !== "foods") return [];
      const offset = Number(params.get("offset") ?? "0");
      // Three full-ish pages of 2: 2, 2, then 1.
      const all = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
      return all.slice(offset, offset + 2);
    });

    const result = await buildAccountExport(client, { userId: "user-1", pageSize: 2 });

    expect(result.data.foods?.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    const offsets = seen.filter((s) => s.table === "foods").map((s) => s.params.get("offset"));
    expect(offsets).toEqual(["0", "2", "4"]);
    // No household: shared tables fall back to the user's own rows.
    expect(seen.find((s) => s.table === "foods")?.params.get("user_id")).toBe("eq.user-1");
  });
});

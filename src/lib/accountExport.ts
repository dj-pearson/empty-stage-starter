/**
 * "Download your data" for Settings (settings pass B).
 *
 * The old export ran ten queries in a Promise.all, read `.data || []` from each
 * and toasted "Data exported successfully" whatever came back. Two of the ten
 * could never succeed: meal_voting is not a table, and meal_plan_generations
 * has no user_id column (it is keyed by email), so both handed the parent an
 * empty array labelled as their data. Every household table was filtered by
 * user_id, which drops whatever a co-parent added to the shared plan.
 *
 * This builder is honest about each table: it reads `error` on every result,
 * pages past PostgREST's row cap with .range(), and returns a manifest the UI
 * turns into "Exported 11 of 12 sections". It takes the client as a parameter
 * so accountExport.test.ts can drive it with a fake.
 *
 * The server-side export function (deferred) will replace the client queries;
 * the manifest shape is what it should return too.
 */
import type { Database } from "@/integrations/supabase/types";

type TableName = keyof Database["public"]["Tables"];

/**
 * Every table the export reads. `satisfies` checks each name against the
 * generated types, so a table that does not exist (meal_voting) fails the
 * typecheck instead of failing silently at runtime.
 */
export const ACCOUNT_EXPORT_TABLES = [
  "kids",
  "foods",
  "recipes",
  "plan_entries",
  "grocery_items",
  "grocery_lists",
  "food_attempts",
  "kid_food_ladder",
  "kid_growth_events",
  "recipe_attempts",
  "picky_win_preferences",
  "user_preferences",
  "user_accessibility_preferences",
  "automation_email_subscriptions",
  "user_subscriptions",
  "quiz_responses",
  "meal_plan_generations",
] as const satisfies readonly TableName[];

export type AccountExportTable = (typeof ACCOUNT_EXPORT_TABLES)[number];

/** Shared by the household: filter by household_id when there is one. */
export const HOUSEHOLD_EXPORT_TABLES = [
  "kids",
  "foods",
  "recipes",
  "plan_entries",
  "grocery_items",
  "grocery_lists",
] as const satisfies readonly AccountExportTable[];

/** Rows about a child, keyed by kid_id only: filtered by the exported kids. */
const KID_EXPORT_TABLES = [
  "food_attempts",
  "kid_food_ladder",
  "kid_growth_events",
] as const satisfies readonly AccountExportTable[];

/** Keyed by the account email rather than a user id (RLS matches the JWT email). */
const EMAIL_EXPORT_TABLES = ["meal_plan_generations"] as const satisfies readonly AccountExportTable[];

/** Tables whose primary key is not `id`, for stable pagination order. */
const ORDER_COLUMN: Partial<Record<AccountExportTable, string>> = {
  picky_win_preferences: "user_id",
};

export type ExportRow = Record<string, unknown>;

export interface ExportQueryResult {
  data: ExportRow[] | null;
  error: { message: string; code?: string } | null;
}

/** The slice of PostgREST's filter builder this module uses. */
export interface ExportFilterBuilder extends PromiseLike<ExportQueryResult> {
  eq(column: string, value: string): ExportFilterBuilder;
  in(column: string, values: readonly string[]): ExportFilterBuilder;
  order(column: string, options?: { ascending?: boolean }): ExportFilterBuilder;
  range(from: number, to: number): ExportFilterBuilder;
}

export interface ExportClient {
  from(table: AccountExportTable): { select(columns: string): ExportFilterBuilder };
}

export type ExportStatus = "ok" | "error";

export interface ExportManifestEntry {
  table: AccountExportTable;
  rows: number;
  status: ExportStatus;
  message?: string;
}

export interface AccountExportResult {
  data: Partial<Record<AccountExportTable, ExportRow[]>>;
  manifest: ExportManifestEntry[];
  partial: boolean;
}

export interface AccountExportOptions {
  userId: string;
  householdId?: string | null;
  email?: string | null;
  /** Rows per request. PostgREST's default max-rows is 1000. */
  pageSize?: number;
}

export const EXPORT_PAGE_SIZE = 1000;
/** How many kid ids go in one `in.(...)` filter, to keep URLs short. */
const KID_ID_CHUNK = 100;
/** A runaway guard: 1000 pages of 1000 rows is far past any real account. */
const MAX_PAGES = 1000;

type Fetched = { rows: ExportRow[]; error: string | null };

async function fetchAllPages(
  build: () => ExportFilterBuilder,
  pageSize: number
): Promise<Fetched> {
  const rows: ExportRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    let result: ExportQueryResult;
    try {
      result = await build().range(from, from + pageSize - 1);
    } catch (err) {
      return { rows, error: err instanceof Error ? err.message : String(err) };
    }
    if (result.error) return { rows, error: result.error.message || "Query failed" };
    const data = result.data ?? [];
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { rows, error: null };
}

function isIn<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Read every exported table for this account. Never throws: a table that
 * fails is an `error` entry in the manifest and `partial` is true.
 */
export async function buildAccountExport(
  client: ExportClient,
  { userId, householdId = null, email = null, pageSize = EXPORT_PAGE_SIZE }: AccountExportOptions
): Promise<AccountExportResult> {
  const data: Partial<Record<AccountExportTable, ExportRow[]>> = {};
  const manifest: ExportManifestEntry[] = [];

  const record = (table: AccountExportTable, fetched: Fetched) => {
    data[table] = fetched.rows;
    manifest.push(
      fetched.error === null
        ? { table, rows: fetched.rows.length, status: "ok" }
        : { table, rows: fetched.rows.length, status: "error", message: fetched.error }
    );
  };

  const query = (table: AccountExportTable) => {
    const order = ORDER_COLUMN[table] ?? "id";
    return () => client.from(table).select("*").order(order, { ascending: true });
  };

  const fetchScoped = (table: AccountExportTable): Promise<Fetched> => {
    const base = query(table);
    if (isIn(HOUSEHOLD_EXPORT_TABLES, table)) {
      return householdId
        ? fetchAllPages(() => base().eq("household_id", householdId), pageSize)
        : fetchAllPages(() => base().eq("user_id", userId), pageSize);
    }
    if (isIn(EMAIL_EXPORT_TABLES, table)) {
      if (!email) return Promise.resolve({ rows: [], error: null });
      return fetchAllPages(() => base().eq("email", email), pageSize);
    }
    return fetchAllPages(() => base().eq("user_id", userId), pageSize);
  };

  // Kids first: the per-child tables are filtered by these ids.
  const kids = await fetchScoped("kids");
  const kidIds = kids.rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");

  const fetchForKids = async (table: AccountExportTable): Promise<Fetched> => {
    if (kids.error !== null) {
      return { rows: [], error: "Child profiles could not be read, so this was skipped" };
    }
    const rows: ExportRow[] = [];
    for (const ids of chunk(kidIds, KID_ID_CHUNK)) {
      const part = await fetchAllPages(() => query(table)().in("kid_id", ids), pageSize);
      rows.push(...part.rows);
      if (part.error !== null) return { rows, error: part.error };
    }
    return { rows, error: null };
  };

  const rest = ACCOUNT_EXPORT_TABLES.filter((t) => t !== "kids");
  const fetched = await Promise.all(
    rest.map((table) => (isIn(KID_EXPORT_TABLES, table) ? fetchForKids(table) : fetchScoped(table)))
  );

  record("kids", kids);
  rest.forEach((table, i) => record(table, fetched[i]));

  return { data, manifest, partial: manifest.some((entry) => entry.status === "error") };
}

export interface ExportedUser {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
}

export const ACCOUNT_EXPORT_SCHEMA_VERSION = "2.0.0";

/**
 * The downloaded file. The manifest travels inside it, so a parent (or a
 * support ticket) can see which sections are missing rather than guessing
 * from an empty array.
 */
export function serializeAccountExport(
  result: AccountExportResult,
  user: ExportedUser,
  now: Date = new Date()
): string {
  return JSON.stringify(
    {
      schema_version: ACCOUNT_EXPORT_SCHEMA_VERSION,
      exported_at: now.toISOString(),
      complete: !result.partial,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.displayName,
        created_at: user.createdAt,
      },
      manifest: result.manifest,
      data: result.data,
    },
    null,
    2
  );
}

export function accountExportFilename(now: Date = new Date()): string {
  return `eatpal-data-export-${now.toISOString().split("T")[0]}.json`;
}

/** Hand the JSON to the browser as a download. */
export function downloadAccountExport(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ExportSummary {
  ok: number;
  total: number;
  failed: AccountExportTable[];
}

/** Counts for the one-line result message the Data section shows. */
export function summarizeExport(result: Pick<AccountExportResult, "manifest">): ExportSummary {
  const failed = result.manifest.filter((e) => e.status === "error").map((e) => e.table);
  return { ok: result.manifest.length - failed.length, total: result.manifest.length, failed };
}

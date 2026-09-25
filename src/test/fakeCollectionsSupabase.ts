/**
 * An in-memory stand-in for the two tables useRecipeCollections touches
 * (recipe_collections, recipe_collection_items). Test-only.
 *
 * Every executed query is appended to `fake.calls` with its table, operation,
 * filters and payload, so a test can assert what reached "the server" (for
 * example, that the items query was scoped with .in('collection_id', ids)).
 * Set `fake.failNext` to make the next matching operation return an error.
 */

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "upsert" | "update" | "delete";

export interface FakeCall {
  table: string;
  op: Op;
  filters: Array<[string, unknown[]]>;
  payload?: unknown;
  options?: unknown;
}

interface FailRule {
  table: string;
  op: Op;
}

export interface FakeDb {
  tables: Record<string, Row[]>;
  calls: FakeCall[];
  failNext: FailRule | null;
  reset: (tables?: Record<string, Row[]>) => void;
}

export const fake: FakeDb = {
  tables: { recipe_collections: [], recipe_collection_items: [] },
  calls: [],
  failNext: null,
  reset(tables) {
    this.tables = {
      recipe_collections: [],
      recipe_collection_items: [],
      ...(tables ?? {}),
    };
    this.calls = [];
    this.failNext = null;
  },
};

function matches(row: Row, filters: Array<[string, unknown[]]>): boolean {
  return filters.every(([name, args]) => {
    if (name === "eq") return row[args[0] as string] === args[1];
    if (name === "in") return (args[1] as unknown[]).includes(row[args[0] as string]);
    if (name === "or") {
      return String(args[0])
        .split(",")
        .some((part) => {
          const [col, , value] = part.split(".");
          return row[col] === value;
        });
    }
    return true;
  });
}

function execute(call: FakeCall): { data: unknown; error: { message: string } | null } {
  fake.calls.push(call);
  if (fake.failNext && fake.failNext.table === call.table && fake.failNext.op === call.op) {
    fake.failNext = null;
    return { data: null, error: { message: "boom" } };
  }
  const rows = (fake.tables[call.table] ??= []);
  switch (call.op) {
    case "select":
      return { data: rows.filter((r) => matches(r, call.filters)), error: null };
    case "insert":
    case "upsert": {
      const list = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Row[];
      const out: Row[] = [];
      for (const r of list) {
        const conflict = rows.find((x) =>
          call.table === "recipe_collection_items"
            ? x.collection_id === r.collection_id && x.recipe_id === r.recipe_id
            : x.id === r.id,
        );
        if (conflict) {
          if (call.op === "insert") return { data: null, error: { message: "duplicate key" } };
          continue;
        }
        const row = { id: r.id ?? `row-${rows.length + 1}`, ...r };
        rows.push(row);
        out.push(row);
      }
      return { data: out, error: null };
    }
    case "update": {
      const hit = rows.filter((r) => matches(r, call.filters));
      for (const r of hit) Object.assign(r, call.payload as Row);
      return { data: hit, error: null };
    }
    case "delete": {
      const keep = rows.filter((r) => !matches(r, call.filters));
      const gone = rows.filter((r) => matches(r, call.filters));
      fake.tables[call.table] = keep;
      if (call.table === "recipe_collections") {
        const ids = new Set(gone.map((r) => r.id));
        fake.tables.recipe_collection_items = fake.tables.recipe_collection_items.filter(
          (i) => !ids.has(i.collection_id),
        );
      }
      return { data: gone, error: null };
    }
  }
}

function builder(table: string) {
  const call: FakeCall = { table, op: "select", filters: [] };
  let single = false;
  const b = {
    select() {
      return b;
    },
    insert(payload: unknown) {
      call.op = "insert";
      call.payload = payload;
      return b;
    },
    upsert(payload: unknown, options?: unknown) {
      call.op = "upsert";
      call.payload = payload;
      call.options = options;
      return b;
    },
    update(payload: unknown) {
      call.op = "update";
      call.payload = payload;
      return b;
    },
    delete() {
      call.op = "delete";
      return b;
    },
    eq(...args: unknown[]) {
      call.filters.push(["eq", args]);
      return b;
    },
    in(...args: unknown[]) {
      call.filters.push(["in", args]);
      return b;
    },
    or(...args: unknown[]) {
      call.filters.push(["or", args]);
      return b;
    },
    order() {
      return b;
    },
    single() {
      single = true;
      return b;
    },
    then<T>(resolve: (value: { data: unknown; error: { message: string } | null }) => T, reject?: (e: unknown) => T) {
      try {
        const result = execute(call);
        if (single && Array.isArray(result.data)) result.data = result.data[0] ?? null;
        return Promise.resolve(result).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    },
  };
  return b;
}

export const fakeSupabaseModule = {
  supabase: { from: (table: string) => builder(table) },
};

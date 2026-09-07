import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AISLE_DISPLAY_NAMES } from "./effectiveFood";

/**
 * US-795 Task 3: every screen on the grocery, planner, recipes and pantry
 * paths must read a food's display fields through `resolveFood`/
 * `useEffectiveFood` (src/lib/effectiveFood.ts, src/contexts/FoodsContext.tsx)
 * instead of a household `Food` row's raw `.aisle` column. Two households can
 * link the same catalog product and still type its aisle differently before
 * they link it (or not type one at all) -- a screen that reads the raw column
 * shows that per-household spelling instead of the one every other screen
 * agrees on, which is exactly the drift US-777 and US-781 already found once
 * each for grocery inserts and streak rules.
 *
 * This is a text scan, not a type check, because the failure mode is a new
 * call site quietly typing `food.aisle` again -- nothing else would catch
 * that at review time. Modeled on the walk-and-grep shape in
 * src/lib/no-false-credentials.test.ts.
 *
 * Scope is deliberately narrow: `.aisle` on an identifier that is (or holds)
 * a `Food` -- named `food`, `editFood`, `r.food`, etc. `GroceryItem`,
 * `IngredientStatus` and RPC-shaped rows (`RestockSuggestion`) also carry
 * their own `aisle` field, and reading THEIR own already-materialized aisle
 * is not this bug; only a raw read off a `Food` is.
 */

const SRC = join(__dirname, "..");

/** Matches `food.aisle`, `editFood.aisle`, `r.food?.aisle`, `newFood?.aisle`, ... */
const FOOD_AISLE_PATTERN = /\b\w*[Ff]ood\??\.aisle\b/;

interface Exception {
  /** Path relative to src/, forward slashes. */
  file: string;
  reason: string;
}

const EXCEPTIONS: readonly Exception[] = [
  {
    file: "components/AddFoodDialog.tsx",
    reason:
      "Edits the household row itself -- it has to read and write the " +
      "household's own name/category/aisle, never the catalog's. Resolving " +
      "here would silently overwrite what a parent typed with the catalog's " +
      "values the next time they open and save a linked food.",
  },
  {
    file: "lib/effectiveFood.ts",
    reason: "This is the resolver. Reading the raw fields is its job.",
  },
];

/** Source files whose logic runs in the app. Tests and generated types are skipped. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "ui") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    if (entry === "types.ts" && full.includes("integrations")) continue;
    out.push(full);
  }
  return out;
}

describe("food-shaped .aisle reads stay behind the resolver (US-795)", () => {
  const files = sourceFiles(SRC);

  it("scans a meaningful number of source files", () => {
    // Guards against a broken walk silently passing this whole suite.
    expect(files.length).toBeGreaterThan(100);
  });

  it("every exception file actually exists", () => {
    for (const { file } of EXCEPTIONS) {
      expect(existsSync(join(SRC, file)), `exception file ${file} is missing`).toBe(true);
    }
  });

  it("has no direct .aisle read on a food-shaped value outside the exception list", () => {
    const exempt = new Set(EXCEPTIONS.map((e) => e.file));
    const hits: string[] = [];

    for (const file of files) {
      const relPath = relative(SRC, file).replace(/\\/g, "/");
      if (exempt.has(relPath)) continue;

      const body = readFileSync(file, "utf8");
      for (const [index, line] of body.split("\n").entries()) {
        if (FOOD_AISLE_PATTERN.test(line)) {
          hits.push(`${relPath}:${index + 1}  ${line.trim()}`);
        }
      }
    }

    expect(
      hits,
      "A food's aisle was read directly instead of through resolveFood/" +
        "useEffectiveFood (src/lib/effectiveFood.ts). That shows this " +
        "household's own spelling (or nothing, if it never set one) instead " +
        "of the catalog aisle every other linked screen shows for the same " +
        "product. If this read is deliberately exempt (it edits the " +
        "household row, e.g.), add it to EXCEPTIONS with a reason instead of " +
        "weakening the pattern.\n\n" +
        hits.join("\n"),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/**
 * Drift check, carried over from Task 1's ledger: parse
 * ios/EatPal/EatPal/Models/GroceryAisle.swift at test time and diff it
 * against AISLE_DISPLAY_NAMES instead of trusting a hand-verification done
 * once. iOS renaming or adding an aisle is silent on the web otherwise --
 * nothing else reads this Swift file, and the whole point of the mapping
 * (both platforms saying the same words for the same aisle) is gone the
 * moment the two drift and nothing says so.
 */

const SWIFT_ENUM_PATH = join(SRC, "..", "ios", "EatPal", "EatPal", "Models", "GroceryAisle.swift");

/**
 * `GroceryAisle` has several `switch self { case .x: return ... }` blocks in
 * file order -- displayName, then icon (SF Symbol name), then colorName,
 * then storeWalkOrder. Only the FIRST is displayName; matching a later one
 * gives you an SF Symbol name or a sort integer instead of display text. This
 * parser only accepts a single-case `case .x: return "quoted string"` line,
 * which icon and colorName also happen to be shaped like -- so it keeps only
 * the first return text seen per case, which the file order makes displayName's.
 */
function parseSwiftAisleEnum(source: string): {
  rawValueOf: Map<string, string>;
  displayNameOf: Map<string, string>;
} {
  const rawValueOf = new Map<string, string>(); // Swift case identifier -> rawValue
  // `case produce` or `case meatDeli = "meat_deli"` -- a bare declaration,
  // never `case .x:` (a switch match, which starts with a dot).
  const declPattern = /^\s*case\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s*=\s*"([^"]*)")?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = declPattern.exec(source))) {
    const [, caseName, raw] = m;
    rawValueOf.set(caseName, raw ?? caseName);
  }

  const displayNameOf = new Map<string, string>();
  // `case .x: return "Text"` -- single case, quoted return. `case .a, .b:
  // return "x"` (colorName's multi-case lines) has a comma before the colon
  // and does not match, which is fine: every case already got its
  // displayName from its own single-case line before any multi-case switch
  // runs.
  const switchPattern = /^\s*case\s+\.([a-zA-Z_][a-zA-Z0-9_]*):\s*return\s*"([^"]*)"/gm;
  while ((m = switchPattern.exec(source))) {
    const [, caseName, text] = m;
    if (!displayNameOf.has(caseName)) displayNameOf.set(caseName, text);
  }

  return { rawValueOf, displayNameOf };
}

describe("AISLE_DISPLAY_NAMES matches ios/EatPal/EatPal/Models/GroceryAisle.swift", () => {
  const swiftSource = readFileSync(SWIFT_ENUM_PATH, "utf8");
  const { rawValueOf, displayNameOf } = parseSwiftAisleEnum(swiftSource);

  it("parsed the expected 33 GroceryAisle cases", () => {
    // Guards against a broken parser silently passing (or failing) this
    // whole suite for the wrong reason.
    expect(rawValueOf.size).toBe(33);
  });

  it("found displayName text for every parsed case", () => {
    const missing = Array.from(rawValueOf.keys()).filter((name) => !displayNameOf.has(name));
    expect(missing, `no displayName switch entry for: ${missing.join(", ")}`).toEqual([]);
  });

  it("every Swift rawValue -> displayName pair matches AISLE_DISPLAY_NAMES", () => {
    const mismatches: string[] = [];
    for (const [caseName, rawValue] of rawValueOf) {
      const expected = displayNameOf.get(caseName);
      const actual = AISLE_DISPLAY_NAMES[rawValue];
      if (actual !== expected) {
        mismatches.push(`${rawValue}: Swift says "${expected}", web says "${actual}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("has no web aisle that Swift does not also declare", () => {
    const swiftRawValues = new Set(rawValueOf.values());
    const extra = Object.keys(AISLE_DISPLAY_NAMES).filter((k) => !swiftRawValues.has(k));
    expect(extra, `AISLE_DISPLAY_NAMES has a rawValue GroceryAisle.swift does not: ${extra.join(", ")}`).toEqual([]);
  });
});

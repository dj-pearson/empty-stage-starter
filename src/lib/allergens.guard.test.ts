import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/**
 * Item 27: allergens are compared through the canonical matcher
 * (matchingAllergen / matchingFoodAllergen / canonicalAllergen), never by raw
 * string. A lowercased exact compare misses "Peanuts" vs "en:peanuts", "dairy"
 * vs "milk" and "almonds" vs "tree nuts", and each miss is a food the child
 * reacts to reading as safe. This was fixed file by file several times
 * (tonightModeRanking, ladderScheduler, insights, the solver, the rewriter);
 * this test is what stops the next one.
 *
 * Static source check, like clientAiConfig.guard.test.ts: the failure mode is
 * the shape of the code, and a shape is cheap to find.
 */

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src", "supabase/functions"];

/** Each pattern is a raw allergen compare. */
const RAW_COMPARE: ReadonlyArray<{ name: string; re: RegExp }> = [
  // kid.allergens.map((a) => a.toLowerCase()), food.allergens?.[0].toLowerCase() ...
  { name: "lowercased allergen", re: /allergen\w*[^;\n]*\.(?:toLowerCase|toLocaleLowerCase)\(\)/i },
  // lowerSet(kid.allergens), lowerSet(technique.veggieAllergens)
  { name: "lowerSet over allergens", re: /lowerSet\([^)]*allergen/i },
  // kid.allergen_severity?.[a]: a severity saved under another spelling is missed
  { name: "raw severity lookup", re: /allergen_severity\??\.?\[/ },
  // kid.allergens.includes(x), foodAllergens.indexOf(x)
  { name: "exact membership on an allergen list", re: /\b\w*[aA]llergens\??\.(?:includes|indexOf)\(/ },
  // kidAllergens.has(canonicalAllergen(a)): canonical, but blind to families and names
  { name: "canonical set membership (no families)", re: /\.has\(canonicalAllergen\(/ },
];

/**
 * Known matches that are not allergen checks. Each names the file and a
 * snippet of the line, and says why. An entry that no longer matches anything
 * fails the test too, so the list cannot rot into a blanket pass.
 */
const ALLOWED: ReadonlyArray<{ file: string; snippet: string; why: string }> = [
  {
    file: "src/components/ManageKidsDialog.tsx",
    snippet: "prev.allergens.includes(allergen)",
    why: "tickbox toggle over KID_ALLERGEN_PICKER values; normalizeKidAllergenInput snaps saved entries onto those spellings",
  },
  {
    file: "src/components/ManageKidsDialog.tsx",
    snippet: "formData.allergens.includes(value)",
    why: "pressed state of a picker tickbox, same picker values as above",
  },
  {
    file: "src/components/ChildIntakeQuestionnaire.tsx",
    snippet: "const direct = formData.allergen_severity[allergen];",
    why: "exact-key fast path; the next lines fall back to a canonicalAllergen match over every key",
  },
  {
    file: "src/components/ManageKidsDialog.tsx",
    snippet: "return before.filter((a) => !kept.has(canonicalAllergen(a)));",
    why: "diffs the kid's own allergen list before and after an edit; no food is compared",
  },
  {
    file: "src/components/ChildIntakeQuestionnaire.tsx",
    snippet: "!pickerCanonicals.has(canonicalAllergen(a))",
    why: "splits the kid's allergens into picker values and custom ones; no food is compared",
  },
  {
    file: "src/components/ChildIntakeQuestionnaire.tsx",
    snippet: "formData.allergens.filter((a) => pickerCanonicals.has(canonicalAllergen(a)))",
    why: "same picker/custom split as above",
  },
  {
    file: "src/lib/kidGrowthRules.ts",
    snippet: "if (!proposedSet.has(canonicalAllergen(a))) {",
    why: "no-auto-removal assert compares the kid's old and new allergen lists; a family match would hide a removal",
  },
  {
    file: "src/lib/open-food-facts.ts",
    snippet: "allergens_tags as string[]).map((s) => String(s).toLowerCase())",
    why: "normalizes an OpenFoodFacts payload on the way in; nothing is compared",
  },
];

/** Blank out comments but keep line breaks, so line numbers stay true. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      // shadcn primitives never touch allergens and are not ours to edit.
      if (full.endsWith(path.join("components", "ui"))) continue;
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

interface Hit {
  file: string;
  line: number;
  text: string;
  rule: string;
}

function findRawCompares(): Hit[] {
  const hits: Hit[] = [];
  for (const dir of SCAN_DIRS) {
    for (const full of sourceFiles(path.join(ROOT, dir))) {
      const file = path.relative(ROOT, full).split(path.sep).join("/");
      const lines = stripComments(readFileSync(full, "utf-8")).split("\n");
      lines.forEach((text, i) => {
        for (const { name, re } of RAW_COMPARE) {
          if (re.test(text)) hits.push({ file, line: i + 1, text: text.trim(), rule: name });
        }
      });
    }
  }
  return hits;
}

const isAllowed = (h: Hit) => ALLOWED.some((a) => a.file === h.file && h.text.includes(a.snippet));

describe("no raw allergen compares (item 27)", () => {
  const hits = findRawCompares();

  it("every allergen compare goes through the canonical matcher", () => {
    const offenders = hits.filter((h) => !isAllowed(h)).map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text}`);
    expect(offenders, "use matchingAllergen / matchingFoodAllergen / canonicalAllergen from src/lib/allergens").toEqual([]);
  });

  it("every allowlist entry still matches a line", () => {
    const stale = ALLOWED.filter((a) => !hits.some((h) => h.file === a.file && h.text.includes(a.snippet)));
    expect(stale.map((a) => `${a.file}: ${a.snippet}`)).toEqual([]);
  });

  it("the patterns catch the shapes this item removed", () => {
    const samples = [
      "const kidAllergens = lowerSet(kid.allergens);",
      "kidAllergens: (kidAllergens ?? []).map((a) => a.toLowerCase()),",
      "if (kidAllergens.has(String(a).trim().toLowerCase())) {",
      "if (kid.allergens.includes(food.allergen)) return false;",
      "const key = allergen.trim().toLowerCase();",
      "const level = kid.allergen_severity?.[a];",
      "const hit = (food.allergens ?? []).find((a) => kidAllergens.has(canonicalAllergen(a)));",
    ];
    for (const s of samples) expect(RAW_COMPARE.some(({ re }) => re.test(s)), s).toBe(true);
    const clean = [
      "const hit = matchingFoodAllergen(kid.allergens, food);",
      "if (message && !allergenReintroPrompts.includes(message)) {",
      "const message = ALLERGEN_REINTRO_RULES[canonicalAllergen(allergen)];",
    ];
    for (const s of clean) expect(RAW_COMPARE.some(({ re }) => re.test(s)), s).toBe(false);
  });
});

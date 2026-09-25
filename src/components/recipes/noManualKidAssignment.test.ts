import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Item 8: which kids a recipe suits is computed (src/lib/kidFit.ts), not
 * assigned by hand. The "Assign to Kids" checkboxes lived in the legacy
 * RecipeBuilder, which is gone, and nothing on the web writes
 * recipes.assigned_kid_ids any more.
 *
 * The column itself stays: shipped iOS builds may still read it, so only the
 * read in normalizeRecipeFromDB and the type are allowed to mention it.
 */
const ROOT = path.resolve(__dirname, "../../..");
const ALLOWED = new Set([
  "src/types/index.ts",
  "src/contexts/RecipesContext.tsx",
  "src/integrations/supabase/types.ts",
]);

describe("no manual kid assignment on recipes", () => {
  it("the legacy builder with the Assign to Kids control is deleted", () => {
    expect(existsSync(path.join(ROOT, "src/components/RecipeBuilder.tsx"))).toBe(false);
  });

  it("nothing but the read path mentions assigned_kid_ids", () => {
    const files = execSync("grep -rl assigned_kid_ids src || true", { cwd: ROOT, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((f) => f && !/\.test\.tsx?$/.test(f));
    expect(files.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it("RecipesContext only reads the column, never sends it", () => {
    const src = readFileSync(path.join(ROOT, "src/contexts/RecipesContext.tsx"), "utf8");
    const hits = src.split("\n").filter((line) => line.includes("assigned_kid_ids"));
    expect(hits).toEqual([expect.stringMatching(/assigned_kid_ids: r\.assigned_kid_ids \?\? undefined/)]);
  });

  it("no recipe screen renders an assign-to-kids control", () => {
    const hits = execSync("grep -rli 'assign to kids' src/components src/pages || true", { cwd: ROOT, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((f) => f && !/\.test\.tsx?$/.test(f));
    expect(hits).toEqual([]);
  });
});

/**
 * The public shared-recipe page's data (item 10): what get_shared_recipe
 * returns, checked at the boundary and shaped for rendering.
 *
 * Pure: no React, no Supabase.
 */
import { z } from "zod";
import { formatQuantity } from "@/lib/groceryMerge";
import { parseDurationMinutes } from "@/lib/recipeFilters";
import { toSafeHttpUrl } from "@/lib/recipeUrl";

const ingredientSchema = z.object({
  name: z.string().nullable().optional(),
  quantity: z.union([z.number(), z.string()]).nullable().optional(),
  unit: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
});

const rowSchema = z.object({
  name: z.string().min(1),
  image_url: z.string().nullable().optional(),
  ingredients: z.array(z.unknown()).nullable().optional(),
  instructions: z.string().nullable().optional(),
  prep_time: z.string().nullable().optional(),
  cook_time: z.string().nullable().optional(),
  total_time_minutes: z.number().nullable().optional(),
  servings: z.string().nullable().optional(),
});

export interface SharedIngredientGroup {
  label: string;
  lines: string[];
}

export interface SharedRecipeView {
  name: string;
  imageUrl: string | null;
  groups: SharedIngredientGroup[];
  steps: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  servings: string | null;
}

/** Steps from the instructions column: a JSON array of strings, or numbered/plain lines. */
export function splitSteps(instructions: string | null | undefined): string[] {
  const text = (instructions ?? "").trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
    }
  } catch {
    // plain text
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function ingredientLine(raw: unknown): { group: string; line: string } | null {
  const parsed = ingredientSchema.safeParse(raw);
  if (!parsed.success) return null;
  const name = (parsed.data.name ?? "").trim();
  if (!name) return null;
  const q = parsed.data.quantity;
  const qty = typeof q === "number" ? q : typeof q === "string" ? Number.parseFloat(q) : NaN;
  const amount = Number.isFinite(qty) && qty > 0 ? formatQuantity(qty) : "";
  const line = [amount, (parsed.data.unit ?? "").trim(), name].filter(Boolean).join(" ");
  return { group: (parsed.data.group ?? "").trim(), line };
}

/** The first row of the RPC result as a view, or null when there is none or it is not a recipe. */
export function toSharedRecipeView(rows: unknown): SharedRecipeView | null {
  const first = Array.isArray(rows) ? rows[0] : rows;
  const parsed = rowSchema.safeParse(first);
  if (!parsed.success) return null;
  const r = parsed.data;

  const order: string[] = [];
  const byGroup = new Map<string, string[]>();
  for (const raw of r.ingredients ?? []) {
    const item = ingredientLine(raw);
    if (!item) continue;
    if (!byGroup.has(item.group)) {
      byGroup.set(item.group, []);
      order.push(item.group);
    }
    byGroup.get(item.group)!.push(item.line);
  }

  const prep = parseDurationMinutes(r.prep_time ?? null);
  const cook = parseDurationMinutes(r.cook_time ?? null);
  const summed = (prep ?? 0) + (cook ?? 0);
  const total = r.total_time_minutes && r.total_time_minutes > 0 ? r.total_time_minutes : summed > 0 ? summed : null;

  return {
    name: r.name,
    imageUrl: toSafeHttpUrl(r.image_url ?? "") || null,
    groups: order.map((label) => ({ label, lines: byGroup.get(label) ?? [] })),
    steps: splitSteps(r.instructions),
    prepMinutes: prep && prep > 0 ? Math.round(prep) : null,
    cookMinutes: cook && cook > 0 ? Math.round(cook) : null,
    totalMinutes: total != null ? Math.round(total) : null,
    servings: (r.servings ?? "").trim() || null,
  };
}

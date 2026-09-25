/**
 * Typed client for the `manage-meal-plan-templates` edge function.
 *
 * The Save, Gallery and Apply dialogs each hand-rolled the same fetch: read the
 * session, derive the functions URL, POST, `await response.json()` and trust
 * whatever came back. A 502 from the proxy returned HTML and threw inside
 * `.json()` with a message nobody could act on, and a renamed column would have
 * rendered as `undefined meals`. Every call now goes through invokeEdgeFunction
 * (one place for the URL and the bearer token) and every response is parsed
 * with Zod, so a shape change fails loudly at the boundary instead of quietly
 * in the UI.
 */
import { z } from "zod";
import { invokeEdgeFunction } from "@/lib/edge-functions";

const FUNCTION_NAME = "manage-meal-plan-templates";

export const mealPlanTemplateEntrySchema = z
  .object({
    id: z.string(),
    day_of_week: z.number().int(),
    meal_slot: z.string(),
    recipe_id: z.string().nullable().optional(),
    food_ids: z.array(z.string()).nullable().optional(),
    notes: z.string().nullable().optional(),
    is_optional: z.boolean().nullable().optional(),
    recipes: z
      .object({
        id: z.string(),
        name: z.string(),
        image_url: z.string().nullable().optional(),
        kid_friendly_score: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type MealPlanTemplateEntry = z.infer<typeof mealPlanTemplateEntrySchema>;

export const mealPlanTemplateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional().transform((v) => v ?? null),
    season: z.string().nullable().optional().transform((v) => v ?? null),
    is_favorite: z.boolean().nullable().optional().transform((v) => v ?? false),
    is_admin_template: z.boolean().nullable().optional().transform((v) => v ?? false),
    is_starter_template: z.boolean().nullable().optional().transform((v) => v ?? false),
    times_used: z.number().nullable().optional().transform((v) => v ?? 0),
    success_rate: z.number().nullable().optional().transform((v) => v ?? null),
    created_at: z.string().nullable().optional().transform((v) => v ?? ""),
    meal_plan_template_entries: z
      .array(mealPlanTemplateEntrySchema)
      .nullable()
      .optional()
      .transform((v) => v ?? []),
  })
  .passthrough();

export type MealPlanTemplate = z.infer<typeof mealPlanTemplateSchema>;

export type TemplateSeason = "year_round" | "spring" | "summer" | "fall" | "winter";

const listResponse = z.object({ templates: z.array(mealPlanTemplateSchema).nullable() });
const saveResponse = z
  .object({ template: z.object({ id: z.string() }).passthrough(), entriesCount: z.number() })
  .passthrough();
const applyResponse = z
  .object({
    entriesCreated: z.number(),
    recipeEntriesCreated: z.number().optional(),
    skipped: z.array(z.unknown()).optional().default([]),
  })
  .passthrough();
const updateResponse = z.object({ template: z.object({ id: z.string() }).passthrough() }).passthrough();

export interface ApiResult<T> {
  data: T | null;
  error: Error | null;
}

async function call<S extends z.ZodTypeAny>(
  body: Record<string, unknown>,
  schema: S
): Promise<ApiResult<z.output<S>>> {
  const { data, error } = await invokeEdgeFunction<unknown>(FUNCTION_NAME, { body });
  if (error) return { data: null, error };
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return {
      data: null,
      error: new Error(`Unexpected response from ${FUNCTION_NAME}: ${parsed.error.issues[0]?.message ?? "invalid shape"}`),
    };
  }
  return { data: parsed.data, error: null };
}

export interface ListTemplateFilters {
  season?: TemplateSeason;
  is_starter_template?: boolean;
  is_admin_template?: boolean;
}

export async function listTemplates(filters: ListTemplateFilters = {}): Promise<ApiResult<MealPlanTemplate[]>> {
  const res = await call({ action: "list", templateData: filters }, listResponse);
  return res.error ? { data: null, error: res.error } : { data: res.data?.templates ?? [], error: null };
}

export interface SaveWeekInput {
  startDate: string;
  endDate: string;
  kidId?: string;
  name: string;
  description?: string | null;
  season?: TemplateSeason;
  isFavorite?: boolean;
}

export interface SaveWeekResult {
  templateId: string;
  entriesCount: number;
}

/**
 * Save a planned week as a template. `saveFromWeek` ignores is_favorite, so a
 * favourite is set with a follow-up update; a failure there is reported but
 * the template itself was saved.
 */
export async function saveWeekAsTemplate(input: SaveWeekInput): Promise<ApiResult<SaveWeekResult>> {
  const res = await call(
    {
      action: "saveFromWeek",
      templateData: {
        startDate: input.startDate,
        endDate: input.endDate,
        kidId: input.kidId,
        name: input.name,
        description: input.description ?? null,
        season: input.season ?? "year_round",
        is_favorite: input.isFavorite ?? false,
      },
    },
    saveResponse
  );
  if (res.error || !res.data) return { data: null, error: res.error };
  const result: SaveWeekResult = { templateId: res.data.template.id, entriesCount: res.data.entriesCount };
  if (input.isFavorite) {
    const fav = await updateTemplate(result.templateId, {
      name: input.name,
      description: input.description ?? null,
      season: input.season ?? "year_round",
      is_favorite: true,
    });
    if (fav.error) return { data: result, error: fav.error };
  }
  return { data: result, error: null };
}

export interface ApplyTemplateInput {
  templateId: string;
  startDate: string;
  kidIds: string[];
  mode: "merge" | "replace";
}

export interface ApplyTemplateResult {
  entriesCreated: number;
  skippedCount: number;
}

export async function applyTemplate(input: ApplyTemplateInput): Promise<ApiResult<ApplyTemplateResult>> {
  const res = await call(
    {
      action: "apply",
      templateId: input.templateId,
      startDate: input.startDate,
      kidIds: input.kidIds,
      mode: input.mode,
    },
    applyResponse
  );
  if (res.error || !res.data) return { data: null, error: res.error };
  return { data: { entriesCreated: res.data.entriesCreated, skippedCount: res.data.skipped.length }, error: null };
}

export interface TemplateUpdate {
  name?: string;
  description?: string | null;
  season?: TemplateSeason;
  is_favorite?: boolean;
}

export async function updateTemplate(templateId: string, patch: TemplateUpdate): Promise<ApiResult<{ id: string }>> {
  const res = await call({ action: "update", templateId, templateData: patch }, updateResponse);
  return res.error || !res.data ? { data: null, error: res.error } : { data: { id: res.data.template.id }, error: null };
}

export async function deleteTemplate(templateId: string): Promise<ApiResult<true>> {
  const res = await call({ action: "delete", templateId }, z.unknown());
  return res.error ? { data: null, error: res.error } : { data: true, error: null };
}

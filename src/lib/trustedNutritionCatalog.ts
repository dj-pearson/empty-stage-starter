/**
 * The verified slice of the shared nutrition catalog the planner's macro
 * summaries read, loaded once per page.
 *
 * US-799/US-797: canonical catalog, named columns, verified rows only, a row
 * cap. The figures are per 100g; DailyMacrosSummary converts them per serving
 * through perServingFromCatalog, which refuses rows whose serving mass could
 * not be read. Verified-only in SQL too, so the 2000-row cap is spent on rows
 * that count.
 *
 * Memoized at module scope: family view mounts one week grid per child and
 * each used to run this 2000-row query on its own. A failed load clears the
 * memo so the next mount retries.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { TRUSTED_VERIFICATION } from "@/lib/catalogNutrition";
import type { NutritionData } from "@/types";

let trustedCatalogPromise: Promise<NutritionData[]> | null = null;

export function loadTrustedNutritionCatalog(): Promise<NutritionData[]> {
  if (!trustedCatalogPromise) {
    trustedCatalogPromise = Promise.resolve(
      supabase
        .from("grocery_product_catalog")
        .select(
          "name, name_normalized, verification, calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100, fiber_g_100, sodium_mg_100, serving_size_g, serving_size_text, ingredients",
        )
        .eq("verification", TRUSTED_VERIFICATION)
        .not("calories_kcal_100", "is", null)
        .limit(2000)
    ).then(({ data, error }) => {
      if (error || !data) {
        trustedCatalogPromise = null;
        if (error) logger.error("Failed to load nutrition catalog:", error);
        return [];
      }
      return data as NutritionData[];
    });
  }
  return trustedCatalogPromise;
}

/** Test seam: forget the memoized catalog. */
export function resetTrustedNutritionCatalog() {
  trustedCatalogPromise = null;
}

export function useTrustedNutritionCatalog(): NutritionData[] {
  const [rows, setRows] = useState<NutritionData[]>([]);
  useEffect(() => {
    let cancelled = false;
    void loadTrustedNutritionCatalog().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}

/** Lowercased-name index over the catalog, first row wins (as .find did). */
export function indexNutritionByName(rows: readonly NutritionData[]): Map<string, NutritionData> {
  const out = new Map<string, NutritionData>();
  for (const row of rows) {
    const key = row.name?.toLowerCase();
    if (key && !out.has(key)) out.set(key, row);
  }
  return out;
}

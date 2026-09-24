import type { TFunction } from "i18next";
import {
  summarizeExport,
  type AccountExportResult,
  type AccountExportTable,
} from "@/lib/accountExport";
import "@/i18n/appLocale";

/** The parent-facing name of one exported table. */
export function exportTableLabel(table: AccountExportTable, t: TFunction): string {
  switch (table) {
    case "kids":
      return t("settings.account.data.tables.kids", { defaultValue: "child profiles" });
    case "foods":
      return t("settings.account.data.tables.foods", { defaultValue: "foods" });
    case "recipes":
      return t("settings.account.data.tables.recipes", { defaultValue: "recipes" });
    case "plan_entries":
      return t("settings.account.data.tables.plan_entries", { defaultValue: "meal plans" });
    case "grocery_items":
      return t("settings.account.data.tables.grocery_items", { defaultValue: "grocery items" });
    case "grocery_lists":
      return t("settings.account.data.tables.grocery_lists", { defaultValue: "grocery lists" });
    case "food_attempts":
      return t("settings.account.data.tables.food_attempts", { defaultValue: "food history" });
    case "kid_food_ladder":
      return t("settings.account.data.tables.kid_food_ladder", { defaultValue: "food ladders" });
    case "kid_growth_events":
      return t("settings.account.data.tables.kid_growth_events", { defaultValue: "birthday check-ins" });
    case "recipe_attempts":
      return t("settings.account.data.tables.recipe_attempts", { defaultValue: "recipe ratings" });
    case "picky_win_preferences":
      return t("settings.account.data.tables.picky_win_preferences", { defaultValue: "sharing choices" });
    case "user_preferences":
      return t("settings.account.data.tables.user_preferences", { defaultValue: "app preferences" });
    case "user_accessibility_preferences":
      return t("settings.account.data.tables.user_accessibility_preferences", {
        defaultValue: "accessibility settings",
      });
    case "automation_email_subscriptions":
      return t("settings.account.data.tables.automation_email_subscriptions", {
        defaultValue: "email choices",
      });
    case "user_subscriptions":
      return t("settings.account.data.tables.user_subscriptions", { defaultValue: "subscription" });
    case "quiz_responses":
      return t("settings.account.data.tables.quiz_responses", { defaultValue: "quiz answers" });
    case "meal_plan_generations":
      return t("settings.account.data.tables.meal_plan_generations", {
        defaultValue: "generated meal plans",
      });
  }
}

/** Intl.ListFormat, which the project's TS lib target does not declare yet. */
type ListFormatCtor = new (
  locale: string,
  options: { style: "long"; type: "conjunction" }
) => { format: (items: string[]) => string };
const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;

/** "a, b and c" in the reader's language, or a plain join where unsupported. */
export function joinList(items: string[], locale: string): string {
  try {
    if (ListFormat) return new ListFormat(locale || "en", { style: "long", type: "conjunction" }).format(items);
  } catch {
    // An unknown locale tag throws; fall through to a plain join.
  }
  return items.join(", ");
}

/**
 * One line for the result of an export: "Exported 17 of 17 sections." or
 * "Exported 16 of 17 sections; food history couldn't be read, try again."
 * Never an unconditional success.
 */
export function exportSummaryText(
  result: AccountExportResult | null,
  failed: boolean,
  t: TFunction,
  locale: string
): string {
  if (failed || result === null) {
    return t("settings.account.data.exportFailed", {
      defaultValue: "The export couldn't start. Check your connection and try again.",
    });
  }
  const { ok, total, failed: failedTables } = summarizeExport(result);
  if (failedTables.length === 0) {
    return t("settings.account.data.exportDone", {
      defaultValue: "Exported {{ok}} of {{total}} sections. The file is in your downloads.",
      ok,
      total,
    });
  }
  return t("settings.account.data.exportPartial", {
    defaultValue: "Exported {{ok}} of {{total}} sections; {{missing}} couldn't be read, try again.",
    ok,
    total,
    missing: joinList(
      failedTables.map((table) => exportTableLabel(table, t)),
      locale
    ),
  });
}

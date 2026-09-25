import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import type { NavBadgeKey, NavBadgeValue } from "@/lib/navigation";

/**
 * "Grocery, 6 items left": the accessible name for a link carrying a badge.
 * With no badge it is just the label, so the name never changes shape between
 * a link that has one and one that does not.
 */
export type NavItemLabeler = (
  label: string,
  key: NavBadgeKey | undefined,
  value: NavBadgeValue | undefined
) => string;

export function useNavItemLabel(): NavItemLabeler {
  const { t } = useTranslation();
  return useCallback(
    (label, key, value) => {
      if (!key || !value) return label;
      let status: string;
      switch (key) {
        case "groceryLeft":
          status = t("navBadges.groceryLeft", {
            count: value.kind === "count" ? value.count : 0,
            defaultValue: "{{count}} items left",
            defaultValue_one: "{{count}} item left",
          });
          break;
        case "dinnerUnplanned":
          status = t("navBadges.dinnerUnplanned", { defaultValue: "no dinner planned today" });
          break;
        case "unloggedMeals":
          status = t("navBadges.unloggedMeals", {
            count: value.kind === "count" ? value.count : 0,
            defaultValue: "{{count}} meals to log",
            defaultValue_one: "{{count}} meal to log",
          });
          break;
        case "ladderDue":
          status = t("navBadges.ladderDue", {
            count: value.kind === "count" ? value.count : 0,
            defaultValue: "{{count}} foods to offer today",
            defaultValue_one: "{{count}} food to offer today",
          });
          break;
      }
      return t("navBadges.withStatus", { label, status, defaultValue: "{{label}}, {{status}}" });
    },
    [t]
  );
}

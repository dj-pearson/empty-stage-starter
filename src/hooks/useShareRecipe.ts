import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { analytics } from "@/lib/analytics";
import { shareRecipe } from "@/lib/recipeShareText";
import type { Food, Recipe } from "@/types";
import "@/i18n/appLocale";

/** shareRecipe plus analytics and the toast, for the share button and for menus. */
export function useShareRecipe() {
  const { t } = useTranslation();
  return useCallback(
    async (recipe: Recipe, foods: Food[] = []) => {
      const outcome = await shareRecipe(recipe, foods);
      if (outcome === "shared" || outcome === "copied") {
        analytics.trackEvent("recipe_shared", {
          recipe_id: recipe.id,
          recipe_name: recipe.name,
          platform: outcome === "shared" ? "native" : "copy_text",
        });
      }
      if (outcome === "copied") {
        toast.success(t("recipes.share.copied", { defaultValue: "Recipe copied. Paste it anywhere to share." }));
      } else if (outcome === "failed") {
        toast.error(t("recipes.share.failed", { defaultValue: "Couldn't share this recipe" }));
      }
      return outcome;
    },
    [t],
  );
}

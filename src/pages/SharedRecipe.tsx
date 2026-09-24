import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { ChefHat, Clock, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { toSharedRecipeView, type SharedRecipeView } from "@/lib/sharedRecipe";
import "@/i18n/appLocale";

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "ready"; recipe: SharedRecipeView };

/**
 * /r/:token, a recipe someone shared (item 10). Public and read-only: no
 * session needed, nothing from the sharer's household is fetched, and the
 * page is noindex so a private link never lands in search results.
 */
export default function SharedRecipe() {
  const { t } = useTranslation();
  const { token = "" } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_shared_recipe", { p_token: token });
        if (cancelled) return;
        if (error) throw error;
        const recipe = toSharedRecipeView(data);
        setState(recipe ? { status: "ready", recipe } : { status: "missing" });
      } catch (error) {
        if (cancelled) return;
        logger.error("Could not load a shared recipe:", error);
        setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const title =
    state.status === "ready"
      ? t("sharedRecipe.metaTitle", { defaultValue: "{{name}} - EatPal", name: state.recipe.name })
      : t("sharedRecipe.metaTitleFallback", { defaultValue: "A shared recipe - EatPal" });

  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>{title}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>

      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ChefHat className="h-5 w-5 text-primary" aria-hidden="true" />
            EatPal
          </Link>
          <Button asChild size="sm" variant="outline">
            <Link to="/auth?tab=signup">{t("sharedRecipe.signUpShort", { defaultValue: "Sign up free" })}</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        {state.status === "loading" ? (
          <div className="flex justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{t("sharedRecipe.loading", { defaultValue: "Loading the recipe" })}</span>
          </div>
        ) : state.status === "ready" ? (
          <RecipeBody recipe={state.recipe} />
        ) : (
          <section className="py-12 text-center" aria-labelledby="shared-missing">
            <h1 id="shared-missing" className="text-2xl font-semibold">
              {state.status === "missing"
                ? t("sharedRecipe.missingTitle", { defaultValue: "This link isn't active" })
                : t("sharedRecipe.errorTitle", { defaultValue: "Couldn't load this recipe" })}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-muted-foreground">
              {state.status === "missing"
                ? t("sharedRecipe.missingBody", {
                    defaultValue: "The person who shared it may have turned the link off. Ask them for a new one.",
                  })
                : t("sharedRecipe.errorBody", { defaultValue: "Check your connection and try again." })}
            </p>
            <Button asChild className="mt-6">
              <Link to="/">{t("sharedRecipe.home", { defaultValue: "Go to EatPal" })}</Link>
            </Button>
          </section>
        )}

        <section className="mt-10 rounded-2xl bg-muted p-5 md:p-6" aria-labelledby="shared-cta">
          <h2 id="shared-cta" className="text-lg font-semibold">
            {t("sharedRecipe.ctaTitle", { defaultValue: "Plan meals your picky eater will actually try" })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("sharedRecipe.ctaBody", {
              defaultValue:
                "Save recipes like this one, see which of your kids can eat them, and turn the week's plan into a grocery list.",
            })}
          </p>
          <Button asChild className="mt-4 h-11">
            <Link to="/auth?tab=signup">{t("sharedRecipe.cta", { defaultValue: "Create a free account" })}</Link>
          </Button>
        </section>
      </div>
    </main>
  );
}

function RecipeBody({ recipe }: { recipe: SharedRecipeView }) {
  const { t } = useTranslation();
  const hasTimes = recipe.prepMinutes != null || recipe.cookMinutes != null || recipe.totalMinutes != null;

  return (
    <article aria-labelledby="shared-title">
      {recipe.imageUrl && (
        <img
          src={recipe.imageUrl}
          alt=""
          className="mb-5 aspect-[16/9] w-full rounded-2xl object-cover"
          referrerPolicy="no-referrer"
        />
      )}
      <h1 id="shared-title" className="text-3xl font-bold leading-tight md:text-4xl">
        {recipe.name}
      </h1>

      {(hasTimes || recipe.servings) && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          {recipe.prepMinutes != null && (
            <li className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {t("sharedRecipe.prep", { defaultValue: "Prep {{count}} min", count: recipe.prepMinutes })}
            </li>
          )}
          {recipe.cookMinutes != null && (
            <li>{t("sharedRecipe.cook", { defaultValue: "Cook {{count}} min", count: recipe.cookMinutes })}</li>
          )}
          {recipe.totalMinutes != null && (
            <li className="font-medium text-foreground">
              {t("sharedRecipe.total", { defaultValue: "{{count}} min total", count: recipe.totalMinutes })}
            </li>
          )}
          {recipe.servings && (
            <li className="flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("sharedRecipe.servings", { defaultValue: "Serves {{servings}}", servings: recipe.servings })}
            </li>
          )}
        </ul>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="shared-ingredients">
          <h2 id="shared-ingredients" className="text-lg font-semibold">
            {t("sharedRecipe.ingredients", { defaultValue: "Ingredients" })}
          </h2>
          {recipe.groups.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("sharedRecipe.noIngredients", { defaultValue: "No ingredients listed." })}
            </p>
          ) : (
            recipe.groups.map((group) => (
              <div key={group.label || "_"} className="mt-3">
                {group.label && <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>}
                <ul className="mt-1 space-y-1.5">
                  {group.lines.map((line, i) => (
                    <li key={`${i}-${line}`} className="border-b border-border pb-1.5 text-[0.95rem]">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>

        <section aria-labelledby="shared-steps">
          <h2 id="shared-steps" className="text-lg font-semibold">
            {t("sharedRecipe.steps", { defaultValue: "Steps" })}
          </h2>
          {recipe.steps.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("sharedRecipe.noSteps", { defaultValue: "No steps written down." })}
            </p>
          ) : (
            <ol className="mt-3 max-w-prose space-y-4">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-primary" aria-hidden="true">
                    {i + 1}.
                  </span>
                  <p className="leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </article>
  );
}

import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, CircleDot, RefreshCw, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFoods, useKids } from "@/contexts/AppContext";
import { KidFitBadges } from "@/components/recipes/KidFitBadges";
import { TonightModeCard } from "@/components/TonightModeCard";
import { useTonightPlan, type TonightKidRow } from "@/hooks/useTonightPlan";
import { parseIsoDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

/** Link into the planner, opened on tonight's dinner. */
function plannerDinnerHref(todayKey: string): string {
  return `/dashboard/planner?date=${todayKey}&slot=dinner`;
}

const HERO_MIN_HEIGHT = "min-h-[168px]";

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function ResultMark({ row }: { row: TonightKidRow }) {
  const { t } = useTranslation();
  const result = row.dish?.result;
  if (!result) return null;
  const label = t(`home.tonight.result.${result}`, { defaultValue: result });
  if (result === "ate") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-safe-food">
        <Check className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  if (result === "tasted") {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-try-bite">
        <CircleDot className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
      <X className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The first thing a parent sees: what each kid is eating tonight, how it fits
 * them, and an allergen warning pinned above everything else when there is one.
 * With no dinner planned for anyone it becomes the "what's for dinner?" prompt,
 * so there is one place for tonight, not two.
 */
export const TonightHero = memo(function TonightHero() {
  const { t, i18n } = useTranslation();
  const { kidsHydrated, kidsLoadError, refreshKids, kids } = useKids();
  const { foodsHydrated } = useFoods();
  const plan = useTonightPlan();
  const { todayKey, rows, anyDinner, allergenRows } = plan;

  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(i18n.language || undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(parseIsoDate(todayKey));
    } catch {
      return todayKey;
    }
  }, [i18n.language, todayKey]);

  if (kidsLoadError && kids.length === 0) {
    return (
      <section
        aria-labelledby="home-tonight-heading"
        className={cn("rounded-xl border bg-card p-4 space-y-3", HERO_MIN_HEIGHT)}
      >
        <h2 id="home-tonight-heading" className="text-lg font-semibold">
          {t("home.tonight.title", { defaultValue: "Tonight" })}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("home.tonight.loadError", { defaultValue: "We couldn't load your children. Check your connection." })}
        </p>
        <Button variant="outline" size="sm" className="min-h-11" onClick={() => void refreshKids?.()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("home.tonight.retry", { defaultValue: "Try again" })}
        </Button>
      </section>
    );
  }

  if (!(kidsHydrated && foodsHydrated)) {
    return (
      <Skeleton
        className={cn("w-full rounded-xl motion-reduce:animate-none", HERO_MIN_HEIGHT)}
        aria-busy="true"
        aria-label={t("home.tonight.loading", { defaultValue: "Loading tonight's plan" })}
        data-testid="tonight-hero-skeleton"
      />
    );
  }

  // No children yet: the setup checklist owns that screen.
  if (kids.length === 0) return null;

  const plannerHref = plannerDinnerHref(todayKey);

  return (
    <section
      aria-labelledby="home-tonight-heading"
      className={cn("rounded-xl border bg-card p-4 space-y-3", HERO_MIN_HEIGHT)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-tonight-heading" className="text-lg font-semibold">
          {t("home.tonight.title", { defaultValue: "Tonight" })}
        </h2>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
      </div>

      {allergenRows.length > 0 && (
        <div role="alert" className="space-y-1.5 rounded-lg bg-destructive/10 p-3 text-destructive">
          {allergenRows.map((row) => {
            const allergen = row.conflicts[0]?.allergen ?? row.fit?.allergenKids[0]?.fit.allergen ?? "";
            return (
              <div key={row.kid.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t("home.tonight.allergenLine", {
                    defaultValue: "{{allergen}} in tonight's {{dish}}: {{kid}}",
                    allergen: capitalize(allergen),
                    dish: row.dishName ?? "",
                    kid: row.kid.name,
                  })}
                </p>
                <Link
                  to={plannerHref}
                  className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4"
                >
                  {t("home.tonight.swapFor", { defaultValue: "Swap for {{kid}}", kid: row.kid.name })}
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {anyDinner ? (
        <ul className="divide-y" aria-label={t("home.tonight.listLabel", { defaultValue: "Dinner for each child" })}>
          {rows.map((row) => (
            <li key={row.kid.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted-foreground">{row.kid.name}</p>
                {row.dish ? (
                  <>
                    <p className="truncate font-semibold">{row.dishName}</p>
                    {row.dish.isSubstitute && (
                      <p className="text-xs text-muted-foreground">
                        {t("home.tonight.separatePlate", { defaultValue: "Separate plate" })}
                      </p>
                    )}
                    <KidFitBadges fit={row.fit ?? undefined} mode="compact" className="mt-1.5" />
                  </>
                ) : (
                  <p className="text-sm">
                    <span className="text-muted-foreground">
                      {t("home.tonight.kidNothing", { defaultValue: "Nothing planned yet." })}
                    </span>{" "}
                    <Link to={plannerHref} className="font-medium text-primary underline-offset-4 hover:underline">
                      {t("home.tonight.planForKid", { defaultValue: "Plan for {{kid}}", kid: row.kid.name })}
                    </Link>
                  </p>
                )}
              </div>
              <ResultMark row={row} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("home.tonight.empty", { defaultValue: "Dinner isn't planned yet." })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={plannerHref} className={cn(buttonVariants(), "min-h-11")}>
              {t("home.tonight.planDinner", { defaultValue: "Plan dinner" })}
            </Link>
            <TonightModeCard variant="inline" />
          </div>
        </div>
      )}
    </section>
  );
});

import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { KidMealBuilder, resolveBuilderKid, type MealTarget } from "@/components/KidMealBuilder";
import { FeatureGate } from "@/components/FeatureGate";
import { SlotChip, isBuilderSlot, isIsoDay } from "@/components/mealBuilder/SlotChip";
import { useKids, usePlan } from "@/contexts/AppContext";
import { localIsoDate } from "@/components/foodTracker/ladderDates";
import { nextOpenSlot } from "@/lib/plateBuilder";
import "@/i18n/appLocale";

/** ?date=&slot= when both are usable; a past day is not. */
function targetFromParams(params: URLSearchParams, todayIso: string): MealTarget | null {
  const date = params.get("date");
  const slot = params.get("slot");
  if (!isIsoDay(date) || !isBuilderSlot(slot) || date < todayIso) return null;
  return { date, slot };
}

const quietLink =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function MealBuilder() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { kids, activeKidId, setActiveKid, kidsHydrated } = useKids();
  const { planEntries } = usePlan();

  const todayIso = localIsoDate(new Date());
  const [openedAt] = useState(() => new Date());
  const [override, setOverride] = useState<MealTarget | null>(() => targetFromParams(searchParams, todayIso));
  const [handMode, setHandMode] = useState(false);

  // ?kid= picks the child once, as soon as the list is known.
  const kidParamApplied = useRef(false);
  useEffect(() => {
    if (kidParamApplied.current || !kidsHydrated) return;
    kidParamApplied.current = true;
    const wanted = searchParams.get("kid");
    if (wanted && wanted !== activeKidId && kids.some((k) => k.id === wanted)) setActiveKid(wanted);
  }, [kidsHydrated, kids, activeKidId, searchParams, setActiveKid]);

  const kid = kidsHydrated ? resolveBuilderKid(kids, activeKidId) : null;
  const target: MealTarget = override ?? (kid ? nextOpenSlot(kid.id, planEntries, openedAt) : { date: todayIso, slot: "dinner" });

  const onTargetChange = useCallback((next: MealTarget) => setOverride(next), []);

  const title = kid
    ? t("mealBuilder.titleForKid", { name: kid.name, defaultValue: "Build {{name}}'s plate" })
    : t("mealBuilder.title", { defaultValue: "Meal Builder" });

  return (
    <>
      <Helmet>
        <title>{`${t("mealBuilder.meta.title", { defaultValue: "Build a plate with your child" })} - EatPal`}</title>
        <meta
          name="description"
          content={t("mealBuilder.meta.description", {
            defaultValue:
              "Build one meal with your child: a food they eat, a small try bite and something for the food group today is missing, then add it to the plan in one tap.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto max-w-2xl px-4 py-6">
        <header className="mb-4 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {kid && !handMode ? (
            <>
              <p className="text-sm text-muted-foreground">
                {t("mealBuilder.subtitle", {
                  name: kid.name,
                  defaultValue: "You choose what's offered. {{name}} picks from it.",
                })}
              </p>
              <SlotChip date={target.date} slot={target.slot} todayIso={todayIso} onChange={setOverride} />
            </>
          ) : null}
          {!handMode ? (
            <nav
              aria-label={t("mealBuilder.links.label", { defaultValue: "Related screens" })}
              className="flex flex-wrap gap-x-4"
            >
              <Link to="/dashboard/food-tracker" className={quietLink}>
                {t("mealBuilder.links.foodTracker", { defaultValue: "Log tries in Food Tracker" })}
              </Link>
              <Link to="/dashboard/planner" className={quietLink}>
                {t("mealBuilder.links.planner", { defaultValue: "Add anything else in the Planner" })}
              </Link>
            </nav>
          ) : null}
        </header>
        <FeatureGate
          feature="meal_builder"
          label={t("mealBuilder.title", { defaultValue: "Meal Builder" })}
          headingLevel={2}
        >
          <KidMealBuilder
            date={target.date}
            slot={target.slot}
            todayIso={todayIso}
            onTargetChange={onTargetChange}
            handMode={handMode}
            onHandModeChange={setHandMode}
          />
        </FeatureGate>
      </div>
    </>
  );
}

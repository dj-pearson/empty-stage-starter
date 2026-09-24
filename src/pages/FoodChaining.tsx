import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { FoodChainingRecommendations } from "@/components/FoodChainingRecommendations";
import { FeatureGate } from "@/components/FeatureGate";
import { KidChips } from "@/components/foodTracker/KidChips";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useExposureLadderFlag } from "@/hooks/useExposureLadderFlag";
import { LADDER_SELECT } from "@/hooks/useKidsProgressSummary";
import { useFoods, useKids } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { localIsoDate } from "@/components/foodTracker/ladderDates";
import { groupLadder, selectNextStep, toOverviewRow, type LadderRowLike, type OverviewRow } from "@/lib/ladderOverview";
import { analytics } from "@/lib/analytics";
import { logger } from "@/lib/logger";
import type { Food, Kid } from "@/types";
import "@/i18n/appLocale";

type LadderOverviewRow = OverviewRow & { foodId: string };

/**
 * The active child, or the only child when none is active. Same rule as
 * KidMealBuilder's resolveBuilderKid, kept local so this route does not pull
 * the whole meal builder chunk in for four lines.
 */
function resolvePageKid(kids: readonly Kid[], activeKidId: string | null): Kid | null {
  const active = activeKidId ? kids.find((k) => k.id === activeKidId) : undefined;
  if (active) return active;
  return kids.length === 1 ? kids[0] : null;
}

interface LadderRead {
  kidId: string;
  rows: LadderOverviewRow[];
}

/**
 * One line pointing at the ladder on Food Tracker, naming the food worth
 * attention next.
 *
 * Read-only on purpose: useFoodLadder syncs plan attempts into
 * kid_food_ladder on mount, and this line renders outside the gate, so it
 * must not be the thing that writes. One select for this child, nothing else. A failed read falls back to the plain
 * "see the ladder" line; the link matters more than the detail.
 */
function LadderSummaryLink({ kid, foodsById }: { kid: Kid; foodsById: ReadonlyMap<string, Food> }) {
  const { t } = useTranslation();
  const [read, setRead] = useState<LadderRead | null>(null);
  const shownFor = useRef<string | null>(null);
  const kidId = kid.id;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.from("kid_food_ladder").select(LADDER_SELECT).eq("kid_id", kidId);
        if (cancelled) return;
        if (error) logger.warn("Food chaining: ladder read failed", error);
        const raw = (error ? [] : (data ?? [])) as LadderRowLike[];
        setRead({ kidId, rows: raw.map(toOverviewRow) });
      } catch (error) {
        if (cancelled) return;
        logger.warn("Food chaining: ladder read failed", error);
        setRead({ kidId, rows: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kidId]);

  const loaded = read !== null && read.kidId === kidId;
  const today = localIsoDate();
  // selectNextStep skips a food that is neither due, close nor resting; the
  // soonest-due food still being worked on is a better line than none.
  const nextFoodId = useMemo(() => {
    if (!loaded) return null;
    const step = selectNextStep(read.rows, today);
    if (step) return step.row.foodId;
    return groupLadder(read.rows, today).workingOn[0]?.foodId ?? null;
  }, [loaded, read, today]);
  const nextFood = nextFoodId ? foodsById.get(nextFoodId) : undefined;

  useEffect(() => {
    if (!loaded || shownFor.current === kidId) return;
    shownFor.current = kidId;
    analytics.trackEvent("ladder_link_shown", {
      surface: "food_chaining",
      has_next: Boolean(nextFood),
    });
  }, [loaded, kidId, nextFood]);

  if (!loaded) {
    // Same height as the link, so the recommendations below do not jump.
    return (
      <p className="flex min-h-11 items-center text-sm text-muted-foreground" aria-busy="true">
        {t("foodChaining.shell.ladderLoading", {
          defaultValue: "Checking {{kid}}'s ladder",
          kid: kid.name,
        })}
      </p>
    );
  }

  const to = nextFood
    ? `/dashboard/food-tracker?food=${encodeURIComponent(nextFood.id)}`
    : "/dashboard/food-tracker";
  const label = nextFood
    ? t("foodChaining.shell.ladderNext", {
        defaultValue: "Next on {{kid}}'s ladder: {{food}}",
        kid: kid.name,
        food: nextFood.name,
      })
    : t("foodChaining.shell.ladderNone", {
        defaultValue: "See where {{kid}}'s foods sit on the ladder",
        kid: kid.name,
      });

  return (
    <p className="text-sm">
      <Link
        to={to}
        onClick={() =>
          analytics.trackEvent("ladder_link_clicked", {
            surface: "food_chaining",
            has_next: Boolean(nextFood),
          })
        }
        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
      >
        {label}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </p>
  );
}

/** Mounted only inside the gate's children, so it runs only when the gate lets the page through. */
function GateOpenSignal({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    onOpen();
  }, [onOpen]);
  return null;
}

function ChainingExplainer() {
  const { t } = useTranslation();
  return (
    <details className="rounded-xl border bg-background px-4">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {t("foodChaining.shell.explainer.summary", { defaultValue: "How food chaining works" })}
      </summary>
      <div className="space-y-2 pb-4 text-sm text-muted-foreground">
        <p>{t("foodChaining.shell.explainer.line1", { defaultValue: "Start from a food your child already eats." })}</p>
        <p>
          {t("foodChaining.shell.explainer.line2", {
            defaultValue:
              "Each next link changes one thing about it: the taste, the texture, the color or the shape.",
          })}
        </p>
        <p>
          {t("foodChaining.shell.explainer.line3", {
            defaultValue:
              "Offer a link a few times before moving on. A refusal is part of learning, not a failure.",
          })}
        </p>
        <p className="text-foreground">
          {t("foodChaining.shell.explainer.example", {
            defaultValue: "For example: plain pasta, then buttered pasta, then pasta with a little sauce.",
          })}
        </p>
      </div>
    </details>
  );
}

interface ChainTarget {
  foodId: string;
  /** The child the link named, or null when it named none (whichever child the parent picks). */
  kidId: string | null;
}

export default function FoodChaining() {
  const { t } = useTranslation();
  const { kids, activeKidId, setActiveKid, kidsHydrated } = useKids();
  const { foods, foodsHydrated } = useFoods();
  const [searchParams, setSearchParams] = useSearchParams();
  const kid = resolvePageKid(kids, activeKidId);
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);

  // US-296: the community-wins surface flag. Default OFF.
  const pickyWinEnabled = useFeatureFlag("picky_win_network", false);
  // US-601: the ladder lives on Food Tracker; this page keeps a one-line link
  // to it. On by default; the flag is a kill switch (useExposureLadderFlag).
  const ladderEnabled = useExposureLadderFlag();

  // Deep link (?kid=&food=), read once both slices are in. Unknown ids are
  // ignored, and both params are stripped either way so a reload or a share
  // does not re-apply a stale target.
  const [target, setTarget] = useState<ChainTarget | null>(null);
  const deepLinkRead = useRef(false);
  useEffect(() => {
    if (deepLinkRead.current || !kidsHydrated || !foodsHydrated) return;
    deepLinkRead.current = true;
    const kidParam = searchParams.get("kid");
    const foodParam = searchParams.get("food");
    if (kidParam === null && foodParam === null) return;

    const linkedKid = kidParam ? kids.find((k) => k.id === kidParam) : undefined;
    if (linkedKid) setActiveKid(linkedKid.id);
    if (foodParam && foods.some((f) => f.id === foodParam)) {
      setTarget({ foodId: foodParam, kidId: linkedKid?.id ?? resolvePageKid(kids, activeKidId)?.id ?? null });
    }
    const next = new URLSearchParams(searchParams);
    next.delete("kid");
    next.delete("food");
    setSearchParams(next, { replace: true });
  }, [kidsHydrated, foodsHydrated, searchParams, setSearchParams, kids, foods, activeKidId, setActiveKid]);

  // One child and nobody active: make it active, so every other surface
  // (and the shell's selector) agrees on who this page is about.
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !kidsHydrated) return;
    if (kids.length === 1 && activeKidId === null) {
      autoSelected.current = true;
      setActiveKid(kids[0].id);
    }
  }, [kidsHydrated, kids, activeKidId, setActiveKid]);

  // A target follows the child it was opened for; switching to another child
  // drops it rather than bridging their chains toward someone else's food.
  const targetFoodId = target && kid && (target.kidId === null || target.kidId === kid.id) ? target.foodId : null;

  // picky_win_tab_opened: once per visit, only once the gate has let the page
  // through, and only with the community-wins flag on.
  const [gateOpen, setGateOpen] = useState(false);
  const markGateOpen = useCallback(() => setGateOpen(true), []);
  const pickyWinTracked = useRef(false);
  useEffect(() => {
    if (!gateOpen || !pickyWinEnabled || pickyWinTracked.current) return;
    pickyWinTracked.current = true;
    analytics.trackEvent("picky_win_tab_opened", { surface: "food_chaining" });
  }, [gateOpen, pickyWinEnabled]);

  const title = kid
    ? t("foodChaining.shell.titleForKid", { defaultValue: "{{name}}'s food chains", name: kid.name })
    : t("foodChaining.shell.title", { defaultValue: "Food Chaining" });
  const gateLabel = t("foodChaining.shell.title", { defaultValue: "Food Chaining" });
  const noKids = kidsHydrated && kids.length === 0;

  return (
    <>
      <Helmet>
        <title>{t("foodChaining.shell.meta.title", { defaultValue: "Food Chaining - EatPal" })}</title>
        <meta
          name="description"
          content={t("foodChaining.shell.meta.description", {
            defaultValue:
              "Plan small steps from the foods your child already eats toward new ones, one change at a time.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div id="main-content" className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>

        <KidChips
          showFamily={false}
          ariaLabel={t("foodChaining.shell.chooseChild", { defaultValue: "Choose a child" })}
        />

        {noKids ? (
          <p className="text-sm">
            <Link
              to="/dashboard/kids"
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("foodChaining.shell.noKids", { defaultValue: "Add a child to start a chain" })}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
        ) : null}

        {kidsHydrated && !kid && kids.length > 1 ? (
          <p className="text-sm text-muted-foreground">
            {t("foodChaining.shell.whoseChains", {
              defaultValue: "Whose chains? Pick a child to see their next small step.",
            })}
          </p>
        ) : null}

        {ladderEnabled && kid ? <LadderSummaryLink kid={kid} foodsById={foodsById} /> : null}

        <FeatureGate feature="food_chaining" label={gateLabel} headingLevel={2}>
          <GateOpenSignal onOpen={markGateOpen} />
          {kid ? <FoodChainingRecommendations key={kid.id} kid={kid} targetFoodId={targetFoodId} /> : null}
        </FeatureGate>

        <ChainingExplainer />
      </div>
    </>
  );
}

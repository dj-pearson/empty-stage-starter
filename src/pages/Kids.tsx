import { Helmet } from "react-helmet-async";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CakeSlice, RefreshCw, ShieldAlert, UserPlus, Users2, Utensils } from "lucide-react";
import "@/i18n/appLocale";
import { useFoods, useKids, usePlan } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { analytics } from "@/lib/analytics";
import { canonicalAllergen } from "@/lib/allergens";
import { toISODate } from "@/lib/date-utils";
import { buildProgressByKid } from "@/lib/kidProgress";
import { useKidsProgressSummary } from "@/hooks/useKidsProgressSummary";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ManageKidsDialog, ManageKidsDialogRef } from "@/components/ManageKidsDialog";
import { ChildProfileCard } from "@/components/ChildProfileCard";
import type { Kid } from "@/types";

// Only opened on demand, and it is the heaviest thing on the page.
const ChildIntakeQuestionnaire = lazy(() =>
  import("@/components/ChildIntakeQuestionnaire").then((m) => ({ default: m.ChildIntakeQuestionnaire })),
);

const cardDomId = (kidId: string) => `kid-card-${kidId}`;

/** Short, unique labels for the allergen chips: initials, or the first name when initials collide. */
function kidShortLabels(kids: readonly Kid[]): Map<string, string> {
  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const counts = new Map<string, number>();
  for (const kid of kids) counts.set(initials(kid.name), (counts.get(initials(kid.name)) ?? 0) + 1);
  const out = new Map<string, string>();
  for (const kid of kids) {
    const short = initials(kid.name);
    out.set(kid.id, (counts.get(short) ?? 0) > 1 ? kid.name.trim().split(/\s+/)[0] || short : short);
  }
  return out;
}

interface HouseholdAllergen {
  key: string;
  label: string;
  kids: Kid[];
}

/** The union of every child's allergens, folded onto canonical names. */
function householdAllergens(kids: readonly Kid[]): HouseholdAllergen[] {
  const byKey = new Map<string, HouseholdAllergen>();
  for (const kid of kids) {
    for (const raw of kid.allergens ?? []) {
      const key = canonicalAllergen(raw);
      if (!key) continue;
      const entry = byKey.get(key) ?? { key, label: key.charAt(0).toUpperCase() + key.slice(1), kids: [] };
      if (!entry.kids.some((k) => k.id === kid.id)) entry.kids.push(kid);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => b.kids.length - a.kids.length || a.label.localeCompare(b.label));
}

export default function Kids() {
  const { t } = useTranslation();
  const { kids, kidsHydrated, kidsLoadError, refreshKids, setActiveKid } = useKids();
  const { planEntries } = usePlan();
  const { foods } = useFoods();
  const prefersReducedMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const manageKidsRef = useRef<ManageKidsDialogRef>(null);
  const [questionnaireKidId, setQuestionnaireKidId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [retrying, setRetrying] = useState(false);

  const kidIds = useMemo(() => kids.map((k) => k.id), [kids]);
  const { ladderRows, attempts } = useKidsProgressSummary(kidIds);

  // Ladder rows carry only a food id; without names every card reads "A food".
  const foodNames = useMemo(() => new Map(foods.map((f) => [f.id, f.name])), [foods]);

  const progressByKid = useMemo(
    () => buildProgressByKid(kids, planEntries, toISODate(new Date()), ladderRows, attempts, foodNames),
    [kids, planEntries, ladderRows, attempts, foodNames],
  );

  // Derived, so an edit elsewhere (realtime, the quick-edit dialog) reaches
  // the open questionnaire, and a deleted child closes it.
  const questionnaireKid = useMemo(
    () => (questionnaireKidId ? kids.find((k) => k.id === questionnaireKidId) ?? null : null),
    [kids, questionnaireKidId],
  );
  useEffect(() => {
    if (questionnaireKidId && kidsHydrated && !questionnaireKid) setQuestionnaireKidId(null);
  }, [questionnaireKidId, questionnaireKid, kidsHydrated]);

  // One status region for discrete outcomes. Adds and removals are read off
  // the list itself, so they are announced whichever dialog made them.
  const previousKidsRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!kidsHydrated) {
      previousKidsRef.current = null;
      return;
    }
    const current = new Map(kids.map((k) => [k.id, k.name]));
    const previous = previousKidsRef.current;
    previousKidsRef.current = current;
    if (!previous) return;
    const added = kids.find((k) => !previous.has(k.id));
    const removed = [...previous.entries()].find(([id]) => !current.has(id));
    if (added) setStatusMessage(t("kids.status.added", { name: added.name }));
    else if (removed) setStatusMessage(t("kids.status.removed", { name: removed[1] }));
  }, [kids, kidsHydrated, t]);

  const openAdd = useCallback(() => manageKidsRef.current?.openForAdd(), []);
  const handleEdit = useCallback((kidId: string) => manageKidsRef.current?.openForEdit(kidId), []);
  const handleCompleteProfile = useCallback((kid: Kid) => setQuestionnaireKidId(kid.id), []);
  const handleQuestionnaireOpenChange = useCallback((open: boolean) => {
    if (!open) setQuestionnaireKidId(null);
  }, []);
  const handleQuestionnaireComplete = useCallback(() => {
    // The questionnaire toasts on its own; this is only for screen readers.
    const name = questionnaireKid?.name ?? "";
    setStatusMessage(t("kids.status.saved", { name }));
  }, [questionnaireKid, t]);

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await refreshKids();
    } finally {
      setRetrying(false);
    }
  }, [refreshKids]);

  // Deep links: ?kid=<id>[&edit=1|&intake=1] and ?add=1. Acted on once the
  // list is real, then cleared so a refresh or Back does not replay them.
  useEffect(() => {
    if (!kidsHydrated) return;
    const kidId = searchParams.get("kid");
    const wantsAdd = searchParams.get("add") === "1";
    if (!kidId && !wantsAdd) return;

    if (kidId) {
      if (!kids.some((k) => k.id === kidId)) return;
      setActiveKid(kidId);
      const wantsEdit = searchParams.get("edit") === "1";
      const wantsIntake = searchParams.get("intake") === "1";
      requestAnimationFrame(() => {
        const card = document.getElementById(cardDomId(kidId));
        if (!card) return;
        card.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
        const heading = card.querySelector<HTMLElement>("h2, h3, h4");
        const target = heading ?? card;
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
      if (wantsEdit) manageKidsRef.current?.openForEdit(kidId);
      else if (wantsIntake) setQuestionnaireKidId(kidId);
    } else if (wantsAdd) {
      manageKidsRef.current?.openForAdd();
    }

    const next = new URLSearchParams(searchParams);
    for (const key of ["kid", "edit", "intake", "add"]) next.delete(key);
    setSearchParams(next, { replace: true });
  }, [kidsHydrated, kids, searchParams, setSearchParams, setActiveKid, prefersReducedMotion]);

  const shortLabels = useMemo(() => kidShortLabels(kids), [kids]);
  const allergens = useMemo(() => householdAllergens(kids), [kids]);
  const kidsMissingAllergyInfo = useMemo(() => kids.filter((k) => k.allergens === undefined), [kids]);

  const showSkeleton = !kidsHydrated;
  const showEmpty = kidsHydrated && kids.length === 0;
  const showAddInHeader = kidsHydrated && kids.length > 0;

  const loadErrorAlert = kidsLoadError ? (
    <Alert className="mb-6">
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("kids.loadError.message")}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          disabled={retrying}
          className="w-full gap-2 sm:w-auto"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("kids.loadError.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  return (
    <div className="min-h-screen pt-4 pb-20 md:pt-24 bg-background">
      <Helmet>
        <title>{t("kids.meta.title")}</title>
        <meta name="description" content={t("kids.meta.description")} />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t("kids.title")}</h1>
            <p className="text-muted-foreground">{t("kids.subtitle")}</p>
          </div>
          {showAddInHeader && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button onClick={openAdd} className="w-full gap-2 sm:w-auto">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {t("kids.addChild")}
              </Button>
              {/* US-295: same target as the Recipes-page CTA; only useful with two or more kids. */}
              {kids.length >= 2 && (
                <Button
                  asChild
                  variant="outline"
                  className="w-full gap-2 sm:w-auto"
                  onClick={() =>
                    analytics.trackEvent("family_finder_opened", {
                      source: "kids_header",
                      kid_count: kids.length,
                    })
                  }
                >
                  <Link to="/dashboard/sibling-meal-finder">
                    <Users2 className="h-4 w-4" aria-hidden="true" />
                    {t("kids.findFamilyMeal")}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        {showSkeleton && (
          <div
            className="grid gap-6 grid-cols-1 xl:grid-cols-2"
            aria-busy="true"
            aria-label={t("kids.skeletonLabel")}
          >
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        )}

        {showEmpty && (
          <div className="max-w-2xl mx-auto">
            {loadErrorAlert ?? (
              <Card>
                <CardContent className="p-6 sm:p-8">
                  <h2 className="text-2xl font-bold mb-2">{t("kids.emptyTitle")}</h2>
                  <p className="text-muted-foreground mb-6">{t("kids.emptyText")}</p>
                  <ol className="space-y-4 mb-8">
                    {[
                      { icon: CakeSlice, key: "kids.empty.steps.basics" },
                      { icon: ShieldAlert, key: "kids.empty.steps.allergies" },
                      { icon: Utensils, key: "kids.empty.steps.safeFoods" },
                    ].map(({ icon: Icon, key }, index) => (
                      <li key={key} className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                          {index + 1}
                        </span>
                        <Icon className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <h3 className="text-base font-medium leading-7">{t(key)}</h3>
                      </li>
                    ))}
                  </ol>
                  <Button onClick={openAdd} size="lg" className="w-full gap-2 sm:w-auto">
                    <UserPlus className="h-5 w-5" aria-hidden="true" />
                    {t("kids.addChild")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {kidsHydrated && kids.length > 0 && (
          <>
            {loadErrorAlert}

            <section aria-labelledby="household-allergens-title" className="mb-6">
              <h2 id="household-allergens-title" className="text-sm font-semibold mb-2">
                {t("kids.household.allergensTitle")}
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                {allergens.map((allergen) => (
                  <span
                    key={allergen.key}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm text-destructive"
                    aria-label={t("kids.household.chipLabel", {
                      allergen: allergen.label,
                      names: allergen.kids.map((k) => k.name).join(", "),
                    })}
                  >
                    <span className="font-medium">{allergen.label}</span>
                    {kids.length > 1 && (
                      <span className="text-xs text-muted-foreground" aria-hidden="true">
                        {allergen.kids.map((k) => shortLabels.get(k.id)).join(" ")}
                      </span>
                    )}
                  </span>
                ))}
                {kidsMissingAllergyInfo.map((kid) => (
                  <Link
                    key={kid.id}
                    to={`/dashboard/kids?kid=${encodeURIComponent(kid.id)}&edit=1`}
                    className="inline-flex shrink-0 items-center rounded-full border border-dashed px-3 py-1 text-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("kids.household.missingInfo", { name: kid.name })}
                  </Link>
                ))}
                {allergens.length === 0 && kidsMissingAllergyInfo.length === 0 && (
                  <span className="text-sm text-muted-foreground">{t("kids.household.noAllergens")}</span>
                )}
              </div>
            </section>

            <ul className="grid gap-6 grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3">
              {kids.map((kid) => (
                <li key={kid.id} id={cardDomId(kid.id)} className="scroll-mt-24">
                  <ChildProfileCard
                    kid={kid}
                    progress={progressByKid.get(kid.id)}
                    onEdit={handleEdit}
                    onCompleteProfile={handleCompleteProfile}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        <ManageKidsDialog ref={manageKidsRef} />

        {questionnaireKid && (
          <Suspense fallback={null}>
            <ChildIntakeQuestionnaire
              key={questionnaireKid.id}
              open
              onOpenChange={handleQuestionnaireOpenChange}
              kidId={questionnaireKid.id}
              kidName={questionnaireKid.name}
              onComplete={handleQuestionnaireComplete}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useKids, useFoods, usePlan, useGrocery } from "@/contexts/AppContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTodayKey } from "@/hooks/useTonightPlan";
import { getSetupSteps, nextStep, type SetupStepId } from "@/lib/setupSteps";
import { InlineAddKid } from "@/components/home/InlineAddKid";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

const STEP_DEFAULTS: Record<SetupStepId, { label: string; hint: string }> = {
  kid: { label: "Add your child", hint: "Name, age and allergies. Takes a minute." },
  foods: { label: "Pick safe foods", hint: "Three foods your child reliably eats." },
  plan: { label: "Plan tonight's dinner", hint: "One dinner is enough to start." },
  grocery: { label: "Start a grocery list", hint: "Add what you need for the week." },
};

function stepHref(id: SetupStepId, todayKey: string): string | null {
  switch (id) {
    case "foods":
      return "/dashboard/pantry";
    case "plan":
      return `/dashboard/planner?date=${todayKey}&slot=dinner`;
    case "grocery":
      return "/dashboard/grocery";
    default:
      return null;
  }
}

/**
 * The first-run checklist on /dashboard: add a child, pick safe foods, plan a
 * dinner, start a grocery list. Only the next undone step is actionable; the
 * rest are plain text so a new parent has one obvious thing to tap.
 *
 * Renders nothing until kids, foods and grocery are hydrated (a loading
 * account must not be told to add the child it already has) and nothing once
 * every step is done. Adding a child happens inline, without leaving the page.
 */
export function SetupChecklist() {
  const { t } = useTranslation();
  const { kids, kidsHydrated } = useKids();
  const { foods, foodsHydrated } = useFoods();
  const { planEntries } = usePlan();
  const { groceryItems, groceryHydrated } = useGrocery();
  const reduceMotion = useReducedMotion();
  const todayKey = useTodayKey();
  const [addingKid, setAddingKid] = useState(false);

  const steps = useMemo(
    () =>
      getSetupSteps({
        kids,
        foods,
        planEntries,
        groceryItems,
        hydrated: kidsHydrated && foodsHydrated && groceryHydrated,
        todayKey,
      }),
    [kids, foods, planEntries, groceryItems, kidsHydrated, foodsHydrated, groceryHydrated, todayKey],
  );

  if (!steps) return null;
  const allDone = steps.every((s) => s.done);
  // Keep the inline form up after the first child lands so "Add another
  // child" is still reachable, even though the kid step is now done.
  if (allDone && !addingKid) return null;

  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const next = nextStep(steps);
  const progressLabel = t("setup.progressLabel", {
    done: completed,
    total,
    defaultValue: "Setup progress: {{done}} of {{total}} steps done",
  });

  const label = (id: SetupStepId) => t(`setup.steps.${id}`, { defaultValue: STEP_DEFAULTS[id].label });
  const hint = (id: SetupStepId) => t(`setup.hints.${id}`, { defaultValue: STEP_DEFAULTS[id].hint });

  return (
    <section aria-labelledby="setup-checklist-title" className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="setup-checklist-title" className="text-base font-semibold text-foreground">
          {t("setup.title", { defaultValue: "Get set up" })}
        </h2>
        <span className="text-sm text-muted-foreground" aria-hidden="true">
          {t("setup.stepCount", { done: completed, total, defaultValue: "{{done}} of {{total}}" })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-label={progressLabel}
        className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full bg-primary", !reduceMotion && "transition-[width] duration-300")}
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </div>

      <ol className="space-y-1">
        {steps.map((step, index) => {
          const isNext = next?.id === step.id;
          if (step.done) {
            return (
              <li key={step.id} className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span>{label(step.id)}</span>
                <span className="sr-only">{t("setup.done", { defaultValue: "Done" })}</span>
              </li>
            );
          }
          if (isNext) {
            const href = stepHref(step.id, todayKey);
            return (
              <li key={step.id} className="space-y-2 py-1">
                <p className="text-sm text-muted-foreground">{hint(step.id)}</p>
                {href ? (
                  <Link to={href} className={cn(buttonVariants(), "min-h-11 w-full sm:w-auto")}>
                    {label(step.id)}
                  </Link>
                ) : (
                  !addingKid && (
                    <Button
                      type="button"
                      className="min-h-11 w-full sm:w-auto"
                      onClick={() => setAddingKid(true)}
                    >
                      {label(step.id)}
                    </Button>
                  )
                )}
              </li>
            );
          }
          return (
            <li key={step.id} className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span>{label(step.id)}</span>
            </li>
          );
        })}
      </ol>

      {addingKid && (
        <div className="mt-3">
          <InlineAddKid onClose={() => setAddingKid(false)} />
        </div>
      )}
    </section>
  );
}

/** Kept so existing default imports keep compiling. */
export const OnboardingProgressBar = SetupChecklist;
export default SetupChecklist;

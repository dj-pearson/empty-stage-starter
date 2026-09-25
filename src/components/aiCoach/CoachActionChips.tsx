import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Check, Loader2, ShoppingCart, TrendingUp, Utensils } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type { CoachAction, CoachActionType } from "@/lib/coachReply";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

export interface CoachActionChipsProps {
  actions: CoachAction[];
  onRun: (a: CoachAction) => void;
  pending: Set<string>;
  done: Set<string>;
  disabled?: boolean;
}

type TFunction = ReturnType<typeof useTranslation>["t"];

const ORDER: Record<CoachActionType, number> = { try_bite: 0, ladder: 1, grocery: 2 };

const ICONS: Record<CoachActionType, typeof Utensils> = {
  try_bite: Utensils,
  ladder: TrendingUp,
  grocery: ShoppingCart,
};

const SEVERITY_DEFAULTS: Record<string, string> = {
  severe: "severe",
  moderate: "moderate",
  mild: "mild",
  unrecorded: "severity not recorded",
};

function coachActionLabel(t: TFunction, a: CoachAction): string {
  const food = a.food.name;
  switch (a.type) {
    case "try_bite":
      return t("aiCoach.actions.tryBite", { defaultValue: "Try bite: {{food}}", food });
    case "ladder":
      return t("aiCoach.actions.ladder", { defaultValue: "Add to ladder: {{food}}", food });
    default:
      return t("aiCoach.actions.grocery", { defaultValue: "Add to grocery: {{food}}", food });
  }
}

function severityLabel(t: TFunction, severity: string): string {
  return t(`aiCoach.severity.${severity}`, { defaultValue: SEVERITY_DEFAULTS[severity] ?? severity });
}

/**
 * Up to three chips under a coach reply. A blocked chip stays on screen,
 * struck in destructive text with the conflict next to it, so the parent sees
 * why the coach's suggestion is not one tap away. A confirm chip asks first,
 * with Cancel as the default focus. Results are announced once through a
 * polite live region.
 */
export const CoachActionChips = memo(function CoachActionChips({
  actions,
  onRun,
  pending,
  done,
  disabled = false,
}: CoachActionChipsProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const baseId = useId();
  const [confirming, setConfirming] = useState<CoachAction | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const sorted = useMemo(
    () => [...actions].sort((a, b) => ORDER[a.type] - ORDER[b.type]),
    [actions],
  );

  // Announce a chip the moment it turns done, and only then.
  const seenDone = useRef<Set<string> | null>(null);
  useEffect(() => {
    const prev = seenDone.current;
    seenDone.current = new Set(done);
    if (prev === null) return;
    const fresh = sorted.find((a) => done.has(a.key) && !prev.has(a.key));
    if (fresh) {
      setAnnouncement(t("aiCoach.actions.done", { defaultValue: "Done: {{label}}", label: coachActionLabel(t, fresh) }));
    }
  }, [done, sorted, t]);

  if (sorted.length === 0) return null;

  const confirmCopy = (a: CoachAction) => {
    const food = a.food.name;
    if (a.reason && a.reason.allergen) {
      const { allergen, severity } = a.reason;
      if (severity === "severe") {
        return {
          title: t("aiCoach.actions.confirmSevereTitle", { defaultValue: "Severe {{allergen}} allergy", allergen }),
          body: t("aiCoach.actions.confirmSevereBody", {
            defaultValue: "{{food}} contains {{allergen}}. Your child has a severe {{allergen}} allergy.",
            food,
            allergen,
          }),
        };
      }
      return {
        title: t("aiCoach.actions.confirmAllergenTitle", { defaultValue: "Allergen check" }),
        body: t("aiCoach.actions.confirmAllergenBody", {
          defaultValue: "{{food}} contains {{allergen}}, which your child is allergic to ({{severity}}).",
          food,
          allergen,
          severity: severityLabel(t, severity),
        }),
      };
    }
    return {
      title: t("aiCoach.actions.confirmUnknownTitle", { defaultValue: "Allergies not recorded" }),
      body: t("aiCoach.actions.confirmUnknown", {
        defaultValue:
          "This child's allergies aren't recorded, so {{food}} wasn't checked. Make sure it's safe before adding it.",
        food,
      }),
    };
  };

  const copy = confirming ? confirmCopy(confirming) : null;

  return (
    <>
      <ul
        aria-label={t("aiCoach.actions.label", { defaultValue: "Quick actions" })}
        className="flex flex-wrap gap-2"
      >
        {sorted.map((a) => {
          const label = coachActionLabel(t, a);
          const isPending = pending.has(a.key);
          const isDone = done.has(a.key);

          if (a.status === "blocked") {
            const reasonId = `${baseId}-${a.key}`;
            return (
              <li key={a.key} className="flex flex-wrap items-center gap-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-disabled="true"
                  aria-describedby={reasonId}
                  onClick={(e) => e.preventDefault()}
                  className="min-h-11 cursor-not-allowed gap-1.5 text-destructive hover:bg-transparent hover:text-destructive"
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  {label}
                </Button>
                <span id={reasonId} className="text-xs text-destructive">
                  {t("aiCoach.actions.contains", {
                    defaultValue: "Contains {{allergen}} ({{severity}})",
                    allergen: a.reason?.allergen ?? "",
                    severity: severityLabel(t, a.reason?.severity ?? "unrecorded"),
                  })}
                </span>
              </li>
            );
          }

          const Icon = isDone ? Check : isPending ? Loader2 : ICONS[a.type];
          return (
            <li key={a.key}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || isPending}
                aria-disabled={isDone || undefined}
                aria-busy={isPending || undefined}
                data-state={isDone ? "done" : isPending ? "pending" : "idle"}
                onClick={() => {
                  if (disabled || isPending || isDone) return;
                  if (a.status === "confirm") setConfirming(a);
                  else onRun(a);
                }}
                className="min-h-11 gap-1.5"
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    isPending && !reducedMotion && "animate-spin",
                    isDone && !reducedMotion && "animate-in zoom-in-50 duration-200",
                  )}
                  aria-hidden="true"
                />
                {label}
              </Button>
            </li>
          );
        })}
      </ul>

      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          {copy && (
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>{copy.body}</AlertDialogDescription>
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              {t("aiCoach.actions.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }), "min-h-11")}
              onClick={() => {
                const a = confirming;
                setConfirming(null);
                if (a) onRun(a);
              }}
            >
              {t("aiCoach.actions.confirmAnyway", { defaultValue: "Add it anyway" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});

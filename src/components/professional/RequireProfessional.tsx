import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { fetchEffectivePlanName } from "@/lib/accountQueries";
import { logger } from "@/lib/logger";

/**
 * Route guard for /dashboard/professional-settings.
 *
 * The route used to be wrapped in nothing but an error boundary, so every signed-in
 * account could open it and the nav link was the only gate. This asks the server
 * which plan it enforces (current_user_plan_name, through effective_plan_id), so
 * a trial, App Store or complimentary Professional gets in and nobody else does.
 *
 * It fails closed: while the answer is pending the page is a skeleton, a
 * different plan gets an explainer and a link to Billing (no redirect, no
 * tools), and a failed lookup gets a Retry rather than a guess either way.
 * RLS on professional_brand_settings is still the real boundary; this keeps
 * the page from offering tools the server would refuse.
 */

export const PROFESSIONAL_PLAN_NAME = "Professional";

type Access = "loading" | "allowed" | "denied" | "error";

export function RequireProfessional({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const [access, setAccess] = useState<Access>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAccess("loading");
    if (!userId) return;

    fetchEffectivePlanName(userId)
      .then((name) => {
        if (!cancelled) setAccess(name === PROFESSIONAL_PLAN_NAME ? "allowed" : "denied");
      })
      .catch((error: unknown) => {
        logger.error("RequireProfessional: plan lookup failed", error);
        if (!cancelled) setAccess("error");
      });

    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (access === "allowed") return <>{children}</>;

  if (access === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-6" aria-busy="true">
        <span className="sr-only" role="status">
          {t("professional.guard.checking", { defaultValue: "Checking your plan" })}
        </span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (access === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <Card role="alert">
          <CardHeader>
            <CardTitle className="text-lg">
              {t("professional.guard.errorTitle", { defaultValue: "Couldn't check your plan" })}
            </CardTitle>
            <CardDescription>
              {t("professional.guard.errorBody", {
                defaultValue: "We couldn't confirm which plan you're on, so these settings stay closed for now.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={retry}>{t("professional.guard.retry", { defaultValue: "Try again" })}</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("professional.guard.deniedTitle", {
              defaultValue: "Professional settings come with the Professional plan",
            })}
          </CardTitle>
          <CardDescription className="max-w-prose">
            {t("professional.guard.deniedBody", {
              defaultValue:
                "The Professional plan is for feeding therapists, dietitians and other clinicians who work with families on EatPal.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="max-w-prose text-sm text-muted-foreground">
            {t("professional.guard.deniedNote", {
              defaultValue: "Your current plan doesn't include it. You can compare plans from Billing.",
            })}
          </p>
          <Button asChild variant="outline">
            <Link to="/dashboard/billing">{t("professional.guard.seePlan", { defaultValue: "See your plan" })}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

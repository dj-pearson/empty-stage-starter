import { Helmet } from "react-helmet-async";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ClientAccessSection } from "@/components/professional/ClientAccessSection";
import { PracticeProfileForm } from "@/components/professional/PracticeProfileForm";
import { userFacingError } from "@/lib/networkFailure";
import { logger } from "@/lib/logger";

/**
 * /dashboard/professional-settings, behind RequireProfessional.
 *
 * Two sections on one page: what a clinician can and cannot see of a family
 * (ClientAccessSection), then the practice profile (professional_brand_settings).
 *
 * This page used to sell a white-label custom domain: DNS instructions for a
 * CNAME to eatpal.com, and a "Check Verification" button that wrote
 * status 'verified' to professional_custom_domains from the browser without
 * looking at DNS. Nothing serves custom domains. The table stays (additive-only
 * migrations); a row someone already added is shown read-only as not live,
 * with the Remove action it always had.
 *
 * A failed load is an error with Retry, never an empty form: an empty form
 * after a failed read invites a save that overwrites the profile with blanks.
 */

type BrandRow = Database["public"]["Tables"]["professional_brand_settings"]["Row"];
type DomainRow = Pick<Database["public"]["Tables"]["professional_custom_domains"]["Row"], "id" | "domain_name">;

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; brand: BrandRow | null; domain: DomainRow | null };

export default function ProfessionalSettings() {
  const { t } = useTranslation();
  const { userId } = useAuth();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async (uid: string, isCancelled: () => boolean = () => false) => {
    setState({ status: "loading" });
    try {
      const [brandRes, domainRes] = await Promise.all([
        supabase.from("professional_brand_settings").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("professional_custom_domains").select("id, domain_name").eq("user_id", uid).maybeSingle(),
      ]);
      if (isCancelled()) return;
      if (brandRes.error || domainRes.error) {
        logger.error("ProfessionalSettings: load failed", brandRes.error ?? domainRes.error);
        setState({ status: "error" });
        return;
      }
      setState({ status: "ready", brand: brandRes.data, domain: domainRes.data });
    } catch (error: unknown) {
      logger.error("ProfessionalSettings: load threw", error);
      if (!isCancelled()) setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void load(userId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [userId, load]);

  const handleSaved = useCallback((row: BrandRow) => {
    setState((prev) => (prev.status === "ready" ? { ...prev, brand: row } : prev));
  }, []);

  const removeDomain = async () => {
    if (state.status !== "ready" || !state.domain) return;
    const domain = state.domain;
    setConfirmRemove(false);
    setRemoving(true);
    try {
      const { error } = await supabase.from("professional_custom_domains").delete().eq("id", domain.id);
      if (error) throw error;
      setState((prev) => (prev.status === "ready" ? { ...prev, domain: null } : prev));
      toast.success(t("professional.domain.removed", { defaultValue: "Domain removed" }));
    } catch (error: unknown) {
      logger.error("ProfessionalSettings: domain remove failed", error);
      toast.error(t("professional.domain.removeFailed", { defaultValue: "Couldn't remove that domain" }), {
        description: userFacingError(error, t("professional.domain.removeFailedFallback", { defaultValue: "Please try again." })),
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6">
      <Helmet>
        <title>{t("professional.meta.title", { defaultValue: "Professional settings - EatPal" })}</title>
        <meta
          name="description"
          content={t("professional.meta.description", {
            defaultValue: "Your practice profile and what families can share with you on EatPal.",
          })}
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t("professional.page.title", { defaultValue: "Professional settings" })}</h1>
        <p className="max-w-prose text-muted-foreground">
          {t("professional.page.subtitle", {
            defaultValue: "Your practice profile, and exactly what families can share with you.",
          })}
        </p>
      </header>

      {state.status === "loading" && (
        <div className="space-y-4" aria-busy="true">
          <span className="sr-only" role="status">
            {t("professional.page.loading", { defaultValue: "Loading your professional settings" })}
          </span>
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>
            {t("professional.page.loadErrorTitle", { defaultValue: "Couldn't load your professional settings" })}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {t("professional.page.loadErrorBody", {
                defaultValue: "Nothing has been changed. Check your connection and try again.",
              })}
            </p>
            <Button variant="outline" size="sm" onClick={() => userId && void load(userId)}>
              {t("professional.page.retry", { defaultValue: "Try again" })}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === "ready" && userId && (
        <>
          <ClientAccessSection />
          <PracticeProfileForm userId={userId} row={state.brand} onSaved={handleSaved} />
          {state.domain && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t("professional.domain.title", { defaultValue: "Custom domain" })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-mono text-sm break-all">{state.domain.domain_name}</p>
                <p className="text-sm font-medium">
                  {t("professional.domain.notLive", {
                    defaultValue: "Custom domains aren't available yet; this domain isn't live.",
                  })}
                </p>
                <p className="max-w-prose text-sm text-muted-foreground">
                  {t("professional.domain.body", {
                    domain: state.domain.domain_name,
                    defaultValue: "You added {{domain}} earlier. Nothing serves EatPal from it. You can remove it.",
                  })}
                </p>
                <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)} disabled={removing}>
                  {removing
                    ? t("professional.domain.removing", { defaultValue: "Removing" })
                    : t("professional.domain.remove", { defaultValue: "Remove" })}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("professional.domain.confirmTitle", {
                domain: state.status === "ready" ? (state.domain?.domain_name ?? "") : "",
                defaultValue: "Remove {{domain}}?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("professional.domain.confirmBody", {
                defaultValue: "This only deletes the saved domain name from your account. Nothing else changes.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("professional.domain.cancel", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void removeDomain()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("professional.domain.remove", { defaultValue: "Remove" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

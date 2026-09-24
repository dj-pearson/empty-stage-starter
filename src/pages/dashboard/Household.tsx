import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, WifiOff } from "lucide-react";
import "@/i18n/appLocale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/hooks/useHousehold";
import { HouseholdHeader } from "@/components/household/HouseholdHeader";
import { HouseholdScope } from "@/components/household/HouseholdScope";
import { HouseholdMembers } from "@/components/household/HouseholdMembers";
import { HouseholdInvites } from "@/components/household/HouseholdInvites";

/**
 * Household settings on the web (US-789, rebuilt for US-840).
 *
 * The page answers "who can see my kids?" before anything else: the name, how
 * many people, their faces, then the roster. It used to render the roster off
 * whatever the query left behind, so a failed load read as "You are the only
 * person in this household" -- the one wrong answer this page cannot give.
 * The roster now renders only from a successful load (or, after a failed
 * refresh, from the last one, labelled as such).
 *
 * All data comes from useHousehold, shared with the Grocery and Food Journal pages.
 */
export default function Household() {
  const { t } = useTranslation();
  const {
    householdName,
    members,
    inviteCodes,
    status,
    loading,
    refreshing,
    error,
    isOffline,
    viewerIsOwner,
    reload,
    createInviteCode,
    revokeInviteCode,
    removeMember,
    renameHousehold,
    leaveHousehold,
  } = useHousehold();

  const hasData = members.length > 0;
  const showRoster = status === "ready" || (status === "error" && hasData);
  const stale = status === "error" && hasData;
  const failedEmpty = status === "error" && !hasData;

  // Announce the end of the first load once, for screen readers.
  const [announcement, setAnnouncement] = useState("");
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (wasLoading.current && !loading && status === "ready") {
      setAnnouncement(
        t("household.page.loaded", {
          count: members.length,
        }),
      );
    }
    wasLoading.current = loading;
  }, [loading, status, members.length, t]);

  const retry = (
    <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void reload()} disabled={refreshing}>
      {refreshing && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
      {refreshing
        ? t("household.page.error.retrying")
        : t("household.page.error.retry")}
    </Button>
  );

  return (
    <>
      <Helmet>
        <title>{t("household.page.metaTitle")}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div
        role="region"
        aria-label={t("household.page.bodyLabel")}
        aria-busy={loading}
        className="container mx-auto max-w-3xl space-y-4 p-4 sm:space-y-6 sm:p-6"
      >
        <p role="status" className="sr-only">
          {announcement}
        </p>

        <HouseholdHeader
          householdName={householdName}
          members={members}
          ready={showRoster}
          disabled={isOffline || !showRoster}
          renameHousehold={renameHousehold}
        />

        {isOffline && (
          <Alert>
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{t("household.page.offline.title")}</AlertTitle>
            <AlertDescription>
              {t("household.page.offline.body")}
            </AlertDescription>
          </Alert>
        )}

        {failedEmpty && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{t("household.page.error.title")}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{error || t("household.page.error.fallback")}</p>
              {retry}
            </AlertDescription>
          </Alert>
        )}

        {status === "signed-out" && (
          <p className="text-muted-foreground">
            {t("household.page.signedOut")}
          </p>
        )}

        {status !== "signed-out" && <HouseholdScope />}

        {status === "loading" && (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {stale && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>{t("household.page.stale")}</p>
            {retry}
          </div>
        )}

        {showRoster && (
          <>
            <HouseholdMembers
              members={members}
              viewerIsOwner={viewerIsOwner}
              disabled={isOffline}
              removeMember={removeMember}
              leaveHousehold={leaveHousehold}
            />
            <HouseholdInvites
              householdName={householdName}
              inviteCodes={inviteCodes}
              loading={loading}
              disabled={isOffline}
              createInviteCode={createInviteCode}
              revokeInviteCode={revokeInviteCode}
            />
          </>
        )}
      </div>
    </>
  );
}

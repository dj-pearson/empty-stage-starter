import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, EyeOff, Globe, Link2Off, Lock, RotateCw, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PrefScopeBadge } from "@/components/settings/PrefScopeBadge";
import { memberDisplayName } from "@/components/household/householdMemberLabel";
import { useAuth } from "@/contexts/AuthContext";
import { useHousehold } from "@/hooks/useHousehold";
import { useHouseholdShareLinks, type HouseholdShareLink } from "@/hooks/useHouseholdShareLinks";
import { usePickyWinSharePref } from "@/hooks/usePickyWinSharePref";
import { analytics } from "@/lib/analytics";
import { PRIVATE_SCOPE_KEYS, SHARED_SCOPE_KEYS } from "@/lib/householdScope";
import { copyTextToClipboard } from "@/lib/recipeShareLinks";
import "@/i18n/appLocale";

const HOUSEHOLD_PATH = "/dashboard/household";

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "just now" in the current language. */
function relativeFromNow(iso: string, locale: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

/** What the household shares and what stays with this account. */
function HouseholdScopeSummary() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {t("settings.prefs.privacy.scope.title", { defaultValue: "Who sees what" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" aria-hidden="true" />
              {t("settings.prefs.privacy.scope.shared", { defaultValue: "Your household sees" })}
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {SHARED_SCOPE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Lock className="h-4 w-4" aria-hidden="true" />
              {t("settings.prefs.privacy.scope.private", { defaultValue: "Only you see" })}
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {PRIVATE_SCOPE_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        </div>
        <Link
          to={HOUSEHOLD_PATH}
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("settings.prefs.privacy.scope.manage", { defaultValue: "Manage your household" })}
        </Link>
      </CardContent>
    </Card>
  );
}

/** The Picky-Eater Win Network opt-in, saved to the account. */
function WinNetworkCard() {
  const { t } = useTranslation();
  const { enabled, setEnabled, pending, loaded } = usePickyWinSharePref();

  const status = !loaded
    ? t("settings.prefs.privacy.winNetwork.checking", { defaultValue: "Checking your choice..." })
    : pending
      ? t("settings.prefs.privacy.winNetwork.saving", { defaultValue: "Saving..." })
      : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5" aria-hidden="true" />
            {t("settings.prefs.privacy.winNetwork.title", { defaultValue: "Win Network" })}
          </CardTitle>
          <PrefScopeBadge scope="account" />
        </div>
        <CardDescription>
          {t("settings.prefs.privacy.winNetwork.description", {
            defaultValue:
              "Other families see which food bridges worked for kids like theirs. Your try-bites can help, anonymously.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="share-chain-outcomes" className="text-sm font-medium">
              {t("settings.prefs.privacy.winNetwork.label", {
                defaultValue: "Share my try-bite results anonymously",
              })}
            </Label>
            <p id="share-chain-outcomes-help" className="text-sm text-muted-foreground">
              {t("settings.prefs.privacy.winNetwork.help", {
                defaultValue: "Nothing is shared until this choice has loaded from your account.",
              })}
            </p>
          </div>
          <Switch
            id="share-chain-outcomes"
            checked={enabled}
            disabled={!loaded || pending}
            aria-describedby="share-chain-outcomes-help share-chain-outcomes-status"
            onCheckedChange={setEnabled}
          />
        </div>
        <p id="share-chain-outcomes-status" role="status" className="min-h-5 text-sm text-muted-foreground">
          {status}
        </p>
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <h4 className="mb-1 font-semibold">
              {t("settings.prefs.privacy.winNetwork.sharedTitle", { defaultValue: "What is shared" })}
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                {t("settings.prefs.privacy.winNetwork.sharedPairs", {
                  defaultValue: "The two foods you bridged, like crackers to toast, and whether the try-bite went fully or partly well",
                })}
              </li>
              <li>
                {t("settings.prefs.privacy.winNetwork.sharedBucket", {
                  defaultValue: "A broad pickiness level: low, medium or high",
                })}
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-1 flex items-center gap-2 font-semibold">
              <EyeOff className="h-4 w-4" aria-hidden="true" />
              {t("settings.prefs.privacy.winNetwork.neverTitle", { defaultValue: "Never shared" })}
            </h4>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>{t("settings.prefs.privacy.winNetwork.neverNames", { defaultValue: "Names, yours or your kids'" })}</li>
              <li>{t("settings.prefs.privacy.winNetwork.neverAges", { defaultValue: "Ages or birthdays" })}</li>
              <li>
                {t("settings.prefs.privacy.winNetwork.neverNotes", {
                  defaultValue: "Notes, allergies or anything you typed",
                })}
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ShareLinkRow({
  link,
  madeBy,
  when,
  busy,
  onCopy,
  onRevoke,
}: {
  link: HouseholdShareLink;
  madeBy: string;
  when: string;
  busy: boolean;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  const name = link.recipeName ?? t("settings.prefs.shareLinks.unnamedRecipe", { defaultValue: "A recipe" });
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">
          {when ? `${madeBy} - ${when}` : madeBy}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1 sm:flex-none"
          onClick={onCopy}
          aria-label={t("settings.prefs.shareLinks.copyFor", { defaultValue: "Copy link to {{name}}", name })}
        >
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("settings.prefs.shareLinks.copy", { defaultValue: "Copy" })}
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 sm:flex-none"
          onClick={onRevoke}
          disabled={busy}
          aria-label={t("settings.prefs.shareLinks.turnOffFor", {
            defaultValue: "Turn off the link to {{name}}",
            name,
          })}
        >
          <Link2Off className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("settings.prefs.shareLinks.turnOff", { defaultValue: "Turn off" })}
        </Button>
      </div>
    </li>
  );
}

/** Every live public recipe link in the household, with copy and turn off. */
function ShareLinksCard() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const household = useHousehold();
  const { links, status, busyIds, revoke, revokeAll, reload } = useHouseholdShareLinks();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of household.members) map.set(m.user_id, memberDisplayName(m, t));
    return map;
  }, [household.members, t]);

  const madeBy = (createdBy: string | null) => {
    if (createdBy && createdBy === userId) {
      return t("settings.prefs.shareLinks.madeByYou", { defaultValue: "Made by you" });
    }
    const name = createdBy ? nameByUser.get(createdBy) : undefined;
    return name
      ? t("settings.prefs.shareLinks.madeBy", { defaultValue: "Made by {{name}}", name })
      : t("settings.prefs.shareLinks.madeByHousehold", { defaultValue: "Made by your household" });
  };

  const copy = async (url: string) => {
    if (await copyTextToClipboard(url)) {
      toast.success(t("settings.prefs.shareLinks.copied", { defaultValue: "Link copied" }));
    } else {
      toast(t("settings.prefs.shareLinks.copyManually", { defaultValue: "Copy this link:" }), { description: url });
    }
  };

  const turnOff = async (link: HouseholdShareLink) => {
    if (await revoke(link.id)) {
      analytics.trackEvent("recipe_share_link_revoked", { recipe_id: link.recipeId, source: "settings" });
      toast.success(
        t("settings.prefs.shareLinks.revoked", { defaultValue: "Link turned off. It no longer opens the recipe." })
      );
    } else {
      toast.error(
        t("settings.prefs.shareLinks.revokeFailed", { defaultValue: "Couldn't turn the link off. Please try again." })
      );
    }
  };

  const turnOffAll = async () => {
    const { revoked, failed } = await revokeAll();
    setConfirmOpen(false);
    if (revoked > 0) analytics.trackEvent("recipe_share_links_revoked_all", { count: revoked, source: "settings" });
    if (failed > 0) {
      toast.error(
        t("settings.prefs.shareLinks.revokeAllPartial", {
          defaultValue: "{{count}} links are still on. Try again.",
          count: failed,
        })
      );
    } else {
      toast.success(t("settings.prefs.shareLinks.revokedAll", { defaultValue: "All links are off." }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle id="share-links" tabIndex={-1} className="flex items-center gap-2 text-lg outline-none">
            <Link2Off className="h-5 w-5" aria-hidden="true" />
            {t("settings.prefs.shareLinks.title", { defaultValue: "Public recipe links" })}
          </CardTitle>
          <PrefScopeBadge scope="household" />
        </div>
        <CardDescription>
          {t("settings.prefs.shareLinks.description", {
            defaultValue:
              "Anyone with one of these links can see that recipe. Never your kids, allergies or notes. Either parent can turn a link off.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "idle" || status === "loading" ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only" role="status">
              {t("settings.prefs.shareLinks.loading", { defaultValue: "Loading links" })}
            </span>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : status === "error" ? (
          <div role="alert" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t("settings.prefs.shareLinks.loadFailed", { defaultValue: "Couldn't load your links." })}
            </p>
            <Button variant="outline" className="h-11" onClick={() => void reload()}>
              <RotateCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("settings.prefs.shareLinks.retry", { defaultValue: "Retry" })}
            </Button>
          </div>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.prefs.shareLinks.empty", {
              defaultValue: "No recipes are public. Share one from any recipe.",
            })}
          </p>
        ) : (
          <div className="space-y-3">
            <ul className="divide-y">
              {links.map((link) => (
                <ShareLinkRow
                  key={link.id}
                  link={link}
                  madeBy={madeBy(link.createdBy)}
                  when={relativeFromNow(link.createdAt, i18n.language)}
                  busy={busyIds.has(link.id)}
                  onCopy={() => void copy(link.url)}
                  onRevoke={() => void turnOff(link)}
                />
              ))}
            </ul>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={busyIds.size > 0}>
                  {t("settings.prefs.shareLinks.turnOffAll", { defaultValue: "Turn off all links" })}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("settings.prefs.shareLinks.confirmTitle", {
                      defaultValue: "Turn off {{count}} public links?",
                      count: links.length,
                    })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("settings.prefs.shareLinks.confirmBody", {
                      defaultValue:
                        "Anyone who has one of these links, including links your co-parent made, will stop seeing the recipe. The recipes stay in your household.",
                    })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="h-11">
                    {t("settings.prefs.shareLinks.cancel", { defaultValue: "Keep them" })}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="h-11"
                    onClick={(e) => {
                      e.preventDefault();
                      void turnOffAll();
                    }}
                    disabled={busyIds.size > 0}
                  >
                    {t("settings.prefs.shareLinks.confirmAction", { defaultValue: "Turn them all off" })}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Settings > Privacy and sharing. Content only; the hub supplies the section
 * and its h2. Top to bottom: what the household shares, the anonymous Win
 * Network opt-in (saved to the account), and the household's public links.
 */
export function PrivacySection() {
  return (
    <div className="space-y-6">
      <HouseholdScopeSummary />
      <WinNetworkCard />
      <ShareLinksCard />
    </div>
  );
}

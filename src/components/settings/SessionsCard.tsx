import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLoginHistory, type LoginHistoryEntry } from "@/hooks/useLoginHistory";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { userFacingError } from "@/lib/networkFailure";
import "@/i18n/appLocale";

const RECENT_LIMIT = 5;

/** The id login-history.ts stored for this tab's sign-in, if any. */
function currentLoginSessionId(): string | null {
  try {
    return sessionStorage.getItem("login_session_id");
  } catch {
    return null;
  }
}

const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

function relativeTime(iso: string, locale: string, now: number): string | null {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const seconds = Math.round((then - now) / 1000);
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

type Scope = "others" | "global";

/**
 * Settings > Sign-in: the last few sign-ins and the two sign-out-elsewhere
 * actions (settings pass B).
 *
 * It replaces a card that showed a green dot, "Active", and a browser name
 * guessed from navigator.userAgent -- for the current tab only, whatever the
 * account's real sessions were. The list here is login_history, recorded at
 * sign-in; the device and browser come from that row. The "this device" mark
 * matches the row's session id against the one login-history.ts keeps for
 * this tab.
 */
export function SessionsCard() {
  const { t, i18n } = useTranslation();
  const reducedMotion = useReducedMotion();
  const { loginHistory, isLoading, refreshHistory } = useLoginHistory(RECENT_LIMIT);
  const [confirm, setConfirm] = useState<Scope | null>(null);
  const [busy, setBusy] = useState<Scope | null>(null);
  const [now] = useState(() => Date.now());
  const thisSession = useMemo(currentLoginSessionId, []);

  const entries = useMemo(
    () => loginHistory.filter((entry) => entry.success).slice(0, RECENT_LIMIT),
    [loginHistory]
  );

  const deviceLine = (entry: LoginHistoryEntry): string => {
    const browser = entry.browser_name?.trim();
    const os = entry.os_name?.trim();
    if (browser && os) {
      return t("settings.account.sessions.browserOnOs", {
        defaultValue: "{{browser}} on {{os}}",
        browser,
        os,
      });
    }
    return (
      browser ||
      os ||
      entry.device_type?.trim() ||
      t("settings.account.sessions.unknownDevice", { defaultValue: "Unknown device" })
    );
  };

  const placeLine = (entry: LoginHistoryEntry): string | null => {
    const parts = [entry.city, entry.country].filter((p): p is string => Boolean(p && p.trim()));
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const signOut = async (scope: Scope) => {
    setBusy(scope);
    try {
      const { error } = await supabase.auth.signOut({ scope });
      if (error) throw error;
      if (scope === "others") {
        toast.success(
          t("settings.account.sessions.othersSignedOut", {
            defaultValue: "Signed out of your other devices. This one stays signed in.",
          })
        );
        setConfirm(null);
        void refreshHistory();
      } else {
        // The SIGNED_OUT listener in AppContext scrubs this device's storage.
        window.location.replace("/auth");
      }
    } catch (err) {
      toast.error(
        userFacingError(
          err,
          t("settings.account.sessions.signOutFailed", {
            defaultValue: "Couldn't sign those devices out. Try again.",
          })
        )
      );
    } finally {
      setBusy(null);
    }
  };

  const spinner = (
    <Loader2
      className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
      aria-hidden="true"
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MonitorSmartphone className="h-5 w-5" aria-hidden="true" />
          {t("settings.account.sessions.title", { defaultValue: "Where you're signed in" })}
        </CardTitle>
        <CardDescription>
          {t("settings.account.sessions.description", {
            defaultValue:
              "Your last few sign-ins. If one isn't you, sign out your other devices and change your password.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.account.sessions.empty", {
              defaultValue: "No sign-ins recorded yet on this account.",
            })}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((entry) => {
              const isCurrent = thisSession !== null && entry.session_id === thisSession;
              const when = relativeTime(entry.logged_in_at, i18n.language || "en", now);
              const place = placeLine(entry);
              return (
                <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{deviceLine(entry)}</p>
                    <p className="text-xs text-muted-foreground">
                      {[when, place].filter(Boolean).join(" - ")}
                    </p>
                  </div>
                  {isCurrent && (
                    <Badge variant="secondary" className="shrink-0">
                      {t("settings.account.sessions.thisDevice", { defaultValue: "This device" })}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-2 border-t pt-6 sm:flex-row sm:items-center">
        <Button
          id="sign-out-others"
          type="button"
          variant="outline"
          onClick={() => setConfirm("others")}
          disabled={busy !== null}
        >
          <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
          {t("settings.account.sessions.signOutOthers", {
            defaultValue: "Sign out of all other devices",
          })}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirm("global")}
          disabled={busy !== null}
        >
          {t("settings.account.sessions.signOutEverywhere", { defaultValue: "Sign out everywhere" })}
        </Button>
      </CardFooter>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "global"
                ? t("settings.account.sessions.confirmGlobalTitle", {
                    defaultValue: "Sign out everywhere?",
                  })
                : t("settings.account.sessions.confirmOthersTitle", {
                    defaultValue: "Sign out of your other devices?",
                  })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "global"
                ? t("settings.account.sessions.confirmGlobalBody", {
                    defaultValue:
                      "Every phone, tablet and browser signed in to this account is signed out, including this one. Anything not yet synced on those devices may be lost.",
                  })
                : t("settings.account.sessions.confirmOthersBody", {
                    defaultValue:
                      "Every other phone, tablet and browser is signed out within the hour. You stay signed in here.",
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>
              {t("settings.account.sessions.cancel", { defaultValue: "Cancel" })}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy !== null}
              aria-busy={busy !== null || undefined}
              onClick={() => confirm && void signOut(confirm)}
            >
              {busy !== null && spinner}
              {confirm === "global"
                ? t("settings.account.sessions.confirmGlobal", { defaultValue: "Sign out everywhere" })
                : t("settings.account.sessions.confirmOthers", { defaultValue: "Sign out other devices" })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

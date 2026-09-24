import { useCallback, useId, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertTriangle, Users, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { parseInviteCode, inviteErrorMessage } from "@/lib/householdInvite";
import { SHARED_SCOPE_KEYS } from "@/lib/householdScope";

/** Invite codes are six characters (create_household_invite, 20260426000001). */
const CODE_LENGTH = 6;

type JoinState =
  | { status: "entry" }
  | { status: "confirm"; code: string }
  | { status: "joining"; code: string }
  | { status: "success" }
  | { status: "error"; message: string };

/** Uppercase and drop whitespace, so a pasted " abc 123" still reads as ABC123. */
function normalizeTypedCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase().slice(0, CODE_LENGTH);
}

/**
 * Household invite acceptance (US-337). Rendered behind ProtectedRoute, so the
 * user is always signed in here (the `?code=` survives the /auth round-trip).
 *
 * Accepting is not reversible: when the joiner is the only member of their
 * current household, accept_household_invite moves their kids, recipes, plan
 * and lists into the inviter's household and closes the old one. So this page
 * used to call the RPC on mount and now asks first; the RPC runs only on the
 * "Join household" tap, once, guarded against a double tap.
 *
 * After success the user goes to /dashboard/household by a full navigation, so
 * AuthContext re-resolves the household id instead of serving the old one.
 */
export default function Join() {
  const { t } = useTranslation();
  const location = useLocation();
  const [state, setState] = useState<JoinState>(() => {
    const code = parseInviteCode(location.search);
    return code ? { status: "confirm", code } : { status: "entry" };
  });
  const [typed, setTyped] = useState("");
  // Accept at most once per confirm, even under a double tap that lands before
  // React re-renders the disabled button.
  const attempted = useRef(false);
  const inputId = useId();

  const accept = useCallback(async (code: string) => {
    if (attempted.current) return;
    attempted.current = true;
    setState({ status: "joining", code });
    try {
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>
      )("accept_household_invite", { p_code: code });

      if (error) throw error;
      setState({ status: "success" });
    } catch (error) {
      logger.error("Error accepting household invite:", error);
      setState({ status: "error", message: inviteErrorMessage(error) });
    }
  }, []);

  const submitTyped = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = normalizeTypedCode(typed);
    if (code.length !== CODE_LENGTH) return;
    attempted.current = false;
    setState({ status: "confirm", code });
  };

  const tryAnother = () => {
    attempted.current = false;
    setTyped("");
    setState({ status: "entry" });
  };

  const title = t("household.join.title");

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center p-4">
      <Helmet>
        <title>{t("household.join.metaTitle")}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
            <Users className="h-5 w-5" aria-hidden="true" />
            {title}
          </h1>
        </CardHeader>
        <CardContent>
          <div role="status" aria-live="polite" className="space-y-4 text-center">
            {(state.status === "confirm" || state.status === "joining") && (
              <div className="flex flex-col items-center gap-3 py-4">
                <h2 className="text-lg font-semibold">
                  {t("household.join.confirm.heading")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("household.join.confirm.codeLabel")}
                </p>
                <p
                  className="font-mono text-2xl font-semibold tracking-widest"
                  aria-label={`${t("household.join.confirm.codeLabel")} ${state.code.split("").join(" ")}`}
                >
                  {state.code}
                </p>
                <p className="text-left text-sm text-muted-foreground">
                  {t("household.join.confirm.merge")}
                </p>
                <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row-reverse sm:justify-center">
                  <Button
                    onClick={() => void accept(state.code)}
                    disabled={state.status === "joining"}
                    aria-busy={state.status === "joining"}
                  >
                    {state.status === "joining" ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                        {t("household.join.joining")}
                      </>
                    ) : (t("household.join.confirm.accept"))}
                  </Button>
                  {state.status === "confirm" && (
                    <Link to="/dashboard" className={buttonVariants({ variant: "outline" })}>
                      {t("household.join.confirm.notNow")}
                    </Link>
                  )}
                </div>
              </div>
            )}

            {state.status === "entry" && (
              <form onSubmit={submitTyped} className="flex flex-col items-center gap-3 py-4">
                <KeyRound className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-lg font-semibold">
                  {t("household.join.entry.heading")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t("household.join.entry.body")}
                </p>
                <Label htmlFor={inputId} className="sr-only">
                  {t("household.join.entry.label")}
                </Label>
                <Input
                  id={inputId}
                  value={typed}
                  onChange={(e) => setTyped(normalizeTypedCode(e.target.value))}
                  maxLength={CODE_LENGTH}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="text"
                  className="max-w-[12rem] text-center font-mono text-2xl tracking-widest"
                />
                <Button type="submit" disabled={typed.length !== CODE_LENGTH} className="mt-1">
                  {t("household.join.entry.submit")}
                </Button>
              </form>
            )}

            {state.status === "success" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
                <h2 className="text-lg font-semibold">
                  {t("household.join.success.heading")}
                </h2>
                <p className="text-muted-foreground">
                  {t("household.join.success.sharedIntro")}
                </p>
                <ul className="flex flex-wrap justify-center gap-2 text-sm">
                  {SHARED_SCOPE_KEYS.map((key) => (
                    <li key={key} className="rounded-full bg-muted px-3 py-1 text-foreground">
                      {t(key)}
                    </li>
                  ))}
                </ul>
                {/*
                  US-789: land on the household page, not the dashboard. Somebody
                  who has just accepted an invite wants to see who else is here
                  and what they now share. A full navigation, so AuthContext
                  re-resolves the household id.
                */}
                <Button
                  onClick={() => {
                    window.location.href = "/dashboard/household";
                  }}
                  className="mt-2"
                >
                  {t("household.join.success.cta")}
                </Button>
              </div>
            )}

            {state.status === "error" && (
              <div className="flex flex-col items-center gap-3 py-4">
                <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden="true" />
                <h2 className="text-lg font-semibold">
                  {t("household.join.error.heading")}
                </h2>
                <p className="text-muted-foreground">{state.message}</p>
                <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button variant="outline" onClick={tryAnother}>
                    {t("household.join.error.tryAnother")}
                  </Button>
                  <Link to="/dashboard" className={buttonVariants({ variant: "ghost" })}>
                    {t("household.join.error.dashboard")}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

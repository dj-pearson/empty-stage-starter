import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { parseInviteCode, inviteErrorMessage } from "@/lib/householdInvite";

type JoinState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Household invite acceptance (US-337). Rendered behind ProtectedRoute, so the
 * user is always signed in here (the `?code=` survives the /auth round-trip).
 * Calls accept_household_invite once, then routes the user into the now-shared
 * household via a full reload so auth/household resolution refreshes.
 */
export default function Join() {
  const location = useLocation();
  const [state, setState] = useState<JoinState>({ status: "loading" });
  // Accept exactly once even under StrictMode's double-invoke.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const code = parseInviteCode(location.search);
    if (!code) {
      setState({ status: "missing" });
      return;
    }

    (async () => {
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
    })();
  }, [location.search]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Helmet>
        <title>Join a household · EatPal</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Join a household
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state.status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Accepting your invite…</p>
            </div>
          )}

          {state.status === "success" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
              <h3 className="text-lg font-semibold">You're in!</h3>
              <p className="text-muted-foreground">
                You now share this household's kids, meal plans, and grocery lists.
              </p>
              <Button onClick={() => { window.location.href = "/dashboard"; }} className="mt-2">
                Go to dashboard
              </Button>
            </div>
          )}

          {state.status === "missing" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertTriangle className="h-10 w-10 text-yellow-500" />
              <h3 className="text-lg font-semibold">No invite code</h3>
              <p className="text-muted-foreground">
                This link is missing an invite code. Ask the person who invited you for a fresh link.
              </p>
              <Button variant="outline" onClick={() => { window.location.href = "/dashboard"; }} className="mt-2">
                Go to dashboard
              </Button>
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <h3 className="text-lg font-semibold">Couldn't join</h3>
              <p className="text-muted-foreground">{state.message}</p>
              <Button variant="outline" onClick={() => { window.location.href = "/dashboard"; }} className="mt-2">
                Go to dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

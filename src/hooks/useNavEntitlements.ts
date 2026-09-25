import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NavEntitlements } from "@/lib/navigation";
import { sharedQuery } from "@/lib/sharedQuery";
import { adminRoleKey, fetchEffectivePlanName } from "@/lib/accountQueries";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Which gated nav sections this user can see (US-811).
 *
 * AppSidebar ran these two queries and Dashboard ran only the admin half, so
 * the Professional Portal existed on desktop and nowhere on mobile. One hook,
 * both renderers, same answer.
 *
 * Both checks fail closed: an error or a signed-out user yields false rather
 * than flashing an admin link while the query settles.
 *
 * The user id comes from useAuth() and keys the effect, so a sign-in as a
 * different account re-checks instead of keeping the previous answer, and no
 * getUser() round trip is spent finding out who is signed in. Dashboard calls
 * this once and hands the result to AppSidebar.
 */
const CLOSED: NavEntitlements = { isAdmin: false, isProfessional: false };

export function useNavEntitlements(): NavEntitlements {
  const { userId } = useAuth();
  const [entitlements, setEntitlements] = useState<NavEntitlements>(CLOSED);

  useEffect(() => {
    let cancelled = false;

    // Fail closed across an account switch too: the previous user's admin
    // link must not survive while the new user's roles load.
    setEntitlements((prev) => (prev.isAdmin || prev.isProfessional ? CLOSED : prev));
    if (!userId) return;

    const check = async () => {
      /*
       * US-866: both of these are shared.
       *
       * This hook was mounted by AppSidebar AND by Dashboard, so each of these
       * queries used to go out twice per page load -- and useWhiteLabelTheme
       * issues the plan one a third time. Dashboard is the only caller now;
       * the sharing still covers useWhiteLabelTheme and RequireProfessional.
       */
      const [adminData, planName] = await Promise.all([
        sharedQuery(adminRoleKey(userId), async () => {
          const { data } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .eq("role", "admin")
            .maybeSingle();
          return data;
        }),
        // The server-effective plan, not the Stripe row: a trialing, App Store
        // or complimentary Professional has no active Stripe subscription and
        // used to lose the link. A failed lookup fails closed.
        fetchEffectivePlanName(userId).catch(() => null),
      ]);

      if (cancelled) return;

      setEntitlements({
        isAdmin: !!adminData,
        isProfessional: planName === "Professional",
      });
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return entitlements;
}

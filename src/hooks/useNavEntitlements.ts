import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NavEntitlements } from "@/lib/navigation";
import { sharedQuery } from "@/lib/sharedQuery";
import { adminRoleKey, fetchActiveSubscription } from "@/lib/accountQueries";

/**
 * Which gated nav sections this user can see (US-811).
 *
 * AppSidebar ran these two queries and Dashboard ran only the admin half, so
 * the Professional Portal existed on desktop and nowhere on mobile. One hook,
 * both renderers, same answer.
 *
 * Both checks fail closed: an error or a signed-out user yields false rather
 * than flashing an admin link while the query settles.
 */
export function useNavEntitlements(): NavEntitlements {
  const [entitlements, setEntitlements] = useState<NavEntitlements>({
    isAdmin: false,
    isProfessional: false,
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      /*
       * US-866: both of these are shared.
       *
       * This hook is mounted by AppSidebar AND by Dashboard, so each of these
       * queries used to go out twice per page load -- and useWhiteLabelTheme
       * issues the subscription one a third time, byte for byte. Nothing was
       * wrong with either call; there was nowhere for them to meet.
       */
      const [adminData, subscriptionData] = await Promise.all([
        sharedQuery(adminRoleKey(user.id), async () => {
          const { data } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id)
            .eq("role", "admin")
            .maybeSingle();
          return data;
        }),
        fetchActiveSubscription(user.id),
      ]);

      if (cancelled) return;

      setEntitlements({
        isAdmin: !!adminData,
        isProfessional: subscriptionData?.subscription_plans?.name === "Professional",
      });
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, []);

  return entitlements;
}

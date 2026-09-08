import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NavEntitlements } from "@/lib/navigation";

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

      const [{ data: adminData }, { data: subscriptionData }] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle(),
        supabase
          .from("user_subscriptions")
          .select(`
            status,
            subscription_plans(name)
          `)
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle(),
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

// Tracks whether the current user needs to bind a real email and/or set a
// password. Drives both the Account Settings UI and the dashboard banner.
//
// Three states matter:
//   needsEmailBind  — Apple sign-in user with an @privaterelay address
//   needsPassword   — Apple sign-in user without a password set
//   resolved        — neither of the above (no banner, no CTA)
//
// `current_user_has_password()` is a SECURITY DEFINER SQL function that
// reads auth.users.encrypted_password without exposing the auth schema.

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isAppleAccount, isAppleRelayEmail } from "@/lib/apple";

export interface BindStatus {
  loading: boolean;
  user: User | null;
  isApple: boolean;
  isRelayEmail: boolean;
  hasPassword: boolean;
  /** Apple user with a relay address — both email and password need attention. */
  needsEmailBind: boolean;
  /** Apple user with a real email but no password — password-only step. */
  needsPassword: boolean;
  refresh: () => Promise<void>;
}

export function useBindStatus(): BindStatus {
  const [user, setUser] = useState<User | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user ?? null;
      setUser(u);

      if (!u) {
        setHasPassword(false);
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("current_user_has_password");
      if (error) {
        console.warn("current_user_has_password failed:", error.message);
        setHasPassword(false);
      } else {
        setHasPassword(Boolean(data));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Re-check whenever the session changes (sign in / token refresh / email update).
      setUser(session?.user ?? null);
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const isApple = isAppleAccount(user);
  const isRelayEmail = isAppleRelayEmail(user?.email);
  const needsEmailBind = isApple && isRelayEmail;
  const needsPassword = isApple && !hasPassword;

  return {
    loading,
    user,
    isApple,
    isRelayEmail,
    hasPassword,
    needsEmailBind,
    needsPassword,
    refresh,
  };
}

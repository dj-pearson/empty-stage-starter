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
import { logger } from "@/lib/logger";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { isAppleAccount, isAppleRelayEmail } from "@/lib/apple";
import { fetchHasPassword } from "@/lib/accountQueries";

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

      // US-866: shared. BindEmailBanner is in the dashboard shell and
      // AccountSettings asks the same question, so this RPC went out twice on
      // the settings page.
      try {
        setHasPassword(await fetchHasPassword());
      } catch (error) {
        logger.warn("current_user_has_password failed:", error);
        setHasPassword(false);
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

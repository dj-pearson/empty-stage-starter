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

import { useCallback, useEffect, useRef, useState } from "react";
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
  // Settings pass B: loading is the FIRST load only. A background refresh
  // (after a sign-in or an email change) keeps the values on screen; flipping
  // loading back to true unmounted the bind panel mid-flow and dropped the
  // user back on step one.
  const loadedOnce = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!loadedOnce.current && mounted.current) setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user ?? null;
      if (!mounted.current) return;
      setUser(u);

      if (!u) {
        setHasPassword(false);
        return;
      }

      // US-866: shared. BindEmailBanner is in the dashboard shell and
      // AccountSettings asks the same question, so this RPC went out twice on
      // the settings page.
      try {
        const next = await fetchHasPassword();
        if (mounted.current) setHasPassword(next);
      } catch (error) {
        logger.warn("current_user_has_password failed:", error);
        // A failed background check keeps the last answer rather than
        // claiming the password vanished.
        if (mounted.current && !loadedOnce.current) setHasPassword(false);
      }
    } finally {
      loadedOnce.current = true;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // INITIAL_SESSION duplicates the mount load above, and TOKEN_REFRESHED
      // changes neither the email nor the password. Only a new sign-in or an
      // edit to the user (email bound, password set) can change the answer.
      if (event === "SIGNED_OUT") {
        if (mounted.current) {
          setUser(null);
          setHasPassword(false);
        }
        return;
      }
      if (event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      if (mounted.current) setUser(session?.user ?? null);
      void refresh();
    });
    return () => {
      mounted.current = false;
      data.subscription.unsubscribe();
    };
  }, [refresh]);

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

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface AuthContextType {
  userId: string | null;
  householdId: string | null;
}

const AuthContext = createContext<AuthContextType>({ userId: null, householdId: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // US-539: dedupe household resolution. Both getSession() and the
    // onAuthStateChange INITIAL_SESSION event fire on startup for the same uid;
    // resolving in one guarded place means ensure_user_household /
    // get_user_household_id runs at most once per uid and racing RPCs can't set
    // conflicting householdId. Reset on sign-out so a new uid re-resolves.
    let resolvedUid: string | null = null;

    const resolveHousehold = async (uid: string) => {
      if (resolvedUid === uid) return; // already resolving/resolved this uid
      resolvedUid = uid;
      try {
        let { data: hh } = await supabase.rpc('get_user_household_id', { _user_id: uid });
        if (!hh) {
          const { data: newHh } = await supabase.rpc('ensure_user_household');
          hh = newHh;
        }
        if (mounted) setHouseholdId((hh as string) ?? null);
      } catch (error) {
        logger.error('Failed to get household ID:', error);
        resolvedUid = null; // allow a retry on the next auth event
      }
    };

    const applySession = (uid: string | null) => {
      if (mounted) setUserId(uid);
      if (uid) {
        void resolveHousehold(uid);
      } else {
        resolvedUid = null;
        if (mounted) setHouseholdId(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ userId, householdId }), [userId, householdId]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

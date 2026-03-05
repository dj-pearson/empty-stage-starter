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

    const loadAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (mounted) setUserId(uid);

      if (uid) {
        const { data: hh } = await supabase.rpc('get_user_household_id', { _user_id: uid });
        if (mounted) setHouseholdId((hh as string) ?? null);
      }
    };

    loadAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      if (mounted) setUserId(uid);

      if (uid) {
        supabase.rpc('get_user_household_id', { _user_id: uid }).then(({ data }) => {
          if (mounted) setHouseholdId((data as string) ?? null);
        }).catch((error) => {
          logger.error('Failed to get household ID:', error);
        });
      } else {
        if (mounted) setHouseholdId(null);
      }
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

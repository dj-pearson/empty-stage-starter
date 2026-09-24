import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/**
 * The household's default grocery list, so rows added from the planner or the
 * pantry land where the Grocery page will show them (US-714). Null until the
 * lookup answers, or when there is no signed-in user or no list.
 */
export function useDefaultGroceryListId(): string | null {
  const { userId } = useAuth();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("grocery_lists")
          .select("id, is_default")
          .eq("is_archived", false)
          .order("is_default", { ascending: false })
          .limit(1);
        const first = (data as Array<{ id: string }> | null)?.[0];
        if (!cancelled) setId(first?.id ?? null);
      } catch (error) {
        logger.warn("Default grocery list lookup failed", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return id;
}

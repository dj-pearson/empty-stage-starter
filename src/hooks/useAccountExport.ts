import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import {
  accountExportFilename,
  buildAccountExport,
  downloadAccountExport,
  serializeAccountExport,
  type AccountExportResult,
  type ExportClient,
} from "@/lib/accountExport";

export interface UseAccountExportResult {
  run: () => Promise<AccountExportResult | null>;
  running: boolean;
  result: AccountExportResult | null;
  /** The export could not start at all (signed out, network). */
  failed: boolean;
}

/**
 * Settings pass B: one export action shared by the Data section and the
 * delete dialog's "Download your data first", so both produce the same file
 * with the same manifest.
 */
export function useAccountExport(): UseAccountExportResult {
  const { householdId } = useAuth();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AccountExportResult | null>(null);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setRunning(true);
    setFailed(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      // The generated client's generic from() is too deep for TypeScript to
      // compare with the narrow interface the builder takes (TS2589), so the
      // client is passed through unknown. accountExport.test.ts pins the
      // subset of the builder API that is actually called.
      const client = supabase as unknown as ExportClient;
      const next = await buildAccountExport(client, {
        userId: user.id,
        householdId,
        email: user.email ?? null,
      });
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const name = meta?.display_name ?? meta?.full_name ?? meta?.name;
      downloadAccountExport(
        serializeAccountExport(next, {
          id: user.id,
          email: user.email ?? null,
          displayName: typeof name === "string" ? name : null,
          createdAt: user.created_at ?? null,
        }),
        accountExportFilename()
      );
      if (mounted.current) setResult(next);
      return next;
    } catch (err) {
      logger.error("Account export failed:", err);
      if (mounted.current) {
        setResult(null);
        setFailed(true);
      }
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setRunning(false);
    }
  }, [householdId]);

  return { run, running, result, failed };
}

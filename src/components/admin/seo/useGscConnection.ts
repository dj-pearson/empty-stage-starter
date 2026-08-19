import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { logger } from '@/lib/logger';

/**
 * US-553: the Google Search Console surface, lifted out of SEOManager.
 *
 * First of the data hooks AC1 asks for. It owns the seven pieces of GSC state
 * and the five handlers that move them, plus its own lifecycle: the
 * connection check on mount and the OAuth-return handshake used to sit in
 * SEOManager's mount effect, and belong with the state they touch.
 *
 * `onKeywordsSynced` is injected rather than imported because a completed sync
 * reloads the tracked-keyword list, which this hook does not own.
 */
export interface UseGscConnectionOptions {
  /** Called after a successful sync so the caller can refresh its keywords. */
  onKeywordsSynced: () => void | Promise<void>;
}

export function useGscConnection({ onKeywordsSynced }: UseGscConnectionOptions) {
  const [gscConnected, setGscConnected] = useState(false);
  const [gscProperties, setGscProperties] = useState<Record<string, unknown>[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [isSyncingGSC, setIsSyncingGSC] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isConnectingGSC, setIsConnectingGSC] = useState(false);
  const [gscSyncResults, setGscSyncResults] = useState<Record<string, unknown> | null>(null);

  /** Returns the connected state it just observed, so callers need not read stale state. */
  const checkGSCConnection = async (): Promise<boolean> => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return false;

      const { data, error } = await invokeEdgeFunction("gsc-oauth", {
        body: { action: "status", userId: user.id },
      });

      if (error) throw error;

      // invokeEdgeFunction leaves `data` null for an empty or non-JSON
      // response, and the catch below would then log a TypeError and leave the
      // panel looking disconnected for the wrong reason. Treat a missing body
      // as "not connected" explicitly.
      const connected = data?.connected === true;
      setGscConnected(connected);

      if (connected) {
        // Load properties
        await fetchGSCPropertiesList();
      }
      return connected;
    } catch (error: unknown) {
      logger.error("Error checking GSC connection:", error);
      return false;
    }
  };

  const connectToGSC = async () => {
    setIsConnectingGSC(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        toast.error("Please log in first");
        return;
      }

      // Get OAuth URL
      const { data, error } = await invokeEdgeFunction("gsc-oauth", {
        body: { action: "initiate", userId: user.id },
      });

      if (error) throw error;

      if (data.authUrl) {
        // Store the connection state before redirecting
        sessionStorage.setItem('gsc_connecting', 'true');
        sessionStorage.setItem('gsc_user_id', user.id);
        
        // Use full page redirect instead of popup to avoid COOP issues
        window.location.href = data.authUrl;
      }
    } catch (error: unknown) {
      logger.error("Error connecting to GSC:", error);
      toast.error(`Failed to connect: ${error.message}`);
      setIsConnectingGSC(false);
    }
  };

  const fetchGSCPropertiesList = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data, error } = await invokeEdgeFunction("gsc-fetch-properties", {
        body: { userId: user.id },
      });

      if (error) {
        logger.warn("Could not fetch GSC properties (may require OAuth setup):", error);
        return;
      }

      if (data.properties && data.properties.length > 0) {
        setGscProperties(data.properties);

        // Auto-select primary property
        const primary = data.properties.find((p) => p.is_primary);
        if (primary) {
          setSelectedProperty(primary.property_url);
        }
      }
    } catch (error: unknown) {
      logger.error("Error fetching GSC properties:", error);
    }
  };

  const syncGSCData = async () => {
    if (!selectedProperty) {
      setGscSyncResults({
        success: false,
        error: "Please select a property first"
      });
      return;
    }

    setIsSyncingGSC(true);
    setGscSyncResults(null);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Not logged in");

      const { data, error } = await invokeEdgeFunction("gsc-sync-data", {
        body: {
          userId: user.id,
          propertyUrl: selectedProperty,
          syncType: "all",
        },
      });

      if (error) throw error;

      setGscSyncResults({
        success: true,
        recordsSynced: data.recordsSynced || 0,
        message: `Synced ${data.recordsSynced} records from Google Search Console!`
      });
      setLastSyncedAt(new Date().toISOString());

      // Reload keywords to show updated GSC data
      await onKeywordsSynced();
    } catch (error: unknown) {
      logger.error("Error syncing GSC data:", error);
      setGscSyncResults({
        success: false,
        error: error.message || "Failed to sync"
      });
    } finally {
      setIsSyncingGSC(false);
    }
  };

  const disconnectGSC = async () => {
    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;

      const { data: _data, error } = await invokeEdgeFunction("gsc-oauth", {
        body: { action: "disconnect", userId: user.id },
      });

      if (error) throw error;

      setGscConnected(false);
      setGscProperties([]);
      setSelectedProperty("");
      setLastSyncedAt(null);

      toast.success("Disconnected from Google Search Console");
    } catch (error: unknown) {
      logger.error("Error disconnecting from GSC:", error);
      toast.error(`Failed to disconnect: ${error.message}`);
    }
  };

  useEffect(() => {
    void checkGSCConnection();

    // Returning from the OAuth round trip.
    const wasConnecting = sessionStorage.getItem('gsc_connecting');
    if (wasConnecting !== 'true') return;

    sessionStorage.removeItem('gsc_connecting');
    setIsConnectingGSC(true);

    const timer = setTimeout(async () => {
      // US-553: this used to read the `gscConnected` state captured when the
      // effect ran, which is always false on mount, so the success toast and
      // the property fetch never fired after a real connection. Use what the
      // check actually returned instead.
      const connected = await checkGSCConnection();
      if (connected) {
        toast.success('Successfully connected to Google Search Console!');
        await fetchGSCPropertiesList();
      }
      setIsConnectingGSC(false);
    }, 1000);

    return () => clearTimeout(timer);
    // Mount-only, matching the effect this replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    gscConnected,
    gscProperties,
    selectedProperty,
    setSelectedProperty,
    isSyncingGSC,
    lastSyncedAt,
    isConnectingGSC,
    gscSyncResults,
    checkGSCConnection,
    connectToGSC,
    fetchGSCPropertiesList,
    syncGSCData,
    disconnectGSC,
  };
}

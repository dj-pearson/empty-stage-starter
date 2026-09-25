import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";

/**
 * Billing and the Settings plan section mount useSubscription twice (directly
 * and through usePlanStatus). realtime-js hands back the SAME channel for a
 * topic it already holds, so two instances on one topic stack two
 * postgres_changes bindings on a channel the server acknowledged with one, and
 * realtime-js drops it ("mismatch between server and client bindings").
 *
 * This runs the real RealtimeClient.channel() (only subscribe() is stubbed so
 * no socket opens) to pin that each instance gets a channel of its own.
 */

const realtime = vi.hoisted(() => ({ client: null as RealtimeClient | null }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "user-1" } } } }),
    },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {
        maybeSingle: async () => ({ data: null, error: null }),
      };
      chain.select = () => chain;
      chain.eq = () => chain;
      return chain;
    }),
    channel: vi.fn((topic: string) => {
      if (!realtime.client) throw new Error("RealtimeClient not set up");
      const ch = realtime.client.channel(topic);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/lib/edge-functions", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "./useSubscription";

function postgresBindings(ch: RealtimeChannel): number {
  const bindings = (ch as unknown as { bindings: Record<string, unknown[] | undefined> }).bindings;
  return bindings.postgres_changes?.length ?? 0;
}

describe("useSubscription realtime channel", () => {
  it("gives each mounted instance its own channel with exactly one binding", async () => {
    realtime.client = new RealtimeClient("ws://localhost/realtime/v1", { params: { apikey: "REPLACE_WITH_ANON_KEY" } });

    const first = renderHook(() => useSubscription());
    const second = renderHook(() => useSubscription());
    await waitFor(() => expect(vi.mocked(supabase.channel)).toHaveBeenCalledTimes(2));

    const channels = vi.mocked(supabase.channel).mock.results.map((r) => r.value as RealtimeChannel);
    expect(channels[0]).not.toBe(channels[1]);
    expect(channels[0].topic).not.toBe(channels[1].topic);
    for (const ch of channels) {
      expect(ch.topic).toMatch(/^realtime:subscription-updates:user-1:/);
      expect(postgresBindings(ch)).toBe(1);
    }

    first.unmount();
    second.unmount();
    expect(vi.mocked(supabase.removeChannel)).toHaveBeenCalledTimes(2);
  });

  it("documents why: realtime-js reuses a channel for a repeated topic", () => {
    const client = new RealtimeClient("ws://localhost/realtime/v1", { params: { apikey: "REPLACE_WITH_ANON_KEY" } });
    expect(client.channel("subscription-updates:user-1")).toBe(client.channel("subscription-updates:user-1"));
  });
});

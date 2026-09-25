/**
 * The Picky-Eater Win Network opt-in (US-296): whether this account's
 * try-bite outcomes join the anonymous community aggregate.
 *
 * The server row is the truth: picky_win_preferences.share_chain_outcomes,
 * one row per user, RLS own-row only, column default TRUE. It already exists
 * (20260520000003), so there is no migration. Until this module, the choice
 * lived only in localStorage and signOutScrub deleted it, so a parent who
 * opted out was silently opted back in by signing out.
 *
 * Shape follows weekStartPref: a store every surface reads, bound to React by
 * usePickyWinSharePref. Two differences, both about privacy:
 *
 * - `loaded` is false until the server has answered for the current user, and
 *   isShareChainOptedIn() is false until then. Contributing is the thing the
 *   parent may have said no to, so the unknown case contributes nothing.
 * - The device cache (the same key the old hook used) only paints the switch.
 *   It records whose value it holds, so a second account on a shared tablet
 *   does not see the first one's choice, and it is never read as consent.
 */

import { supabase } from "@/integrations/supabase/client";
import { getSyncStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";

/** Cache only. signOutScrub removes it; the server row survives. */
export const SHARE_CHAIN_CACHE_KEY = "eatpal.share_chain_outcomes";
/** picky_win_preferences.share_chain_outcomes column default. */
export const DEFAULT_SHARE_CHAIN = true;

export interface ShareChainState {
  /** The user this value belongs to; null when signed out. */
  userId: string | null;
  value: boolean;
  /** The server has answered for `userId` (or a save has landed). */
  loaded: boolean;
  /** A save is in flight. */
  pending: boolean;
}

interface CacheShape {
  u: string | null;
  v: boolean;
}

/**
 * Reads the cache. The pre-store hook wrote a bare JSON boolean with no owner;
 * that is returned with u = null so only the legacy migration below uses it.
 */
function readCache(): CacheShape | null {
  try {
    const raw = getSyncStorage().getItem(SHARE_CHAIN_CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "boolean") return { u: null, v: parsed };
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.v !== "boolean") return null;
    return { u: typeof rec.u === "string" ? rec.u : null, v: rec.v };
  } catch {
    return null;
  }
}

function writeCache(u: string, v: boolean): void {
  try {
    getSyncStorage().setItem(SHARE_CHAIN_CACHE_KEY, JSON.stringify({ u, v }));
  } catch {
    // A full or blocked storage only costs the first-paint guess.
  }
}

type Listener = () => void;

const SIGNED_OUT: ShareChainState = Object.freeze({
  userId: null,
  value: DEFAULT_SHARE_CHAIN,
  loaded: false,
  pending: false,
});

let state: ShareChainState = SIGNED_OUT;
const listeners = new Set<Listener>();
/** The user whose server row is being fetched, and that fetch. */
let inflight: { userId: string; promise: Promise<void> } | null = null;
/** Bumped by every local save, so a load that started earlier cannot overwrite it. */
let writeVersion = 0;

function setState(next: ShareChainState): void {
  if (
    next.userId === state.userId &&
    next.value === state.value &&
    next.loaded === state.loaded &&
    next.pending === state.pending
  ) {
    return;
  }
  state = next;
  for (const l of listeners) l();
}

export function getShareChainState(): ShareChainState {
  return state;
}

export function subscribeShareChain(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * True only when the server has confirmed this signed-in user shares. Every
 * contribution path checks this; unknown means no.
 */
export function isShareChainOptedIn(): boolean {
  return state.loaded && state.userId !== null && state.value;
}

/**
 * The signed-in user is now `userId` (null: signed out). Switching user drops
 * the loaded flag; the switch paints from the cache only when it was written
 * for this same user.
 */
export function adoptShareChainUser(userId: string | null): void {
  if (userId === state.userId) return;
  if (!userId) {
    setState(SIGNED_OUT);
    return;
  }
  const cached = readCache();
  setState({
    userId,
    value: cached && cached.u === userId ? cached.v : DEFAULT_SHARE_CHAIN,
    loaded: false,
    pending: false,
  });
}

async function fetchRow(userId: string): Promise<void> {
  const startedAt = writeVersion;
  const { data, error } = await supabase
    .from("picky_win_preferences")
    .select("share_chain_outcomes")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // Stay unloaded: contributions stay off, and the next mount retries.
    logger.warn("[shareChainPref] load failed", { code: error.code });
    return;
  }
  // Signed out or switched while this was in flight, or a save landed first.
  if (state.userId !== userId || writeVersion !== startedAt) return;

  if (data) {
    writeCache(userId, data.share_chain_outcomes);
    setState({ ...state, value: data.share_chain_outcomes, loaded: true });
    return;
  }

  // No row: the user never chose on the server. A legacy device-only opt-out
  // (the old hook's bare `false`, or this user's cached `false`) is carried to
  // the server once, so moving to server truth never re-opts anyone in.
  const cached = readCache();
  const legacyOptOut = cached !== null && cached.v === false && (cached.u === null || cached.u === userId);
  if (legacyOptOut) {
    const { error: upsertError } = await supabase
      .from("picky_win_preferences")
      .upsert(
        { user_id: userId, share_chain_outcomes: false, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (upsertError) logger.warn("[shareChainPref] legacy opt-out not saved", { code: upsertError.code });
    if (state.userId !== userId || writeVersion !== startedAt) return;
    writeCache(userId, false);
    setState({ ...state, value: false, loaded: true });
    return;
  }
  setState({ ...state, value: DEFAULT_SHARE_CHAIN, loaded: true });
}

/**
 * Load `userId`'s row unless it is loaded or already being fetched. Adopts the
 * user first, so a caller cannot load one account into another's state.
 */
export function loadShareChainPref(userId: string): Promise<void> {
  adoptShareChainUser(userId);
  if (state.loaded && state.userId === userId) return Promise.resolve();
  if (inflight && inflight.userId === userId) return inflight.promise;
  const promise = fetchRow(userId)
    .catch((error: unknown) => {
      logger.warn("[shareChainPref] load threw", error instanceof Error ? error.message : "unknown");
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { userId, promise };
  return promise;
}

/**
 * Save the choice for `userId`. The switch moves at once; a failed save puts
 * it back and returns the error so the caller can say so.
 */
export async function setShareChainPref(userId: string, next: boolean): Promise<{ error: string | null }> {
  adoptShareChainUser(userId);
  const previous = state;
  writeVersion += 1;
  const version = writeVersion;
  setState({ ...state, value: next, pending: true });
  let message: string | null = null;
  try {
    const { error } = await supabase
      .from("picky_win_preferences")
      .upsert(
        { user_id: userId, share_chain_outcomes: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (error) {
      logger.warn("[shareChainPref] save failed", { code: error.code });
      message = error.message || "save failed";
    }
  } catch (error) {
    message = error instanceof Error ? error.message : "save failed";
  }
  // Another save or a user switch superseded this one: leave its state alone.
  if (state.userId !== userId || version !== writeVersion) return { error: message };
  if (message !== null) {
    setState({ ...state, value: previous.value, loaded: previous.loaded, pending: false });
    return { error: message };
  }
  writeCache(userId, next);
  setState({ ...state, value: next, loaded: true, pending: false });
  return { error: null };
}

/** Tests only: forget everything held in memory. */
export function resetShareChainPrefForTests(): void {
  state = SIGNED_OUT;
  inflight = null;
  writeVersion = 0;
  listeners.clear();
}

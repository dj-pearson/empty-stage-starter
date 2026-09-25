/**
 * The user's "week starts on" preference (item 3): Sunday or Monday, Monday
 * by default.
 *
 * Stored per user in `user_preferences` under the key `week_starts_on` with a
 * JSON value of 0 (Sunday) or 1 (Monday). That table already exists with RLS
 * (20260516000000_user_preferences.sql), so no migration and nothing an older
 * iOS build reads changes. Older builds never read the key and keep their own
 * week math.
 *
 * Precedence follows US-341: a device cache paints first so the grid does not
 * jump, the server row replaces it once the user is known, and the cache is
 * write-through only. The cache remembers whose value it holds, so a second
 * account signing in on the same browser does not inherit the first one's
 * week.
 *
 * This module is the one store every surface reads (planner, grocery week,
 * ApplyTemplateDialog, reports), so a change in Settings moves all of them
 * together. React binds to it through useWeekStartsOn.
 */

import { PLANNER_WEEK_STARTS_ON, type WeekStartsOn } from "@/lib/date-utils";
import { getSyncStorage } from "@/lib/platform";

export type { WeekStartsOn };

export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = PLANNER_WEEK_STARTS_ON;
export const WEEK_STARTS_ON_PREF_KEY = "week_starts_on";
export const WEEK_STARTS_ON_CACHE_KEY = "eatpal.week_starts_on";

/** 0 or 1 (number or numeric string) is a preference; anything else is not. */
export function parseWeekStartsOn(value: unknown): WeekStartsOn | null {
  if (value === 0 || value === "0") return 0;
  if (value === 1 || value === "1") return 1;
  return null;
}

interface CacheShape {
  u: string | null;
  v: WeekStartsOn;
}

function readCache(): CacheShape | null {
  try {
    const raw = getSyncStorage().getItem(WEEK_STARTS_ON_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    const v = parseWeekStartsOn(rec.v);
    if (v === null) return null;
    return { u: typeof rec.u === "string" ? rec.u : null, v };
  } catch {
    return null;
  }
}

function writeCache(u: string | null, v: WeekStartsOn): void {
  try {
    getSyncStorage().setItem(WEEK_STARTS_ON_CACHE_KEY, JSON.stringify({ u, v }));
  } catch {
    // A full or blocked storage only costs the first-paint guess.
  }
}

type Listener = () => void;

let current: WeekStartsOn | null = null;
let owner: string | null = null;
const listeners = new Set<Listener>();

function ensureLoaded(): WeekStartsOn {
  if (current === null) {
    const cached = readCache();
    current = cached?.v ?? DEFAULT_WEEK_STARTS_ON;
    owner = cached?.u ?? null;
  }
  return current;
}

function emit(): void {
  for (const l of listeners) l();
}

export function getWeekStartsOn(): WeekStartsOn {
  return ensureLoaded();
}

export function subscribeWeekStartsOn(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Set the value for `userId` and persist it to the device cache. Used for a
 * local change and for the server's answer alike.
 */
export function setWeekStartsOnLocal(value: WeekStartsOn, userId: string | null): void {
  ensureLoaded();
  owner = userId;
  writeCache(userId, value);
  if (current === value) return;
  current = value;
  emit();
}

/**
 * The signed-in user is now `userId`. A cache written for someone else falls
 * back to the default until this user's server row answers.
 */
export function adoptWeekStartsOnUser(userId: string | null): void {
  ensureLoaded();
  if (!userId || owner === userId) return;
  const previousOwner = owner;
  owner = userId;
  if (previousOwner !== null && current !== DEFAULT_WEEK_STARTS_ON) {
    current = DEFAULT_WEEK_STARTS_ON;
    emit();
  }
}

/** Tests only: forget the in-memory value so the next read goes to the cache. */
export function resetWeekStartsOnForTests(): void {
  current = null;
  owner = null;
  listeners.clear();
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeHouseholdId } from "@/lib/householdId";
import { logger } from "@/lib/logger";
import {
  OFFLINE_WRITE_MESSAGE,
  isBrowserOffline,
  isOfflineFailure,
  userFacingError,
} from "@/lib/networkFailure";

/** US-840: an invite either exists or there is a reason it does not. */
export type CreateInviteResult =
  | { ok: true; code: string }
  | { ok: false; message: string };

/** Every household write says whether it landed, and why not when it did not. */
export type MutationResult = { ok: true } | { ok: false; message: string };

export type HouseholdStatus = "loading" | "ready" | "error" | "signed-out";

export type InviteRole = "parent" | "guardian";

/**
 * The household's members and its live invite codes, in one place (US-789).
 *
 * Web had only ManageHouseholdDialog, opened from Home, against iOS's full
 * HouseholdSettingsView. Extracting the data layer here rather than copying it
 * into a new page is the whole point: this repo has already paid for three
 * shortfall functions, three grocery insert allowlists and two calendar
 * implementations, and a second copy of the household queries would be the next
 * one.
 *
 * What this hook used to get wrong, and no longer does:
 *
 *  - It resolved the household itself, with getUser() (a network call) and an
 *    unordered `.maybeSingle()` on household_members. A user with two
 *    membership rows got a PGRST116 error that nobody read, and a blank page.
 *    The household now comes from AuthContext, which resolves it through
 *    get_user_household_id like every other household query in the app.
 *  - The roster embedded `profiles ( full_name )`. household_members has no
 *    foreign key to profiles, so PostgREST refused the embed; the error was
 *    never destructured, members fell back to [], and the page told a parent
 *    "You are the only person in this household". The roster is now a plain
 *    select, and names come from a second, non-fatal profiles lookup.
 *  - Writes that matched 0 rows (RLS, or a row already gone) reported success.
 *    Every delete and update now asks for the affected ids back and treats an
 *    empty answer as a failure.
 *
 * household_members is not in the supabase_realtime publication, so a channel
 * would subscribe and then hear nothing. Freshness comes from refetching when
 * the tab becomes visible and when the browser comes back online.
 */

export interface HouseholdMember {
  id: string;
  user_id: string;
  role: string;
  /** "" when the row has no joined_at; it sorts last either way. */
  joined_at: string;
  /**
   * profiles RLS is own-row only, so this is null for everyone but the viewer
   * until a roster RPC exists. Consumers fall back to a role label.
   */
  profiles: { full_name: string | null } | null;
  /** This row is the signed-in user's own membership. */
  isSelf: boolean;
  /**
   * The member whose plan provides the household's seats. Mirrors
   * household_owner_id in 20260909000000_household_seat_limit.sql: earliest
   * joined_at (nulls last), then lowest id.
   */
  isOwner: boolean;
}

/**
 * US-789 AC 4: the generated row, not a hand-written mirror of the migration.
 * US-761 regenerated types.ts against the migrated schema, so the real row is
 * available and no cast is needed at the query.
 */
export type HouseholdInviteCode =
  Database["public"]["Tables"]["household_invite_codes"]["Row"];

type MemberRow = Pick<
  Database["public"]["Tables"]["household_members"]["Row"],
  "id" | "user_id" | "role" | "joined_at"
>;

export interface HouseholdState {
  householdId: string | null;
  householdName: string;
  members: HouseholdMember[];
  /** Unused and unexpired only, newest first: a spent code is not an outstanding invite. */
  inviteCodes: HouseholdInviteCode[];
  status: HouseholdStatus;
  /** True until the first load settles (ready or error). Never set again by a refresh. */
  loading: boolean;
  /** A background reload is in flight. The lists stay on screen meanwhile. */
  refreshing: boolean;
  error: string | null;
  isOffline: boolean;
  currentUserId: string | null;
}

export interface UseHouseholdResult extends HouseholdState {
  viewerIsOwner: boolean;
  reload: () => Promise<void>;
  createInviteCode: (role?: InviteRole) => Promise<CreateInviteResult>;
  revokeInviteCode: (id: string) => Promise<MutationResult>;
  removeMember: (memberId: string) => Promise<MutationResult>;
  renameHousehold: (name: string) => Promise<MutationResult>;
  leaveHousehold: () => Promise<MutationResult>;
}

export const HOUSEHOLD_NAME_MAX_LENGTH = 60;

const LOAD_FAILED = "We could not load your household.";

const INITIAL: HouseholdState = {
  householdId: null,
  householdName: "",
  members: [],
  inviteCodes: [],
  status: "loading",
  loading: true,
  refreshing: false,
  error: null,
  isOffline: false,
  currentUserId: null,
};

/** joined_at ASC NULLS LAST, then id ASC: the order household_owner_id uses. */
function compareByJoined(
  a: { id: string; joined_at: string | null },
  b: { id: string; joined_at: string | null }
): number {
  const aj = a.joined_at || null;
  const bj = b.joined_at || null;
  if (aj !== bj) {
    if (aj === null) return 1;
    if (bj === null) return -1;
    const at = Date.parse(aj);
    const bt = Date.parse(bj);
    if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return at - bt;
    if (aj < bj) return -1;
    if (aj > bj) return 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Recompute isSelf / isOwner and put the roster in display order: the owner,
 * then the viewer, then everyone else by when they joined. Pure, so a removal
 * that changes who the owner is recomputes the same way a load does.
 */
export function rankHouseholdMembers<
  T extends { id: string; user_id: string; joined_at: string | null },
>(rows: T[], currentUserId: string | null): Array<T & { isSelf: boolean; isOwner: boolean }> {
  const byJoined = [...rows].sort(compareByJoined);
  const ownerId = byJoined[0]?.id ?? null;
  const ranked = byJoined.map((row) => ({
    ...row,
    isSelf: currentUserId !== null && row.user_id === currentUserId,
    isOwner: row.id === ownerId,
  }));
  const weight = (m: { isSelf: boolean; isOwner: boolean }) =>
    m.isOwner ? 0 : m.isSelf ? 1 : 2;
  // Array.prototype.sort is stable, so equal weights keep the joined order.
  return ranked.sort((a, b) => weight(a) - weight(b));
}

/**
 * A failed read is never worth quoting. userFacingError passes unknown text
 * through (GoTrue writes its messages for people), but a PostgREST error on a
 * roster read -- "Could not find a relationship between household_members and
 * profiles" -- is schema detail, so anything carrying a PostgREST code gets the
 * fallback. Offline still says offline.
 */
function loadErrorMessage(error: unknown): string {
  const hasCode =
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string";
  const looksLikeSchema =
    typeof error === "object" &&
    error !== null &&
    /relationship|schema cache|column|relation/i.test(String((error as { message?: unknown }).message ?? ""));
  if (!isOfflineFailure(error) && (hasCode || looksLikeSchema)) return LOAD_FAILED;
  return userFacingError(error, LOAD_FAILED);
}

function offlineFrom(error: unknown): boolean {
  return isOfflineFailure(error) || isBrowserOffline();
}

export function useHousehold(): UseHouseholdResult {
  const { userId: authUserId, householdId: authHouseholdId } = useAuth();

  /**
   * Who and which household, before anything is fetched. AuthContext is the
   * authority. Outside an AuthProvider (tests, standalone use) the session is
   * read locally and the household comes from the same RPC AuthContext uses.
   */
  const [resolved, setResolved] = useState<{
    userId: string | null;
    householdId: string | null;
    status: "pending" | "resolved" | "signed-out" | "error";
    error: unknown;
  }>({ userId: null, householdId: null, status: "pending", error: null });
  const [resolveNonce, setResolveNonce] = useState(0);

  useEffect(() => {
    if (authHouseholdId) {
      setResolved({ userId: authUserId, householdId: authHouseholdId, status: "resolved", error: null });
      return;
    }
    if (authUserId) {
      // Signed in, household still resolving in AuthContext: stay loading.
      setResolved({ userId: authUserId, householdId: null, status: "pending", error: null });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user?.id ?? null;
        if (!uid) {
          if (!cancelled) setResolved({ userId: null, householdId: null, status: "signed-out", error: null });
          return;
        }
        const { data, error } = await supabase.rpc("get_user_household_id", { _user_id: uid });
        if (error) throw error;
        if (!cancelled) {
          setResolved({ userId: uid, householdId: normalizeHouseholdId(data), status: "resolved", error: null });
        }
      } catch (error) {
        logger.error("Error resolving household:", error);
        if (!cancelled) setResolved({ userId: null, householdId: null, status: "error", error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, authHouseholdId, resolveNonce]);

  const [state, setState] = useState<HouseholdState>(INITIAL);

  // Refs keep the mutation callbacks stable while still seeing current values.
  const householdIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const stateRef = useRef<HouseholdState>(INITIAL);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const householdId = householdIdRef.current;
    const currentUserId = currentUserIdRef.current;
    if (!householdId) return;
    const seq = ++seqRef.current;

    // A refresh never blanks anything and never flips `loading` back on.
    setState((prev) => (prev.loading ? prev : { ...prev, refreshing: true }));

    const isStale = () =>
      !mountedRef.current || seq !== seqRef.current || householdIdRef.current !== householdId;

    try {
      const [householdRes, membersRes, codesRes] = await Promise.all([
        supabase.from("households").select("name").eq("id", householdId).maybeSingle(),
        supabase
          .from("household_members")
          .select("id, user_id, role, joined_at")
          .eq("household_id", householdId),
        supabase
          .from("household_invite_codes")
          .select("*")
          .eq("household_id", householdId)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }),
      ]);

      const failure = membersRes.error ?? householdRes.error ?? codesRes.error;
      if (failure) throw failure;

      const rows: MemberRow[] = membersRes.data ?? [];
      const userIds = [...new Set(rows.map((r) => r.user_id))];

      // Names are a nicety, not the roster. A failure here leaves names null.
      const names = new Map<string, string | null>();
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        if (profilesError) {
          logger.warn("Household member names unavailable:", profilesError);
        } else {
          for (const p of profiles ?? []) names.set(p.id, p.full_name ?? null);
        }
      }

      if (isStale()) return;

      const members = rankHouseholdMembers(
        rows.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          role: r.role,
          joined_at: r.joined_at ?? "",
          profiles: names.has(r.user_id) ? { full_name: names.get(r.user_id) ?? null } : null,
        })),
        currentUserId
      );

      setState((prev) => ({
        ...prev,
        householdId,
        householdName: householdRes.data?.name ?? "",
        members,
        inviteCodes: codesRes.data ?? [],
        status: "ready",
        loading: false,
        refreshing: false,
        error: null,
        isOffline: false,
        currentUserId,
      }));
    } catch (error) {
      logger.error("Error loading household:", error);
      if (isStale()) return;
      // Keep whatever was loaded before; an error is never an empty roster.
      setState((prev) => ({
        ...prev,
        status: "error",
        loading: false,
        refreshing: false,
        error: loadErrorMessage(error),
        isOffline: offlineFrom(error),
      }));
    }
  }, []);

  // Apply the resolution, then load keyed on the household.
  useEffect(() => {
    const previousHouseholdId = householdIdRef.current;
    householdIdRef.current = resolved.householdId;
    currentUserIdRef.current = resolved.userId;

    if (resolved.status === "pending") {
      seqRef.current++;
      setState({ ...INITIAL, currentUserId: resolved.userId });
      return;
    }
    if (resolved.status === "signed-out") {
      seqRef.current++;
      setState({ ...INITIAL, status: "signed-out", loading: false });
      return;
    }
    if (resolved.status === "error") {
      seqRef.current++;
      setState((prev) => ({
        ...prev,
        status: "error",
        loading: false,
        refreshing: false,
        error: loadErrorMessage(resolved.error),
        isOffline: offlineFrom(resolved.error),
      }));
      return;
    }
    if (!resolved.householdId) {
      // Signed in with no household yet: nothing to show, and nothing failed.
      seqRef.current++;
      setState({ ...INITIAL, status: "ready", loading: false, currentUserId: resolved.userId });
      return;
    }
    if (previousHouseholdId !== resolved.householdId) {
      // A different household: never show the last one's people while loading.
      setState({ ...INITIAL, householdId: resolved.householdId, currentUserId: resolved.userId });
    }
    void load();
  }, [resolved, load]);

  // Freshness without realtime.
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && householdIdRef.current) void load();
    };
    const onOnline = () => {
      setState((prev) => (prev.isOffline ? { ...prev, isOffline: false } : prev));
      if (householdIdRef.current) void load();
    };
    const onOffline = () => {
      setState((prev) => (prev.isOffline ? prev : { ...prev, isOffline: true }));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [load]);

  const reload = useCallback(async (): Promise<void> => {
    if (householdIdRef.current) {
      await load();
    } else {
      setResolveNonce((n) => n + 1);
    }
  }, [load]);

  /**
   * Mint an invite link.
   *
   * US-840: the RPC refuses when the household has used every seat its plan
   * allows, and the refusal carries the reason ("...is full. Upgrade to Family
   * Plus to add more caregivers."). The message comes back sanitised through
   * userFacingError so a constraint or RLS string can never reach the screen in
   * its place.
   */
  const createInviteCode = useCallback(
    async (role: InviteRole = "parent"): Promise<CreateInviteResult> => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: string | null; error: unknown }>
      )("create_household_invite", { p_role: role });

      if (error || !data) {
        logger.error("Error creating invite code:", error);
        return {
          ok: false,
          message: userFacingError(error, "Couldn't create an invite link."),
        };
      }
      // Background refresh so the new row appears; the caller has its code now.
      void load();
      return { ok: true, code: data };
    },
    [load]
  );

  const revokeInviteCode = useCallback(
    async (id: string): Promise<MutationResult> => {
      const removed = stateRef.current.inviteCodes.find((c) => c.id === id);
      setState((prev) => ({ ...prev, inviteCodes: prev.inviteCodes.filter((c) => c.id !== id) }));
      const restore = () => {
        if (!removed) return;
        setState((prev) =>
          prev.inviteCodes.some((c) => c.id === id)
            ? prev
            : {
                ...prev,
                inviteCodes: [...prev.inviteCodes, removed].sort((a, b) =>
                  a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
                ),
              }
        );
      };

      try {
        const { data, error } = await supabase
          .from("household_invite_codes")
          .delete()
          .eq("id", id)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          // Nothing matched: already used, expired, or never ours to delete.
          // Leave it off the list and let a refresh show the truth.
          void load();
          return { ok: false, message: "That link was already used or has expired." };
        }
        return { ok: true };
      } catch (error) {
        logger.error("Error revoking invite code:", error);
        restore();
        return { ok: false, message: userFacingError(error, "Couldn't revoke that invite.") };
      }
    },
    [load]
  );

  const removeMember = useCallback(async (memberId: string): Promise<MutationResult> => {
    const removed = stateRef.current.members.find((m) => m.id === memberId);
    const uid = currentUserIdRef.current;
    setState((prev) => ({
      ...prev,
      members: rankHouseholdMembers(
        prev.members.filter((m) => m.id !== memberId),
        uid
      ),
    }));
    const restore = () => {
      if (!removed) return;
      setState((prev) =>
        prev.members.some((m) => m.id === memberId)
          ? prev
          : { ...prev, members: rankHouseholdMembers([...prev.members, removed], uid) }
      );
    };

    try {
      const { data, error } = await supabase
        .from("household_members")
        .delete()
        .eq("id", memberId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        restore();
        return { ok: false, message: "Couldn't remove that member. They may have already left." };
      }
      return { ok: true };
    } catch (error) {
      logger.error("Error removing member:", error);
      restore();
      return { ok: false, message: userFacingError(error, "Couldn't remove that member.") };
    }
  }, []);

  const renameHousehold = useCallback(async (raw: string): Promise<MutationResult> => {
    const name = raw.trim();
    if (!name) return { ok: false, message: "Enter a name for your household." };
    if (name.length > HOUSEHOLD_NAME_MAX_LENGTH) {
      return {
        ok: false,
        message: `Keep the name to ${HOUSEHOLD_NAME_MAX_LENGTH} characters or fewer.`,
      };
    }
    const householdId = householdIdRef.current;
    if (!householdId) return { ok: false, message: "There is no household to rename yet." };

    const previousName = stateRef.current.householdName;
    setState((prev) => ({ ...prev, householdName: name }));
    const rollback = () =>
      setState((prev) => (prev.householdName === name ? { ...prev, householdName: previousName } : prev));

    try {
      const { data, error } = await supabase
        .from("households")
        .update({ name })
        .eq("id", householdId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        rollback();
        return { ok: false, message: "Couldn't rename the household." };
      }
      return { ok: true };
    } catch (error) {
      logger.error("Error renaming household:", error);
      rollback();
      return { ok: false, message: userFacingError(error, "Couldn't rename the household.") };
    }
  }, []);

  /**
   * Leave this household. The caller does a full navigation afterwards so
   * AuthContext re-resolves through ensure_user_household; the hook does not
   * navigate.
   */
  const leaveHousehold = useCallback(async (): Promise<MutationResult> => {
    const { members, status } = stateRef.current;
    const currentUserId = currentUserIdRef.current;
    if (isBrowserOffline()) return { ok: false, message: OFFLINE_WRITE_MESSAGE };
    if (status !== "ready" || !currentUserId) {
      return { ok: false, message: "Your household is still loading. Try again in a moment." };
    }
    const self = members.find((m) => m.isSelf);
    if (!self) return { ok: false, message: "We could not find your place in this household." };
    if (members.length <= 1) {
      return { ok: false, message: "You are the only member; there is nothing to leave." };
    }
    if (self.isOwner) {
      return {
        ok: false,
        message: "Your plan provides this household's seats. Remove the other members before you leave.",
      };
    }

    try {
      const { data, error } = await supabase
        .from("household_members")
        .delete()
        .eq("id", self.id)
        .eq("user_id", currentUserId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        return { ok: false, message: "Couldn't leave the household. Try again." };
      }
      return { ok: true };
    } catch (error) {
      logger.error("Error leaving household:", error);
      return { ok: false, message: userFacingError(error, "Couldn't leave the household. Try again.") };
    }
  }, []);

  const viewerIsOwner = useMemo(() => state.members.some((m) => m.isSelf && m.isOwner), [state.members]);

  return useMemo(
    () => ({
      ...state,
      viewerIsOwner,
      reload,
      createInviteCode,
      revokeInviteCode,
      removeMember,
      renameHousehold,
      leaveHousehold,
    }),
    [state, viewerIsOwner, reload, createInviteCode, revokeInviteCode, removeMember, renameHousehold, leaveHousehold]
  );
}

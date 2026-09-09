import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";
import { userFacingError } from "@/lib/networkFailure";

/** US-840: an invite either exists or there is a reason it does not. */
export type CreateInviteResult =
  | { ok: true; code: string }
  | { ok: false; message: string };

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
 * ONE BUG FIXED IN THE MOVE. The dialog CREATED invite codes through the
 * create_household_invite RPC (which writes household_invite_codes) but listed
 * "pending invitations" from household_invitations, a different table left over
 * from the email-invite flow that US-337 replaced. So the list never showed the
 * code you had just made, and there was no way to see or revoke an outstanding
 * one. This reads the table the codes are actually in.
 *
 * household_invite_codes is absent from src/integrations/supabase/types.ts --
 * US-761 regenerates those, and that needs credentials this repo does not carry
 * -- so the row shape is declared here and the query is cast at exactly one
 * boundary rather than at every call site.
 */

export interface HouseholdMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string | null } | null;
}

/**
 * US-789 AC 4: the generated row, not a hand-written mirror of the migration.
 *
 * This was an interface copied from 20260426000001_household_invite_codes.sql
 * because the table was missing from types.ts, which also forced the two
 * `.from("household_invite_codes")` casts below -- telling the
 * compiler the query hit a different table entirely so it would type-check.
 * US-761 regenerated types.ts against the migrated schema, so the real row is
 * available and the lie can go. It carries created_by, household_id and
 * used_by as well, which the hand-written copy had dropped.
 */
export type HouseholdInviteCode =
  Database["public"]["Tables"]["household_invite_codes"]["Row"];

export interface HouseholdState {
  householdId: string | null;
  householdName: string;
  members: HouseholdMember[];
  /** Unused and unexpired only: a spent code is not an outstanding invite. */
  inviteCodes: HouseholdInviteCode[];
  loading: boolean;
  error: string | null;
}

const EMPTY: HouseholdState = {
  householdId: null,
  householdName: "",
  members: [],
  inviteCodes: [],
  loading: true,
  error: null,
};

export function useHousehold() {
  const [state, setState] = useState<HouseholdState>(EMPTY);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState({ ...EMPTY, loading: false });
        return;
      }

      const { data: membership } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership?.household_id) {
        setState({ ...EMPTY, loading: false });
        return;
      }

      const householdId = membership.household_id as string;

      const [{ data: household }, { data: members }, { data: codes }] = await Promise.all([
        supabase.from("households").select("name").eq("id", householdId).maybeSingle(),
        supabase
          .from("household_members")
          .select("id, user_id, role, joined_at, profiles ( full_name )")
          .eq("household_id", householdId),
        supabase
          .from("household_invite_codes")
          .select("*")
          .eq("household_id", householdId)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);

      setState({
        householdId,
        householdName: (household as { name?: string } | null)?.name ?? "",
        members: (members ?? []) as unknown as HouseholdMember[],
        // No `as unknown` on this one any more: with the table in types.ts the
        // client infers the row itself. HouseholdMember still needs the escape
        // because its select embeds a joined `profiles ( full_name )`, which
        // the generated types do not describe as a nested object.
        inviteCodes: codes ?? [],
        loading: false,
        error: null,
      });
    } catch (error) {
      logger.error("Error loading household:", error);
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Failed to load household data",
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Mint an invite link.
   *
   * US-840: the RPC now refuses when the household has used every seat its
   * plan allows, and the refusal carries the reason ("...is full. Upgrade to
   * Family Plus to add more caregivers."). This used to return a bare null and
   * the page turned every failure into "Couldn't create an invite link", so
   * the one message the user needed -- the paywall -- was the one thrown away.
   * The message comes back now, sanitised through userFacingError so a
   * constraint or RLS string can never reach the screen in its place.
   */
  const createInviteCode = useCallback(
    async (role = "parent"): Promise<CreateInviteResult> => {
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
      await load();
      return { ok: true, code: data };
    },
    [load]
  );

  const revokeInviteCode = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase
        .from("household_invite_codes")
        .delete()
        .eq("id", id);
      if (error) {
        logger.error("Error revoking invite code:", error);
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  const removeMember = useCallback(
    async (memberId: string): Promise<boolean> => {
      const { error } = await supabase.from("household_members").delete().eq("id", memberId);
      if (error) {
        logger.error("Error removing member:", error);
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  const renameHousehold = useCallback(
    async (name: string): Promise<boolean> => {
      if (!state.householdId || !name.trim()) return false;
      const { error } = await supabase
        .from("households")
        .update({ name: name.trim() })
        .eq("id", state.householdId);
      if (error) {
        logger.error("Error renaming household:", error);
        return false;
      }
      await load();
      return true;
    },
    [load, state.householdId]
  );

  return { ...state, reload: load, createInviteCode, revokeInviteCode, removeMember, renameHousehold };
}

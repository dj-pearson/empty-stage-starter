import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

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

/** Mirrors supabase/migrations/20260426000001_household_invite_codes.sql. */
export interface HouseholdInviteCode {
  id: string;
  code: string;
  role: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

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
          .from("household_invite_codes" as "households")
          .select("*")
          .eq("household_id", householdId)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString()),
      ]);

      setState({
        householdId,
        householdName: (household as { name?: string } | null)?.name ?? "",
        members: (members ?? []) as unknown as HouseholdMember[],
        inviteCodes: (codes ?? []) as unknown as HouseholdInviteCode[],
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

  /** Returns the new code, or null when the RPC refused. */
  const createInviteCode = useCallback(
    async (role = "parent"): Promise<string | null> => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>
        ) => Promise<{ data: string | null; error: unknown }>
      )("create_household_invite", { p_role: role });

      if (error || !data) {
        logger.error("Error creating invite code:", error);
        return null;
      }
      await load();
      return data;
    },
    [load]
  );

  const revokeInviteCode = useCallback(
    async (id: string): Promise<boolean> => {
      const { error } = await supabase
        .from("household_invite_codes" as "households")
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

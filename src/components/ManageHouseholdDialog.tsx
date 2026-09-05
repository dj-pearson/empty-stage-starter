import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * A link to the household page (US-789).
 *
 * This was 366 lines: a dialog with its own copies of the household queries,
 * the invite RPC, member removal and the rename. It has been replaced by
 * /dashboard/household, which is a strange thing to have kept behind a modal in
 * the first place -- a dialog is for a decision, and handing somebody access to
 * your children's records is a screen you come back to.
 *
 * Kept as a thin wrapper rather than deleted outright because Home mounts it in
 * a column of buttons and the story asks for exactly this. Its data layer lives
 * in useHousehold, so there is no second implementation to drift.
 *
 * The old dialog also had a real bug that moved with the page and was fixed
 * there: it created invite codes through create_household_invite (which writes
 * household_invite_codes) but listed pending invitations from
 * household_invitations, a leftover of the email-invite flow US-337 replaced --
 * so the code you had just made never appeared, and an outstanding one could
 * not be revoked.
 */
export function ManageHouseholdDialog() {
  return (
    <Button asChild variant="outline" className="w-full justify-start">
      <Link to="/dashboard/household">
        <Users className="mr-2 h-4 w-4" aria-hidden="true" />
        Manage household
      </Link>
    </Button>
  );
}

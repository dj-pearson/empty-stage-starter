import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Users, UserPlus, Copy, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useHousehold } from "@/hooks/useHousehold";
import { buildInviteLink } from "@/lib/householdInvite";

/**
 * Household settings on the web (US-789).
 *
 * iOS has HouseholdSettingsView. Web had ManageHouseholdDialog, a modal reached
 * from one button on Home, which is a strange place to keep the screen where
 * you hand somebody access to your children's records: a dialog is for a
 * decision, not for a thing you come back to.
 *
 * Everything here reads the shared useHousehold hook, so the page and the
 * dialog cannot drift apart.
 */

/** "in 3 hours", "in 2 days", or "expired" -- codes live 24h by default. */
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "unknown";
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `in ${Math.max(1, Math.floor(ms / 60_000))} min`;
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

export default function Household() {
  const {
    householdName,
    members,
    inviteCodes,
    loading,
    error,
    createInviteCode,
    revokeInviteCode,
    removeMember,
    renameHousehold,
  } = useHousehold();

  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameValue = name ?? householdName;

  const handleCreate = async () => {
    setBusy(true);
    const code = await createInviteCode();
    setBusy(false);
    if (code) {
      toast.success("Invite link created. Share it with the other caregiver.");
    } else {
      toast.error("Couldn't create an invite link.");
    }
  };

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(buildInviteLink(code));
      toast.success("Invite link copied");
    } catch {
      // Clipboard is blocked in plenty of ordinary situations (no permission,
      // an insecure origin). Say so rather than silently doing nothing.
      toast.error("Couldn't copy. Select the code and copy it manually.");
    }
  };

  const handleRevoke = async (id: string) => {
    if (await revokeInviteCode(id)) toast.success("Invite revoked");
    else toast.error("Couldn't revoke that invite.");
  };

  const handleRemove = async (id: string) => {
    if (await removeMember(id)) toast.success("Member removed from household");
    else toast.error("Couldn't remove that member.");
  };

  const handleRename = async () => {
    if (await renameHousehold(nameValue)) {
      toast.success("Household renamed");
      setName(null);
    } else {
      toast.error("Couldn't rename the household.");
    }
  };

  return (
    <>
      <Helmet>
        <title>Household | EatPal</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="container mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold">Household</h1>
          <p className="text-muted-foreground">
            Everyone here shares the same kids, meal plans and grocery lists.
          </p>
        </div>

        {error && (
          <Card>
            <CardContent className="pt-6 text-destructive">{error}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" aria-hidden="true" />
              Members
            </CardTitle>
            <CardDescription>{householdName || "Your household"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="household-name">Household name</Label>
                <Input
                  id="household-name"
                  value={nameValue}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button variant="outline" onClick={handleRename} disabled={!nameValue.trim()}>
                Save
              </Button>
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-muted-foreground">
                You are the only person in this household.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {member.profiles?.full_name || "Household member"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Joined {new Date(member.joined_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{member.role}</Badge>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${member.profiles?.full_name || "member"}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove this member?</AlertDialogTitle>
                            <AlertDialogDescription>
                              They lose access to this household's kids, meal plans and grocery
                              lists. Anything they added stays.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRemove(member.id)}>
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" aria-hidden="true" />
              Invite links
            </CardTitle>
            <CardDescription>
              A link is good for 24 hours and can be used once. Revoke one at any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? "Creating..." : "Create invite link"}
            </Button>

            {loading ? (
              <Skeleton className="h-12 w-full" />
            ) : inviteCodes.length === 0 ? (
              <p className="text-muted-foreground">No invite links are outstanding.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {inviteCodes.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-base font-medium">{invite.code}</p>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Expires {expiresIn(invite.expires_at)} &middot; joins as {invite.role}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(invite.code)}
                        aria-label={`Copy invite link for ${invite.code}`}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRevoke(invite.id)}
                        aria-label={`Revoke invite ${invite.code}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

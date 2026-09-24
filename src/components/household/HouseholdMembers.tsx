import { memo, useCallback, useMemo, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Loader2, LogOut, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import "@/i18n/appLocale";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useKids } from "@/contexts/KidsContext";
import { formatJoinedDate, initialsFor } from "@/lib/householdFormat";
import { SHARED_SCOPE_KEYS } from "@/lib/householdScope";
import { memberDisplayName, roleLabel, type LabelledMember } from "./householdMemberLabel";

type MutationResult = { ok: true } | { ok: false; message: string };

export interface RosterMember extends LabelledMember {
  id: string;
  user_id: string;
  joined_at: string;
  isOwner: boolean;
}

export interface HouseholdMembersProps {
  members: RosterMember[];
  viewerIsOwner: boolean;
  disabled: boolean;
  removeMember: (memberId: string) => Promise<MutationResult>;
  leaveHousehold: () => Promise<MutationResult>;
}

type PendingAction = { kind: "remove" | "leave"; member: RosterMember };

/** Intl.ListFormat, which the project's TS lib target does not declare yet. */
type ListFormatCtor = new (
  locale: string,
  options: { style: "long"; type: "conjunction" },
) => { format: (items: string[]) => string };
const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;

/** Why the viewer cannot leave, or null when they can. */
function leaveRefusal(members: RosterMember[], viewerIsOwner: boolean, t: TFunction): string | null {
  if (members.length <= 1) {
    return t("household.members.leave.soleMember");
  }
  if (viewerIsOwner) {
    return t("household.members.leave.ownerWithOthers");
  }
  return null;
}

interface MemberRowProps {
  member: RosterMember;
  name: string;
  roleText: string;
  joinedText: string;
  canRemove: boolean;
  leaveBlockedReason: string | null;
  disabled: boolean;
  onRequest: (action: PendingAction) => void;
}

/** One person on the roster. memo(): a dialog opening must not re-render every row. */
const MemberRow = memo(function MemberRow({
  member,
  name,
  roleText,
  joinedText,
  canRemove,
  leaveBlockedReason,
  disabled,
  onRequest,
}: MemberRowProps) {
  const { t } = useTranslation();
  const reasonId = `leave-reason-${member.id}`;

  return (
    <li className="flex items-start gap-3 py-3">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-muted text-sm font-medium text-foreground">
          {initialsFor(member.profiles?.full_name ?? null, name.slice(0, 1).toUpperCase())}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="truncate font-medium">{name}</span>
          {member.isSelf && member.profiles?.full_name?.trim() && (
            <span className="text-muted-foreground">
              {t("household.members.youMarker")}
            </span>
          )}
          {member.isOwner && (
            <Badge variant="outline">{t("household.members.owner")}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {roleText}
          {joinedText && <> &middot; {joinedText}</>}
        </p>
        {member.isOwner && (
          <p className="text-sm text-muted-foreground">
            {t("household.members.planHolder")}
          </p>
        )}
        {member.isSelf && (
          <div className="mt-2 space-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={disabled || leaveBlockedReason !== null}
              aria-describedby={leaveBlockedReason ? reasonId : undefined}
              onClick={() => onRequest({ kind: "leave", member })}
            >
              <LogOut aria-hidden="true" />
              {t("household.members.leave.action")}
            </Button>
            {leaveBlockedReason && (
              <p id={reasonId} className="text-sm text-muted-foreground">
                {leaveBlockedReason}
              </p>
            )}
          </div>
        )}
      </div>
      {!member.isSelf && canRemove && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 shrink-0"
              disabled={disabled}
              aria-label={t("household.members.moreActions", { name,})}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onRequest({ kind: "remove", member })}
            >
              <UserMinus aria-hidden="true" />
              {t("household.members.remove.action")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
});

/**
 * Who is in the household, and the two ways to change that from here:
 * an owner removing somebody, and anyone leaving.
 *
 * One dialog for the whole list, driven by pendingAction, rather than one per
 * row: the confirm copy depends on who is being removed and on the kids they
 * will stop seeing, and a single dialog keeps that in one place.
 */
export function HouseholdMembers({
  members,
  viewerIsOwner,
  disabled,
  removeMember,
  leaveHousehold,
}: HouseholdMembersProps) {
  const { t, i18n } = useTranslation();
  const { kids } = useKids();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const headingId = "household-members-heading";
  const headingRef = useRef<HTMLHeadingElement>(null);

  const onlyMe = members.length === 1 && members[0].isSelf;
  const leaveBlockedReason = useMemo(() => leaveRefusal(members, viewerIsOwner, t), [members, viewerIsOwner, t]);

  const onRequest = useCallback((action: PendingAction) => setPending(action), []);

  const pendingName = pending ? memberDisplayName(pending.member, t) : "";

  const kidNames = useMemo(
    () =>
      kids
        .map((kid) => kid.name?.trim().split(/\s+/)[0] ?? "")
        .filter((first) => first.length > 0),
    [kids],
  );

  const listFormat = useCallback(
    (items: string[]) => {
      try {
        if (ListFormat) return new ListFormat(i18n.language || "en", { style: "long", type: "conjunction" }).format(items);
      } catch {
        // An unknown locale tag throws; fall through to a plain join.
      }
      return items.join(", ");
    },
    [i18n.language],
  );

  const confirm = async (event: MouseEvent) => {
    // Keep the dialog up until the write has answered; the Action would
    // otherwise close it on click and the spinner would never be seen.
    event.preventDefault();
    if (!pending || working) return;
    const action = pending;
    setWorking(true);
    const result = action.kind === "remove" ? await removeMember(action.member.id) : await leaveHousehold();
    setWorking(false);
    setPending(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (action.kind === "remove") {
      toast.success(
        t("household.members.remove.done", {
          name: memberDisplayName(action.member, t),
        }),
      );
      // The row that held focus is gone; put the reader back at the list.
      requestAnimationFrame(() => headingRef.current?.focus());
    } else {
      toast.success(t("household.members.leave.done"));
      window.location.assign("/dashboard");
    }
  };

  const onOpenChange = (open: boolean) => {
    if (!open && !working) setPending(null);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
          {t("household.members.heading")}
        </h2>
      </CardHeader>
      <CardContent>
        <ul aria-labelledby={headingId} className="divide-y">
          {members.map((member) => {
            const name = memberDisplayName(member, t);
            return (
              <MemberRow
                key={member.id}
                member={member}
                name={name}
                roleText={roleLabel(member.role, t)}
                joinedText={
                  member.joined_at
                    ? t("household.members.joined", {
                        date: formatJoinedDate(member.joined_at, i18n.language || "en"),
                      })
                    : ""
                }
                canRemove={viewerIsOwner}
                leaveBlockedReason={member.isSelf ? leaveBlockedReason : null}
                disabled={disabled}
                onRequest={onRequest}
              />
            );
          })}
        </ul>
        {onlyMe && (
          <p className="mt-2 flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-foreground">
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("household.members.nudge")}
          </p>
        )}
      </CardContent>

      <AlertDialog open={pending !== null} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          {pending?.kind === "remove" && (
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("household.members.remove.title", {
                  name: pendingName,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {t("household.members.remove.loses", {
                      items: listFormat(SHARED_SCOPE_KEYS.map((key) => t(key))),
                    })}
                  </p>
                  {kidNames.length > 0 && (
                    <p>
                      {t("household.members.remove.kids", {
                        kids: listFormat(kidNames),
                      })}
                    </p>
                  )}
                  <p>{t("household.members.remove.keeps")}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          {pending?.kind === "leave" && (
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("household.members.leave.title")}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {t("household.members.leave.loses")}
                  </p>
                  <p>
                    {t("household.members.leave.keeps")}
                  </p>
                  <p>{t("household.members.leave.fresh")}</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>
              {t("household.members.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={working || disabled}
              aria-busy={working}
              onClick={confirm}
            >
              {working && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
              {pending?.kind === "leave"
                ? working
                  ? t("household.members.leave.working")
                  : t("household.members.leave.confirm")
                : working
                  ? t("household.members.remove.working")
                  : t("household.members.remove.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

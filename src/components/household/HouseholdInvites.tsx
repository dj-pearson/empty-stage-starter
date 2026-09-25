import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, Share2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import "@/i18n/appLocale";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { useReducedMotion } from "@/hooks/useReducedMotion";
import type {
  CreateInviteResult,
  HouseholdInviteCode,
  InviteRole,
  MutationResult,
} from "@/hooks/useHousehold";
import { buildInviteLink } from "@/lib/householdInvite";
import { formatRelativeFromNow, isExpired } from "@/lib/householdFormat";
import { HOUSEHOLD_LINKS } from "@/lib/householdScope";
import { cn } from "@/lib/utils";

export interface HouseholdInvitesProps {
  householdName: string;
  inviteCodes: HouseholdInviteCode[];
  loading: boolean;
  disabled: boolean;
  createInviteCode: (role?: InviteRole) => Promise<CreateInviteResult>;
  revokeInviteCode: (id: string) => Promise<MutationResult>;
}

/** Countdowns read in minutes and hours, so a minute is the finest tick worth paying for. */
const TICK_MS = 60_000;

const SEAT_FULL = /is full/i;

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The invite card on /dashboard/household (US-337, reworked for US-840).
 *
 * Built for a parent holding a phone: pick who you're inviting, tap once, and
 * the share sheet opens with the link already in it. Where there is no share
 * sheet the link goes to the clipboard. The code is also shown large enough to
 * read aloud to a grandparent on a call.
 *
 * The relationship picker maps to the two roles create_household_invite takes
 * today. RLS gives both the same access, and the copy under the picker says so
 * rather than implying a caregiver sees less.
 */
export function HouseholdInvites({
  householdName,
  inviteCodes,
  loading,
  disabled,
  createInviteCode,
  revokeInviteCode,
}: HouseholdInvitesProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const headingId = useId();
  const pickerId = useId();

  const [role, setRole] = useState<InviteRole>("parent");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [seatFullMessage, setSeatFullMessage] = useState<string | null>(null);
  const [freshCode, setFreshCode] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // One interval while there is anything to count down. It re-renders the card
  // so "Expires in 3 hours" stays true and an expired row drops off by itself.
  const [, setTick] = useState(0);
  const hasCodes = inviteCodes.length > 0;
  useEffect(() => {
    if (!hasCodes) return;
    const id = window.setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [hasCodes]);

  const now = Date.now();
  const liveCodes = inviteCodes.filter((c) => !isExpired(c.expires_at, now));

  const shareOrCopy = useCallback(
    async (code: string) => {
      const url = buildInviteLink(code);
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      if (nav && typeof nav.share === "function" && nav.canShare?.({ url }) !== false) {
        try {
          await nav.share({
            title: t("household.invites.shareTitle", {
              name: householdName,
            }),
            text: t("household.invites.shareText", {
              name: householdName,
              code,
            }),
            url,
          });
          return;
        } catch (error) {
          // The parent closed the sheet. That is an answer, not a failure.
          if (isAbortError(error)) return;
          // Anything else (no user activation left after the await, say) falls
          // through to the clipboard.
        }
      }

      if (await writeClipboard(url)) {
        toast.success(t("household.invites.copiedLink"));
      } else {
        toast.error(t("household.invites.copyFailed"));
      }
    },
    [householdName, t],
  );

  const copyCode = useCallback(
    async (code: string) => {
      if (await writeClipboard(code)) {
        toast.success(t("household.invites.copiedCode"));
      } else {
        toast.error(t("household.invites.copyFailed"));
      }
    },
    [t],
  );

  const handleCreate = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setSeatFullMessage(null);
    try {
      const result = await createInviteCode(role);
      if (!result.ok) {
        if (SEAT_FULL.test(result.message)) setSeatFullMessage(result.message);
        else toast.error(result.message);
        return;
      }
      setFreshCode(result.code);
      await shareOrCopy(result.code);
    } catch {
      toast.error(t("household.invites.createFailed"));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const handleRevoke = async () => {
    const id = confirmId;
    setConfirmId(null);
    if (!id || revokingId) return;
    setRevokingId(id);
    try {
      const result = await revokeInviteCode(id);
      if (result.ok) {
        toast.success(t("household.invites.revoked"));
      } else {
        toast.error(result.message);
      }
    } finally {
      setRevokingId(null);
    }
  };

  const roleText = (r: string) =>
    r === "parent"
      ? t("household.invites.for.parent")
      : t("household.invites.for.guardian");

  return (
    <Card aria-labelledby={headingId} role="region">
      <CardHeader className="space-y-1">
        <h2 id={headingId} className="flex items-center gap-2 text-xl font-semibold">
          <UserPlus className="h-5 w-5" aria-hidden="true" />
          {t("household.invites.heading")}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-2" disabled={disabled || creating}>
          <legend className="mb-2 text-sm font-medium">
            {t("household.invites.relationship.label")}
          </legend>
          <RadioGroup
            value={role}
            onValueChange={(value) => setRole(value === "guardian" ? "guardian" : "parent")}
            className="gap-2"
          >
            {(["parent", "guardian"] as const).map((value) => (
              <div key={value} className="flex items-center gap-3 rounded-md border px-3 py-3">
                <RadioGroupItem value={value} id={`${pickerId}-${value}`} />
                <Label htmlFor={`${pickerId}-${value}`} className="flex-1 cursor-pointer text-base font-normal">
                  {value === "parent"
                    ? t("household.invites.relationship.parent")
                    : t("household.invites.relationship.guardian")}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <p className="text-sm text-muted-foreground">
            {t("household.invites.sameAccess")}
          </p>
        </fieldset>

        <Button
          className="w-full sm:w-auto"
          onClick={() => void handleCreate()}
          disabled={disabled || creating}
          aria-busy={creating}
        >
          {creating ? (
            <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {creating
            ? t("household.invites.creating")
            : t("household.invites.create")}
        </Button>

        {seatFullMessage && (
          <Alert>
            <AlertDescription className="space-y-2">
              <p>{seatFullMessage}</p>
              <Link
                to={HOUSEHOLD_LINKS.billing}
                className="font-medium text-primary underline underline-offset-4"
              >
                {t("household.invites.upgrade")}
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <p className="text-sm text-muted-foreground">
          {t("household.invites.hint")}
        </p>

        {loading && liveCodes.length === 0 ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
          </div>
        ) : liveCodes.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {t("household.invites.listHeading")}
            </h3>
            <ul className="divide-y rounded-md border">
              {liveCodes.map((invite) => {
                const fresh = invite.code === freshCode;
                const busy = revokingId === invite.id;
                return (
                  <li
                    key={invite.id}
                    className={cn(
                      "space-y-3 p-3",
                      fresh && "bg-accent/40",
                      fresh && !reduceMotion && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700",
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span
                        className="font-mono text-2xl font-semibold tracking-widest select-all"
                        aria-label={t("household.invites.codeLabel", {
                          spelled: invite.code.split("").join(" "),
                        })}
                      >
                        {invite.code}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {roleText(invite.role)}
                        {" - "}
                        {t("household.invites.expires", {
                          when: formatRelativeFromNow(invite.expires_at, i18n.language, now),
                        })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void shareOrCopy(invite.code)}
                        disabled={disabled || busy}
                        aria-label={t("household.invites.shareAria", {
                          code: invite.code,
                        })}
                      >
                        <Share2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t("household.invites.share")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void copyCode(invite.code)}
                        disabled={disabled || busy}
                        aria-label={t("household.invites.copyCodeAria", {
                          code: invite.code,
                        })}
                      >
                        <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t("household.invites.copyCode")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setConfirmId(invite.id)}
                        disabled={disabled || busy || revokingId !== null}
                        aria-busy={busy}
                        aria-label={t("household.invites.revokeAria", {
                          code: invite.code,
                        })}
                      >
                        {busy ? (
                          <Loader2 className="mr-1.5 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                        ) : (
                          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        )}
                        {busy
                          ? t("household.invites.revoking")
                          : t("household.invites.revoke")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <AlertDialog open={confirmId !== null} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("household.invites.revokeTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("household.invites.revokeBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("household.invites.revokeCancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => void handleRevoke()}
            >
              {t("household.invites.revokeConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

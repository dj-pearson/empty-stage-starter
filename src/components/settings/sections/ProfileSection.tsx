import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/hooks/useHousehold";
import { roleLabel } from "@/components/household/householdMemberLabel";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { logger } from "@/lib/logger";
import { userFacingError } from "@/lib/networkFailure";
import "@/i18n/appLocale";

/** Longest display name the profile accepts; the input stops at the same place. */
const DISPLAY_NAME_MAX = 60;

const DisplayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX);

function nameFromUser(user: SupabaseUser | null): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const name = meta?.display_name ?? meta?.full_name ?? meta?.name;
  return typeof name === "string" ? name : "";
}

function initialsOf(name: string, email: string | undefined): string {
  const fromName = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return fromName || email?.charAt(0).toUpperCase() || "?";
}

/**
 * Settings > Profile: the parent's name, sign-in email and household role
 * (settings pass B). Content only; the hub supplies the section and its h2.
 *
 * The bind-email panel is NOT here. It lives once, in the sign-in section, so
 * an Apple-relay user sees one call to action rather than two.
 */
export function ProfileSection() {
  const { t, i18n } = useTranslation();
  const household = useHousehold();
  const reducedMotion = useReducedMotion();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedName, setSavedName] = useState("");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { user: current },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        setUser(current);
        const name = nameFromUser(current);
        setSavedName(name);
        setDraft(name);
      } catch (err) {
        logger.error("Error loading profile:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = draft.trim();
  const parsed = DisplayNameSchema.safeParse(draft);
  const unchanged = trimmed === savedName.trim();
  const canSave = !loading && !saving && parsed.success && !unchanged;

  const memberSince = useMemo(() => {
    if (!user?.created_at) return null;
    const date = new Date(user.created_at);
    if (Number.isNaN(date.getTime())) return null;
    try {
      return new Intl.DateTimeFormat(i18n.language || "en", { dateStyle: "long" }).format(date);
    } catch {
      return date.toDateString();
    }
  }, [user?.created_at, i18n.language]);

  const self = household.members.find((m) => m.isSelf);
  const roleLine =
    !household.loading && self
      ? household.householdName
        ? t("settings.account.profile.roleInHousehold", {
            defaultValue: "{{role}} in {{household}}",
            role: roleLabel(self.role, t),
            household: household.householdName,
          })
        : roleLabel(self.role, t)
      : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave || !parsed.success) return;
    const next = parsed.data;
    setSaving(true);
    setStatus("idle");
    setErrorText(null);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: next, full_name: next },
      });
      if (error) throw error;
      // The response carries the updated user; no reload, so no skeleton flash.
      const updated = data.user ?? user;
      setUser(updated);
      const name = nameFromUser(updated) || next;
      setSavedName(name);
      setDraft(name);
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setErrorText(
        userFacingError(
          err,
          t("settings.account.profile.saveFailed", {
            defaultValue: "Couldn't save your name. Try again.",
          })
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const copyEmail = async () => {
    if (!user?.email) return;
    try {
      await navigator.clipboard.writeText(user.email);
      toast.success(t("settings.account.profile.emailCopied", { defaultValue: "Email copied" }));
    } catch {
      toast.error(
        t("settings.account.profile.emailCopyFailed", {
          defaultValue: "Couldn't copy. Select the address and copy it instead.",
        })
      );
    }
  };

  const nameHintId = "displayName-hint";
  const emailHintId = "profile-email-hint";

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle className="text-lg">
            {t("settings.account.profile.title", { defaultValue: "Personal information" })}
          </CardTitle>
          <CardDescription>
            {t("settings.account.profile.description", {
              defaultValue: "Your name as your household sees it, and the email you sign in with.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-4" aria-hidden="true">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage
                    src={
                      typeof user?.user_metadata?.avatar_url === "string"
                        ? user.user_metadata.avatar_url
                        : undefined
                    }
                    alt=""
                  />
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {initialsOf(savedName, user?.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-lg break-words">
                    {savedName ||
                      t("settings.account.profile.noName", { defaultValue: "No name set" })}
                  </p>
                  {roleLine && <p className="text-sm text-muted-foreground">{roleLine}</p>}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="displayName">
                  {t("settings.account.profile.nameLabel", { defaultValue: "Display name" })}
                </Label>
                <Input
                  id="displayName"
                  name="displayName"
                  autoComplete="name"
                  value={draft}
                  maxLength={DISPLAY_NAME_MAX}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (status !== "idle") setStatus("idle");
                  }}
                  aria-describedby={nameHintId}
                  aria-invalid={draft.length > 0 && !parsed.success ? true : undefined}
                />
                <p id={nameHintId} className="text-xs text-muted-foreground">
                  {trimmed.length === 0 && draft.length > 0
                    ? t("settings.account.profile.nameBlank", {
                        defaultValue: "A name needs at least one letter.",
                      })
                    : t("settings.account.profile.nameHint", {
                        defaultValue: "Shown on your household's plans and lists. Up to 60 characters.",
                      })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email">
                  {t("settings.account.profile.emailLabel", { defaultValue: "Sign-in email" })}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="profile-email"
                    type="email"
                    autoComplete="email"
                    value={user?.email ?? ""}
                    readOnly
                    aria-describedby={emailHintId}
                    className="bg-muted"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyEmail}
                    disabled={!user?.email}
                    aria-label={t("settings.account.profile.copyEmail", {
                      defaultValue: "Copy email address",
                    })}
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <p id={emailHintId} className="text-xs text-muted-foreground">
                  {t("settings.account.profile.emailHint", {
                    defaultValue: "To change it, use Sign-in and security, or contact support.",
                  })}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t("settings.account.profile.memberSince", { defaultValue: "Member since" })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {memberSince ?? t("settings.account.profile.unknownDate", { defaultValue: "Unknown" })}
                </p>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-3 border-t pt-6">
          <Button type="submit" disabled={!canSave} aria-busy={saving || undefined}>
            {saving && (
              <Loader2
                className={reducedMotion ? "h-4 w-4 mr-2" : "h-4 w-4 mr-2 animate-spin"}
                aria-hidden="true"
              />
            )}
            {saving
              ? t("settings.account.profile.saving", { defaultValue: "Saving..." })
              : t("settings.account.profile.save", { defaultValue: "Save name" })}
          </Button>
          <p
            aria-live="polite"
            className={status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          >
            {status === "saved"
              ? t("settings.account.profile.saved", { defaultValue: "Saved" })
              : status === "error"
                ? errorText
                : ""}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import "@/i18n/appLocale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initialsFor } from "@/lib/householdFormat";
import { memberDisplayName, type LabelledMember } from "./householdMemberLabel";

type MutationResult = { ok: true } | { ok: false; message: string };

export interface HouseholdHeaderMember extends LabelledMember {
  id: string;
}

export interface HouseholdHeaderProps {
  householdName: string;
  members: HouseholdHeaderMember[];
  /** False until the roster has loaded; the count line waits for it. */
  ready: boolean;
  disabled: boolean;
  renameHousehold: (name: string) => Promise<MutationResult>;
}

const MAX_NAME = 60;
/** Faces shown before the rest collapse into "+N". */
const MAX_FACES = 4;

type Feedback = { kind: "saved" | "failed"; text: string } | null;

/**
 * The first thing on the Household page: whose household this is and how many
 * people can see the kids. The name is the h1, and renaming happens in place,
 * so the roster sits directly under it on a phone instead of below a form.
 */
export function HouseholdHeader({ householdName, members, ready, disabled, renameHousehold }: HouseholdHeaderProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const hintId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false);

  const title = householdName.trim() || t("household.page.titleFallback");

  // Focus follows the mode switch: into the input on open, back to Rename on close.
  useEffect(() => {
    if (editing) inputRef.current?.focus();
    else if (wasEditing.current) renameButtonRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  const trimmed = draft.trim();
  const canSave =
    !saving && trimmed.length >= 1 && trimmed.length <= MAX_NAME && trimmed !== householdName.trim();

  const open = () => {
    setDraft(householdName);
    setFeedback(null);
    setEditing(true);
  };

  const cancel = () => {
    if (saving) return;
    setDraft(householdName);
    setEditing(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const result = await renameHousehold(trimmed);
    setSaving(false);
    if (result.ok) {
      const text = t("household.page.rename.saved", { name: trimmed,});
      setFeedback({ kind: "saved", text });
      toast.success(text);
      setEditing(false);
    } else {
      const text = result.message || t("household.page.rename.failed");
      setFeedback({ kind: "failed", text });
      toast.error(text);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  const faces = members.slice(0, MAX_FACES);
  const extra = members.length - faces.length;

  return (
    <header className="space-y-2">
      {editing ? (
        <form onSubmit={submit} className="space-y-2" aria-label={t("household.page.rename.label")}>
          <Label htmlFor={inputId}>{t("household.page.rename.label")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id={inputId}
              ref={inputRef}
              value={draft}
              maxLength={MAX_NAME}
              disabled={saving}
              aria-busy={saving}
              aria-describedby={hintId}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              className="text-base sm:flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!canSave || disabled} className="min-h-11">
                {saving && <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />}
                {saving
                  ? t("household.page.rename.saving")
                  : t("household.page.rename.save")}
              </Button>
              <Button type="button" variant="ghost" onClick={cancel} disabled={saving} className="min-h-11">
                {t("household.page.rename.cancel")}
              </Button>
            </div>
          </div>
          <p id={hintId} className="text-sm text-muted-foreground">
            {t("household.page.rename.hint")}
          </p>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="min-w-0 break-words text-2xl font-semibold">{title}</h1>
          <Button
            ref={renameButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={open}
            disabled={disabled}
            aria-label={t("household.page.rename.buttonLabel", { name: title,})}
            className="min-h-11"
          >
            <Pencil aria-hidden="true" />
            {t("household.page.rename.button")}
          </Button>
        </div>
      )}

      <p
        aria-live="polite"
        className={cn("text-sm", feedback?.kind === "failed" ? "text-destructive" : "text-muted-foreground", !feedback && "sr-only")}
      >
        {feedback?.text ?? ""}
      </p>

      <div className="flex items-center gap-3">
        {ready && faces.length > 0 && (
          <div className="flex -space-x-2" aria-hidden="true">
            {faces.map((member) => {
              const name = memberDisplayName(member, t);
              return (
                <Avatar key={member.id} className="h-8 w-8 border-2 border-background">
                  <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
                    {initialsFor(member.profiles?.full_name ?? null, name.slice(0, 1).toUpperCase())}
                  </AvatarFallback>
                </Avatar>
              );
            })}
            {extra > 0 && (
              <Avatar className="h-8 w-8 border-2 border-background">
                <AvatarFallback className="bg-muted text-xs font-medium text-foreground">+{extra}</AvatarFallback>
              </Avatar>
            )}
          </div>
        )}
        <p className="text-muted-foreground">
          {ready
            ? t("household.page.summary", {
                count: members.length,
              })
            : t("household.page.summaryLoading")}
        </p>
      </div>
    </header>
  );
}

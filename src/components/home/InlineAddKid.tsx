import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKids } from "@/contexts/AppContext";
import { KID_ALLERGEN_PICKER } from "@/lib/allergens";
import { cn } from "@/lib/utils";
import "@/i18n/appLocale";

/**
 * Name 1-50 characters after trimming; age optional, whole years 0-18.
 */
const inlineKidSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "nameRequired" })
    .max(50, { message: "nameTooLong" }),
  age: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(18)])
    .optional(),
});

/**
 * "unknown" is the untouched state; "none" is the parent saying there are no
 * known allergies. They are stored differently (null vs []), which is why
 * "None known" is its own chip instead of what an empty selection means.
 */
type AllergyChoice = { kind: "unknown" } | { kind: "none" } | { kind: "some"; values: string[] };

interface InlineAddKidProps {
  /** Called when the parent closes the form. */
  onClose?: () => void;
}

interface PendingAdd {
  name: string;
  before: Set<string>;
}

/**
 * Add a child from /dashboard without leaving it: name, optional age, and
 * allergies from the same picker the Kids page uses.
 *
 * addKid resolves a boolean, not the new id, so the new child is found in the
 * kids slice after the add (the id that was not there before, with the name
 * just entered). That is when it becomes the active kid and the Undo toast
 * goes up, since Undo needs the id.
 */
export function InlineAddKid({ onClose }: InlineAddKidProps) {
  const { t } = useTranslation();
  const { kids, addKid, deleteKid, setActiveKid } = useKids();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [allergy, setAllergy] = useState<AllergyChoice>({ kind: "unknown" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addedName, setAddedName] = useState<string | null>(null);
  const pending = useRef<PendingAdd | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Pick up the new child once it lands in the slice.
  useEffect(() => {
    const want = pending.current;
    if (!want) return;
    const created = kids.find((k) => !want.before.has(k.id) && k.name === want.name);
    if (!created) return;
    pending.current = null;
    setActiveKid(created.id);
    toast.success(t("setup.addKid.added", { name: created.name, defaultValue: "{{name}} added" }), {
      action: {
        label: t("setup.addKid.undo", { defaultValue: "Undo" }),
        onClick: () => {
          void deleteKid(created.id);
        },
      },
    });
  }, [kids, setActiveKid, deleteKid, t]);

  const toggleAllergen = (value: string) => {
    setAllergy((prev) => {
      const current = prev.kind === "some" ? prev.values : [];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return next.length > 0 ? { kind: "some", values: next } : { kind: "unknown" };
    });
  };

  const reset = () => {
    setName("");
    setAge("");
    setAllergy({ kind: "unknown" });
    setError(null);
    setAddedName(null);
    // The input remounts with the form; focus it on the next frame.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = inlineKidSchema.safeParse({ name, age: age.trim() });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue?.path[0] === "age") {
        setError(t("setup.addKid.errors.ageInvalid", { defaultValue: "Enter an age from 0 to 18." }));
      } else if (issue?.message === "nameTooLong") {
        setError(
          t("setup.addKid.errors.nameTooLong", { defaultValue: "Keep the name to 50 characters or fewer." }),
        );
      } else {
        setError(t("setup.addKid.errors.nameRequired", { defaultValue: "Enter your child's name." }));
      }
      return;
    }

    const cleanName = parsed.data.name;
    const ageValue = typeof parsed.data.age === "number" ? parsed.data.age : undefined;
    const allergens =
      allergy.kind === "some" ? allergy.values : allergy.kind === "none" ? [] : null;

    setError(null);
    setSaving(true);
    pending.current = { name: cleanName, before: new Set(kids.map((k) => k.id)) };
    try {
      const ok = await addKid({
        name: cleanName,
        ...(ageValue !== undefined ? { age: ageValue } : {}),
        allergens,
      });
      if (ok) {
        setAddedName(cleanName);
      } else {
        // addKid already told the parent why (plan limit or save error).
        pending.current = null;
      }
    } catch {
      pending.current = null;
      setError(
        t("setup.addKid.errors.saveFailed", { defaultValue: "Couldn't add that child. Please try again." }),
      );
    } finally {
      setSaving(false);
    }
  };

  if (addedName) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("setup.addKid.added", { name: addedName, defaultValue: "{{name}} added" })}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="link" className="min-h-11 px-2" onClick={reset}>
            {t("setup.addKid.addAnother", { defaultValue: "Add another child" })}
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={onClose}
              aria-label={t("setup.addKid.close", { defaultValue: "Close" })}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  const selected = allergy.kind === "some" ? allergy.values : [];
  const chipClass = (on: boolean) =>
    cn(
      "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      on
        ? "border-primary bg-primary text-primary-foreground"
        : "border-input bg-background text-foreground hover:bg-muted",
    );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={`${formId}-title`}
      className="space-y-3 rounded-lg bg-muted/50 p-3"
    >
      <h3 id={`${formId}-title`} className="text-sm font-semibold text-foreground">
        {t("setup.addKid.title", { defaultValue: "Add your child" })}
      </h3>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${formId}-name`}>
            {t("setup.addKid.nameLabel", { defaultValue: "Child's name" })}
          </Label>
          <Input
            id={`${formId}-name`}
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("setup.addKid.namePlaceholder", { defaultValue: "First name" })}
            autoComplete="off"
            maxLength={60}
            className="min-h-11"
            aria-invalid={error !== null && !name.trim() ? true : undefined}
            aria-describedby={error ? `${formId}-error` : undefined}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${formId}-age`}>{t("setup.addKid.ageLabel", { defaultValue: "Age (optional)" })}</Label>
          <Input
            id={`${formId}-age`}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            inputMode="numeric"
            type="number"
            min={0}
            max={18}
            className="min-h-11"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          {t("setup.addKid.allergensLabel", { defaultValue: "Allergies" })}
        </legend>
        <p className="text-xs text-muted-foreground">
          {t("setup.addKid.allergensHint", { defaultValue: "Pick any that apply, or None known." })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={allergy.kind === "none"}
            className={chipClass(allergy.kind === "none")}
            onClick={() => setAllergy((prev) => (prev.kind === "none" ? { kind: "unknown" } : { kind: "none" }))}
          >
            {t("setup.addKid.noneKnown", { defaultValue: "None known" })}
          </button>
          {KID_ALLERGEN_PICKER.map(({ value, labelKey }) => {
            const on = selected.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                className={chipClass(on)}
                onClick={() => toggleAllergen(value)}
              >
                {t(labelKey, { defaultValue: value })}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error && (
        <p id={`${formId}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="min-h-11" disabled={saving}>
          {saving
            ? t("setup.addKid.saving", { defaultValue: "Adding..." })
            : t("setup.addKid.submit", { defaultValue: "Add child" })}
        </Button>
        {onClose && (
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
            {t("setup.addKid.cancel", { defaultValue: "Cancel" })}
          </Button>
        )}
      </div>
    </form>
  );
}

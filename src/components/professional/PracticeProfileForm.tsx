import { useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { userFacingError } from "@/lib/networkFailure";
import { logger } from "@/lib/logger";
import {
  HEX_COLOR,
  PRACTICE_COLOR_DEFAULTS,
  PRACTICE_COLOR_FIELDS,
  PRACTICE_PROFILE_COLUMNS,
  buildPracticeProfileUpsert,
  draftFromRow,
  parsePracticeProfile,
  type PracticeColorField,
  type PracticeProfileDraft,
  type PracticeProfileField,
} from "@/lib/practiceProfileSchema";

type BrandRow = Database["public"]["Tables"]["professional_brand_settings"]["Row"];

interface TextFieldSpec {
  field: Exclude<PracticeProfileField, PracticeColorField>;
  labelKey: string;
  labelDefault: string;
  placeholderKey: string;
  placeholderDefault: string;
  hintKey?: string;
  hintDefault?: string;
  type?: "email" | "tel" | "url" | "text";
  autoComplete?: string;
  wide?: boolean;
}

const TEXT_FIELDS: ReadonlyArray<TextFieldSpec> = [
  {
    field: "business_name",
    labelKey: "professional.profile.businessName",
    labelDefault: "Practice or clinic name",
    placeholderKey: "professional.profile.businessNamePlaceholder",
    placeholderDefault: "Little Bites Feeding Therapy",
    autoComplete: "organization",
  },
  {
    field: "contact_email",
    labelKey: "professional.profile.contactEmail",
    labelDefault: "Contact email",
    placeholderKey: "professional.profile.contactEmailPlaceholder",
    placeholderDefault: "hello@yourpractice.com",
    type: "email",
    autoComplete: "email",
  },
  {
    field: "phone_number",
    labelKey: "professional.profile.phone",
    labelDefault: "Phone",
    placeholderKey: "professional.profile.phonePlaceholder",
    placeholderDefault: "+1 555 010 0199",
    type: "tel",
    autoComplete: "tel",
  },
  {
    field: "support_url",
    labelKey: "professional.profile.website",
    labelDefault: "Website",
    placeholderKey: "professional.profile.websitePlaceholder",
    placeholderDefault: "https://yourpractice.com",
    hintKey: "professional.profile.websiteHint",
    hintDefault: "Must start with https://",
    type: "url",
    autoComplete: "url",
  },
  {
    field: "logo_url",
    labelKey: "professional.profile.logoUrl",
    labelDefault: "Logo URL",
    placeholderKey: "professional.profile.logoUrlPlaceholder",
    placeholderDefault: "https://yourpractice.com/logo.png",
    hintKey: "professional.profile.logoUrlHint",
    hintDefault: "A link to an image you host, starting with https://",
    type: "url",
  },
  {
    field: "platform_tagline",
    labelKey: "professional.profile.tagline",
    labelDefault: "Tagline",
    placeholderKey: "professional.profile.taglinePlaceholder",
    placeholderDefault: "Feeding therapy for kids 0-12",
    wide: true,
  },
];

const COLOR_LABELS: Record<PracticeColorField, { key: string; fallback: string }> = {
  primary_color: { key: "professional.profile.primaryColor", fallback: "Primary color" },
  secondary_color: { key: "professional.profile.secondaryColor", fallback: "Secondary color" },
  accent_color: { key: "professional.profile.accentColor", fallback: "Accent color" },
};

const ERROR_DEFAULTS: Record<string, string> = {
  "professional.profile.errors.email": "Enter an email address like name@example.com.",
  "professional.profile.errors.color": "Use a six-digit hex color like #2F6ABC.",
  "professional.profile.errors.https": "Enter a full link starting with https://",
  "professional.profile.errors.phone": "Use digits, spaces, +, - or brackets, at least 7 characters.",
  "professional.profile.errors.tooLong": "That's too long.",
  "professional.profile.errors.invalid": "Check this field.",
};

interface PracticeProfileFormProps {
  userId: string;
  row: BrandRow | null;
  onSaved: (row: BrandRow) => void;
}

export function PracticeProfileForm({ userId, row, onSaved }: PracticeProfileFormProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [baseline, setBaseline] = useState<PracticeProfileDraft>(() => draftFromRow(row));
  const [draft, setDraft] = useState<PracticeProfileDraft>(() => draftFromRow(row));
  const [touched, setTouched] = useState<Partial<Record<PracticeProfileField, boolean>>>({});
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parsePracticeProfile(draft), [draft]);
  const errors = parsed.ok ? {} : parsed.errors;
  const dirty = PRACTICE_PROFILE_COLUMNS.some((column) => draft[column] !== baseline[column]);
  const canSave = parsed.ok && dirty && !saving;

  const idFor = (field: PracticeProfileField) => `${baseId}-${field}`;
  const errorId = (field: PracticeProfileField) => `${baseId}-${field}-error`;
  const hintId = (field: PracticeProfileField) => `${baseId}-${field}-hint`;
  const visibleError = (field: PracticeProfileField): string | null => {
    const key = errors[field];
    return key && touched[field] ? t(key, { defaultValue: ERROR_DEFAULTS[key] ?? ERROR_DEFAULTS["professional.profile.errors.invalid"] }) : null;
  };

  const setField = (field: PracticeProfileField, value: string) => setDraft((prev) => ({ ...prev, [field]: value }));
  const touch = (field: PracticeProfileField) => setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsed.ok) {
      setTouched(Object.fromEntries(PRACTICE_PROFILE_COLUMNS.map((c) => [c, true])));
      return;
    }
    if (!dirty || saving) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("professional_brand_settings")
        .upsert(buildPracticeProfileUpsert(userId, parsed.payload), { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      const next = draftFromRow(data);
      setBaseline(next);
      setDraft(next);
      setTouched({});
      onSaved(data);
      toast.success(t("professional.profile.saved", { defaultValue: "Practice profile saved" }));
    } catch (error: unknown) {
      logger.error("PracticeProfileForm: save failed", error);
      toast.error(t("professional.profile.saveFailed", { defaultValue: "Couldn't save your practice profile" }), {
        description: userFacingError(
          error,
          t("professional.profile.saveFailedFallback", { defaultValue: "Nothing was saved. Please try again." }),
        ),
      });
    } finally {
      setSaving(false);
    }
  };

  const describedBy = (field: PracticeProfileField, hasHint: boolean): string | undefined => {
    const ids = [hasHint ? hintId(field) : null, visibleError(field) ? errorId(field) : null].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  };

  const swatch = (field: PracticeColorField): string =>
    HEX_COLOR.test(draft[field]) ? draft[field] : PRACTICE_COLOR_DEFAULTS[field];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("professional.profile.title", { defaultValue: "Practice profile" })}</CardTitle>
        <CardDescription>
          {t("professional.profile.description", { defaultValue: "Shown on reports you receive and invites you send." })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-label={t("professional.profile.title", { defaultValue: "Practice profile" })}>
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">
              {t("professional.profile.detailsTitle", { defaultValue: "Practice details" })}
            </legend>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {TEXT_FIELDS.map((spec) => {
                const error = visibleError(spec.field);
                return (
                  <div key={spec.field} className={cn("space-y-2", spec.wide && "md:col-span-2")}>
                    <Label htmlFor={idFor(spec.field)}>{t(spec.labelKey, { defaultValue: spec.labelDefault })}</Label>
                    <Input
                      id={idFor(spec.field)}
                      name={spec.field}
                      type={spec.type ?? "text"}
                      inputMode={spec.type === "url" ? "url" : undefined}
                      autoComplete={spec.autoComplete}
                      value={draft[spec.field]}
                      placeholder={t(spec.placeholderKey, { defaultValue: spec.placeholderDefault })}
                      onChange={(e) => setField(spec.field, e.target.value)}
                      onBlur={() => touch(spec.field)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={describedBy(spec.field, Boolean(spec.hintKey))}
                      disabled={saving}
                    />
                    {spec.hintKey && (
                      <p id={hintId(spec.field)} className="text-xs text-muted-foreground">
                        {t(spec.hintKey, { defaultValue: spec.hintDefault })}
                      </p>
                    )}
                    {error && (
                      <p id={errorId(spec.field)} className="text-xs text-destructive">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">{t("professional.profile.colorsTitle", { defaultValue: "Colors" })}</legend>
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("professional.profile.colorsHint", {
                defaultValue: "Used on your practice profile. They also tint your own EatPal screens while you're signed in.",
              })}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {PRACTICE_COLOR_FIELDS.map((field) => {
                const label = t(COLOR_LABELS[field].key, { defaultValue: COLOR_LABELS[field].fallback });
                const error = visibleError(field);
                return (
                  <div key={field} className="space-y-2">
                    <Label htmlFor={idFor(field)}>{label}</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={swatch(field).toLowerCase()}
                        onChange={(e) => {
                          setField(field, e.target.value);
                          touch(field);
                        }}
                        aria-label={t("professional.profile.pickColor", { name: label, defaultValue: `Pick the ${label}` })}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background"
                        disabled={saving}
                      />
                      <Input
                        id={idFor(field)}
                        name={field}
                        value={draft[field]}
                        onChange={(e) => setField(field, e.target.value)}
                        onBlur={() => touch(field)}
                        placeholder={PRACTICE_COLOR_DEFAULTS[field]}
                        spellCheck={false}
                        autoCapitalize="off"
                        className="flex-1 font-mono"
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? errorId(field) : undefined}
                        disabled={saving}
                      />
                    </div>
                    {error && (
                      <p id={errorId(field)} className="text-xs text-destructive">
                        {error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground" id={`${baseId}-preview`}>
                {t("professional.profile.preview", { defaultValue: "Preview" })}
              </p>
              <div className="flex items-center gap-3 rounded-lg border p-3" aria-labelledby={`${baseId}-preview`} role="group">
                {PRACTICE_COLOR_FIELDS.map((field) => (
                  <span
                    key={field}
                    className="h-8 w-8 shrink-0 rounded-full border"
                    style={{ backgroundColor: swatch(field) }}
                    aria-hidden="true"
                  />
                ))}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {draft.business_name.trim() ||
                      t("professional.profile.businessName", { defaultValue: "Practice or clinic name" })}
                  </p>
                  {draft.platform_tagline.trim() && (
                    <p className="truncate text-xs text-muted-foreground">{draft.platform_tagline.trim()}</p>
                  )}
                </div>
              </div>
            </div>
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {!parsed.ok && dirty
                ? t("professional.profile.fixErrors", { defaultValue: "Fix the highlighted fields to save." })
                : dirty
                  ? t("professional.profile.unsaved", { defaultValue: "You have unsaved changes." })
                  : null}
            </p>
            <Button type="submit" disabled={!canSave} className="sm:w-auto">
              {saving
                ? t("professional.profile.saving", { defaultValue: "Saving" })
                : t("professional.profile.save", { defaultValue: "Save practice profile" })}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

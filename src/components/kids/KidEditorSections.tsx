import { useId, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { AlertTriangle, Heart, UserCircle, X } from "lucide-react";
import { differenceInMonths, differenceInYears } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { KidAvatarImage } from "@/components/KidAvatarImage";
import { KidChipInput } from "@/components/kids/KidChipInput";
import {
  ALLERGY_STATUSES,
  COMMON_FOODS,
  DIETARY_RESTRICTIONS,
  EATING_BEHAVIOR,
  EATING_HABITS,
  GENDERS,
  HEALTH_GOALS,
  NUTRITION_CONCERNS,
  PICKINESS_LABELS,
  PREPARATION_SUGGESTIONS,
  SEVERITIES,
  TEXTURE_DISLIKES,
  TEXTURE_LEVELS,
  TEXTURE_LIKES,
  WILLINGNESS,
  type KidOption,
} from "@/components/kids/kidEditorOptions";
import { cn } from "@/lib/utils";
import { parseIsoDate } from "@/lib/date-utils";
import {
  KID_ALLERGEN_PICKER,
  canonicalAllergen,
  matchingFoodAllergen,
  normalizeKidAllergenInput,
  pruneAllergenSeverity,
} from "@/lib/allergens";
import {
  NAME_MAX,
  NOTES_MAX,
  effectiveAllergens,
  pickinessFromAnswers,
  type AllergyStatus,
  type KidEditorForm,
  type KidSectionId,
} from "@/lib/kidIntakeForm";

export interface HouseholdFoodRef {
  name: string;
  allergens?: readonly string[] | null;
}

export interface KidSectionFieldsProps {
  section: KidSectionId;
  form: KidEditorForm;
  /** The form as it was when the editor opened. */
  base: KidEditorForm;
  isAdd: boolean;
  onChange: (patch: Partial<KidEditorForm>) => void;
  householdFoods: readonly HouseholdFoodRef[];
  errors: { name?: string; allergens?: string };
  photo: {
    uploading: boolean;
    previewUrl: string | null;
    onFile: (e: ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
  };
}

/** US, Liberia and Myanmar measure children in feet and pounds; everyone else in cm and kg. */
function defaultUnitSystem(): "imperial" | "metric" {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region === "US" || region === "LR" || region === "MM" ? "imperial" : "metric";
  } catch {
    return "imperial";
  }
}

const convertHeightToMetric = (totalInches: number): number => Math.round(totalInches * 2.54 * 10) / 10;
const convertWeightToMetric = (pounds: number): number => Math.round(pounds * 0.453592 * 100) / 100;
const convertHeightToImperial = (cm: number): { feet: number; inches: number } => {
  const totalInches = Math.round((cm / 2.54) * 2) / 2;
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
};
const convertWeightToImperial = (kg: number): number => Math.round((kg / 0.453592) * 10) / 10;

const parseNumber = (value: string): number | null => {
  if (value.trim() === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
};

const todayIso = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** A segmented single-choice control built on real radio inputs. */
function Segmented({
  name,
  legend,
  options,
  value,
  onSelect,
  columns = 3,
  srLegend = false,
}: {
  name: string;
  legend: ReactNode;
  options: readonly { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
  columns?: 2 | 3 | 4;
  srLegend?: boolean;
}) {
  const uid = useId();
  return (
    <fieldset className="space-y-2">
      <legend className={cn("text-sm font-medium", srLegend && "sr-only")}>{legend}</legend>
      <div
        className={cn(
          "grid gap-1 rounded-lg border bg-muted p-1",
          columns === 2 && "grid-cols-2",
          columns === 3 && "grid-cols-3",
          columns === 4 && "grid-cols-2 sm:grid-cols-4",
        )}
      >
        {options.map((opt) => {
          const id = `${uid}-${name}-${opt.value}`;
          return (
            <label key={opt.value} htmlFor={id} className="relative flex">
              <input
                id={id}
                type="radio"
                name={`${uid}-${name}`}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onSelect(opt.value)}
                aria-label={opt.label}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex min-h-11 w-full cursor-pointer items-center justify-center rounded-md px-2 text-center text-xs font-medium text-muted-foreground transition-colors sm:text-sm",
                  "peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm",
                  "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                )}
              >
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function KidSectionFields({
  section,
  form,
  base,
  isAdd,
  onChange,
  householdFoods,
  errors,
  photo,
}: KidSectionFieldsProps) {
  const { t } = useTranslation();
  const uid = useId();
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">(defaultUnitSystem);
  const kidName = form.name.trim() || base.name.trim() || t("kids.editor.thisChild", { defaultValue: "your child" });

  const opt = (o: KidOption) => t(o.labelKey, { defaultValue: o.label });
  const removeLabel = (item: string) => t("kids.intake.chips.remove", { defaultValue: "Remove {{item}}", item });
  const allergenLabel = (value: string) => {
    const picker = KID_ALLERGEN_PICKER.find(
      (p) => p.value === value || canonicalAllergen(p.value) === canonicalAllergen(value),
    );
    return picker ? t(picker.labelKey, { defaultValue: picker.value }) : value;
  };

  const foodNames = useMemo(() => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (const food of householdFoods) {
      const key = food.name?.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      names.push(food.name.trim());
      if (names.length >= 500) break;
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [householdFoods]);

  const foodByName = useMemo(() => {
    const map = new Map<string, HouseholdFoodRef>();
    for (const food of householdFoods) {
      const key = food.name?.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, food);
    }
    return map;
  }, [householdFoods]);

  // What the child is allergic to right now, including an unsaved edit.
  const knownAllergens = effectiveAllergens(form) ?? effectiveAllergens(base) ?? [];
  const allergenWarning = (item: string): string | null => {
    const food = foodByName.get(item.trim().toLowerCase());
    const hit = matchingFoodAllergen(knownAllergens, { name: item, allergens: food?.allergens ?? null });
    return hit ? t("kids.dialog.favorites.contains", { allergen: allergenLabel(hit), defaultValue: "Contains {{allergen}}" }) : null;
  };

  const toggleIn = (key: keyof KidEditorForm, current: readonly string[], value: string) => {
    onChange({ [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value] });
  };

  const checkboxGroup = (
    name: string,
    legend: ReactNode,
    options: readonly KidOption[],
    selected: readonly string[],
    key: keyof KidEditorForm,
    grid = false,
  ) => (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className={grid ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "space-y-2"}>
        {options.map((o, i) => {
          const id = `${uid}-${name}-${i}`;
          return (
            <div key={o.value} className="flex min-h-11 items-center gap-3">
              <Checkbox id={id} checked={selected.includes(o.value)} onCheckedChange={() => toggleIn(key, selected, o.value)} />
              <Label htmlFor={id} className="cursor-pointer font-normal leading-snug">
                {opt(o)}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );

  const radioList = (
    name: string,
    legend: ReactNode,
    options: readonly KidOption[],
    value: string,
    onSelect: (value: string) => void,
    hint?: ReactNode,
  ) => (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <div className="space-y-1">
        {options.map((o, i) => {
          const id = `${uid}-${name}-${i}`;
          return (
            <div key={o.value} className="flex min-h-11 items-center gap-3">
              <input
                type="radio"
                id={id}
                name={`${uid}-${name}`}
                value={o.value}
                checked={value === o.value}
                onChange={() => onSelect(o.value)}
                aria-label={opt(o)}
                className="h-4 w-4 cursor-pointer accent-primary"
              />
              <Label htmlFor={id} className="cursor-pointer font-normal leading-snug">
                {opt(o)}
              </Label>
            </div>
          );
        })}
      </div>
      {value && (
        <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 text-muted-foreground" onClick={() => onSelect("")}>
          {t("kids.editor.clearAnswer", { defaultValue: "Clear this answer" })}
        </Button>
      )}
    </fieldset>
  );

  if (section === "basics") {
    const imperial = form.height_cm != null ? convertHeightToImperial(form.height_cm) : null;
    const setImperialHeight = (feetText: string | null, inchesText: string | null) => {
      const feet = feetText !== null ? parseNumber(feetText) : imperial?.feet ?? null;
      const inches = inchesText !== null ? parseNumber(inchesText) : imperial?.inches ?? null;
      if ((feet === null || feet === 0) && (inches === null || inches === 0)) {
        onChange({ height_cm: null });
        return;
      }
      onChange({ height_cm: convertHeightToMetric((feet ?? 0) * 12 + (inches ?? 0)) });
    };
    const dob = form.date_of_birth ? parseIsoDate(form.date_of_birth) : null;
    const ageText = dob && !Number.isNaN(dob.getTime())
      ? differenceInYears(new Date(), dob) >= 2
        ? t("kids.editor.basics.ageYears", { count: differenceInYears(new Date(), dob), defaultValue: "{{count}} years old" })
        : t("kids.editor.basics.ageMonths", { count: Math.max(0, differenceInMonths(new Date(), dob)), defaultValue: "{{count}} months old" })
      : null;
    const avatarSrc = photo.previewUrl ?? form.profile_picture_url ?? undefined;
    const ids = {
      name: `${uid}-name`,
      nameError: `${uid}-name-error`,
      dob: `${uid}-dob`,
      dobAge: `${uid}-dob-age`,
      photo: `${uid}-photo`,
      photoHint: `${uid}-photo-hint`,
      gender: `${uid}-gender`,
    };
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor={ids.name}>{t("kids.dialog.name.label", { defaultValue: "Child's name" })}</Label>
          <Input
            id={ids.name}
            value={form.name}
            maxLength={NAME_MAX}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder={t("kids.dialog.name.placeholder", { defaultValue: "Enter name" })}
            autoComplete="off"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? ids.nameError : undefined}
            className={cn("min-h-11", errors.name && "border-destructive focus-visible:ring-destructive")}
          />
          {errors.name && (
            <p id={ids.nameError} className="text-sm text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.dob}>{t("kids.dialog.dob.label", { defaultValue: "Date of birth" })}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={ids.dob}
              type="date"
              value={form.date_of_birth}
              min="1900-01-01"
              max={todayIso()}
              onChange={(e) => onChange({ date_of_birth: e.target.value })}
              aria-describedby={ageText ? ids.dobAge : undefined}
              className="min-h-11 w-auto"
            />
            {ageText && (
              <span id={ids.dobAge} className="text-sm text-muted-foreground">
                {ageText}
              </span>
            )}
            {form.date_of_birth && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 px-2 text-muted-foreground"
                onClick={() => onChange({ date_of_birth: "" })}
              >
                {t("kids.dialog.dob.clear", { defaultValue: "Clear date of birth" })}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.photo}>{t("kids.dialog.photo.label", { defaultValue: "Profile picture" })}</Label>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              {/* US-634: a stored object needs signing; KidAvatarImage passes a blob: preview through untouched. */}
              <KidAvatarImage src={avatarSrc} />
              <AvatarFallback>
                <UserCircle className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                id={ids.photo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={photo.onFile}
                disabled={photo.uploading}
                aria-describedby={ids.photoHint}
                className="cursor-pointer"
              />
              <p id={ids.photoHint} className="text-xs text-muted-foreground">
                {photo.uploading
                  ? t("kids.dialog.photo.uploading", { defaultValue: "Uploading..." })
                  : t("kids.dialog.photo.hint", { defaultValue: "JPEG, PNG or WebP, up to 5MB" })}
              </p>
              {(form.profile_picture_url || photo.previewUrl) && !photo.uploading && (
                <Button type="button" variant="ghost" size="sm" className="min-h-11 px-2 text-muted-foreground" onClick={photo.onRemove}>
                  <X className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t("kids.dialog.photo.remove", { defaultValue: "Remove photo" })}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={ids.gender}>{t("kids.intake.basics.gender", { defaultValue: "Gender (optional)" })}</Label>
          <select
            id={ids.gender}
            value={form.gender}
            onChange={(e) => onChange({ gender: e.target.value })}
            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">{t("kids.intake.basics.genderPlaceholder", { defaultValue: "Select gender" })}</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {opt(g)}
              </option>
            ))}
            {form.gender && !GENDERS.some((g) => g.value === form.gender) && <option value={form.gender}>{form.gender}</option>}
          </select>
        </div>

        <div className="space-y-3">
          <Segmented
            name="units"
            legend={t("kids.intake.basics.units", { defaultValue: "Measurement units" })}
            options={[
              { value: "imperial", label: t("kids.intake.basics.imperial", { defaultValue: "Imperial (ft/lb)" }) },
              { value: "metric", label: t("kids.intake.basics.metric", { defaultValue: "Metric (cm/kg)" }) },
            ]}
            value={unitSystem}
            onSelect={(v) => setUnitSystem(v === "metric" ? "metric" : "imperial")}
            columns={2}
          />
          {unitSystem === "imperial" ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${uid}-feet`}>{t("kids.intake.basics.feet", { defaultValue: "Height (feet)" })}</Label>
                <Input
                  id={`${uid}-feet`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className="min-h-11"
                  value={imperial ? imperial.feet : ""}
                  onChange={(e) => setImperialHeight(e.target.value, null)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${uid}-inches`}>{t("kids.intake.basics.inches", { defaultValue: "Height (inches)" })}</Label>
                <Input
                  id={`${uid}-inches`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  className="min-h-11"
                  value={imperial ? imperial.inches : ""}
                  onChange={(e) => setImperialHeight(null, e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${uid}-lbs`}>{t("kids.intake.basics.pounds", { defaultValue: "Weight (lb)" })}</Label>
                <Input
                  id={`${uid}-lbs`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="min-h-11"
                  value={form.weight_kg != null ? convertWeightToImperial(form.weight_kg) : ""}
                  onChange={(e) => {
                    const lbs = parseNumber(e.target.value);
                    onChange({ weight_kg: lbs === null ? null : convertWeightToMetric(lbs) });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor={`${uid}-cm`}>{t("kids.intake.basics.cm", { defaultValue: "Height (cm)" })}</Label>
                <Input
                  id={`${uid}-cm`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="min-h-11"
                  value={form.height_cm ?? ""}
                  onChange={(e) => onChange({ height_cm: parseNumber(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${uid}-kg`}>{t("kids.intake.basics.kg", { defaultValue: "Weight (kg)" })}</Label>
                <Input
                  id={`${uid}-kg`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className="min-h-11"
                  value={form.weight_kg ?? ""}
                  onChange={(e) => onChange({ weight_kg: parseNumber(e.target.value) })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (section === "allergies") {
    const setAllergens = (next: string[]) => {
      const allergens = normalizeKidAllergenInput(next);
      onChange({
        allergy_status: "has",
        allergens,
        allergen_severity: pruneAllergenSeverity(allergens, form.allergen_severity) as Record<string, string>,
      });
    };
    const isPicked = (value: string) => {
      const key = canonicalAllergen(value);
      return form.allergens.some((a) => canonicalAllergen(a) === key);
    };
    const pickerKeys = new Set(KID_ALLERGEN_PICKER.map((p) => canonicalAllergen(p.value)));
    const isPickerValue = (a: string) => pickerKeys.has(canonicalAllergen(a));
    const custom = form.allergens.filter((a) => !isPickerValue(a));
    const severityOf = (allergen: string): string => {
      const key = canonicalAllergen(allergen);
      const hit = Object.entries(form.allergen_severity).find(([k]) => canonicalAllergen(k) === key);
      return hit?.[1] ?? "";
    };
    const setSeverity = (allergen: string, level: string) => {
      const key = canonicalAllergen(allergen);
      const rest = Object.fromEntries(
        Object.entries(form.allergen_severity).filter(([k]) => canonicalAllergen(k) !== key),
      );
      onChange({ allergen_severity: { ...rest, [allergen]: level } });
    };
    const baseRecorded = effectiveAllergens(base) !== null;

    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          {t("kids.intake.allergies.help", { defaultValue: "Meal plans and recipes skip any food that carries one of these." })}
        </p>
        <Segmented
          name="allergy-status"
          legend={t("kids.intake.allergies.statusLegend", { defaultValue: "Does {{name}} have food allergies?", name: kidName })}
          options={ALLERGY_STATUSES.map((o) => ({ value: o.value, label: opt(o) }))}
          value={form.allergy_status}
          onSelect={(v) => onChange({ allergy_status: v as AllergyStatus })}
        />
        {form.allergy_status === "unsure" && !isAdd && baseRecorded && (
          <p className="text-sm text-muted-foreground">
            {t("kids.editor.allergies.unsureKeeps", {
              defaultValue: "Not sure yet leaves the saved answer as it is. Pick one of the other answers to change it.",
            })}
          </p>
        )}

        {form.allergy_status === "has" && (
          <div className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">
                {t("kids.intake.allergies.pickerLegend", { defaultValue: "Known food allergies" })}
              </legend>
              <div className="flex flex-wrap gap-2">
                {KID_ALLERGEN_PICKER.map(({ value, labelKey }) => {
                  const pressed = isPicked(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => {
                        const key = canonicalAllergen(value);
                        setAllergens(
                          pressed ? form.allergens.filter((a) => canonicalAllergen(a) !== key) : [...form.allergens, value],
                        );
                      }}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm capitalize transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        pressed
                          ? "border-destructive bg-destructive text-destructive-foreground"
                          : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {pressed && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                      {t(labelKey, { defaultValue: value })}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <KidChipInput
              id={`${uid}-other-allergen`}
              label={t("kids.intake.allergies.other", { defaultValue: "Other allergen" })}
              hint={t("kids.intake.allergies.otherHint", { defaultValue: "Type one and press Enter, for example kiwi or mustard." })}
              values={custom}
              onChange={(next) => setAllergens([...form.allergens.filter(isPickerValue), ...next])}
              removeLabel={removeLabel}
            />

            {form.allergens.length > 0 && (
              <div className="space-y-4 rounded-lg bg-destructive/10 p-4">
                <p className="text-sm font-medium">
                  {t("kids.intake.allergies.severityHeading", { defaultValue: "How severe is each reaction?" })}
                </p>
                {form.allergens.map((allergen) => (
                  <Segmented
                    key={allergen}
                    name={`severity-${canonicalAllergen(allergen)}`}
                    legend={<span className="capitalize">{allergenLabel(allergen)}</span>}
                    options={SEVERITIES.map((s) => ({ value: s.value, label: opt(s) }))}
                    value={severityOf(allergen)}
                    onSelect={(v) => setSeverity(allergen, v)}
                  />
                ))}
                <div className="flex min-h-11 items-center gap-3 border-t pt-3">
                  <Checkbox
                    id={`${uid}-cross-contact`}
                    checked={form.cross_contamination_sensitive}
                    onCheckedChange={(checked) => onChange({ cross_contamination_sensitive: checked === true })}
                  />
                  <Label htmlFor={`${uid}-cross-contact`} className="cursor-pointer font-normal">
                    {t("kids.intake.allergies.crossContact", { defaultValue: "Reacts to cross-contact (shared pans, traces)" })}
                  </Label>
                </div>
              </div>
            )}
            {errors.allergens && (
              <p role="alert" className="text-sm text-destructive">
                {errors.allergens}
              </p>
            )}
          </div>
        )}

        {checkboxGroup(
          "restriction",
          t("kids.intake.allergies.restrictions", { defaultValue: "Dietary restrictions" }),
          DIETARY_RESTRICTIONS,
          form.dietary_restrictions,
          "dietary_restrictions",
          true,
        )}
      </div>
    );
  }

  if (section === "safeFoods") {
    const onList = new Set(form.favorite_foods.map((f) => f.trim().toLowerCase()));
    const quick = COMMON_FOODS.filter((f) => !onList.has(f.name.toLowerCase()));
    return (
      <div className="space-y-6">
        <KidChipInput
          id={`${uid}-safe-foods`}
          label={t("kids.editor.safeFoods.label", { defaultValue: "Foods {{name}} likes and accepts", name: kidName })}
          hint={t("kids.editor.chipHint", { defaultValue: "Press Enter or type a comma after each one." })}
          placeholder={t("kids.intake.preferences.favoritesPlaceholder", { defaultValue: "e.g. apples, chicken, pasta" })}
          values={form.favorite_foods}
          onChange={(next) => onChange({ favorite_foods: next })}
          suggestions={foodNames}
          suggestionsLabel={t("kids.editor.suggestions", { defaultValue: "Foods in your kitchen" })}
          removeLabel={removeLabel}
          warningFor={allergenWarning}
        />
        {quick.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="flex items-center gap-2 text-sm font-medium">
              <Heart className="h-4 w-4 text-primary" aria-hidden="true" />
              {t("kids.editor.safeFoods.quickAdd", { defaultValue: "Quick add" })}
            </legend>
            <div className="flex flex-wrap gap-2">
              {quick.map((food) => {
                const conflict = matchingFoodAllergen(knownAllergens, food);
                return (
                  <button
                    key={food.name}
                    type="button"
                    disabled={!!conflict}
                    onClick={() => onChange({ favorite_foods: [...form.favorite_foods, food.name] })}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-full border border-input bg-background px-3 text-sm text-foreground transition-colors",
                      "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                  >
                    {food.name}
                    {conflict && (
                      <span className="text-xs text-destructive">
                        {t("kids.dialog.favorites.contains", { allergen: allergenLabel(conflict), defaultValue: "Contains {{allergen}}" })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
      </div>
    );
  }

  if (section === "alwaysEats") {
    return (
      <KidChipInput
        id={`${uid}-always-eats`}
        label={t("kids.intake.preferences.alwaysEats", { defaultValue: "Foods they eat every day" })}
        hint={t("kids.intake.preferences.alwaysEatsHint", {
          defaultValue: "These are the safe foods new meals are built around. Press Enter or type a comma after each.",
        })}
        placeholder={t("kids.intake.preferences.alwaysEatsPlaceholder", { defaultValue: "e.g. chicken nuggets, mac and cheese" })}
        values={form.always_eats_foods}
        onChange={(next) => onChange({ always_eats_foods: next })}
        suggestions={foodNames}
        suggestionsLabel={t("kids.editor.suggestions", { defaultValue: "Foods in your kitchen" })}
        removeLabel={removeLabel}
        warningFor={allergenWarning}
      />
    );
  }

  if (section === "dislikes") {
    return (
      <KidChipInput
        id={`${uid}-dislikes`}
        label={t("kids.intake.avoid.label", { defaultValue: "Foods {{name}} strongly dislikes or refuses", name: kidName })}
        hint={t("kids.intake.avoid.optional", { defaultValue: "Optional. Foods listed here are left out of suggestions." })}
        placeholder={t("kids.intake.avoid.placeholder", { defaultValue: "e.g. mushrooms, onions" })}
        values={form.disliked_foods}
        onChange={(next) => onChange({ disliked_foods: next })}
        suggestions={foodNames}
        suggestionsLabel={t("kids.editor.suggestions", { defaultValue: "Foods in your kitchen" })}
        removeLabel={removeLabel}
      />
    );
  }

  if (section === "textures") {
    return (
      <div className="space-y-6">
        {radioList(
          "texture-level",
          t("kids.intake.texture.levelLegend", { defaultValue: "Does {{name}} have texture sensitivities?", name: kidName }),
          TEXTURE_LEVELS,
          form.texture_sensitivity_level,
          // "None" means there is nothing to avoid, so the list goes with it.
          (v) => onChange(v === "none" ? { texture_sensitivity_level: v, texture_dislikes: [] } : { texture_sensitivity_level: v }),
        )}
        {form.texture_sensitivity_level !== "none" &&
          checkboxGroup(
            "texture-avoid",
            t("kids.intake.texture.avoidLegend", { defaultValue: "Which textures does {{name}} avoid?", name: kidName }),
            TEXTURE_DISLIKES,
            form.texture_dislikes,
            "texture_dislikes",
            true,
          )}
        {checkboxGroup(
          "texture-like",
          t("kids.intake.texture.likeLegend", { defaultValue: "Textures they like" }),
          TEXTURE_LIKES,
          form.texture_preferences,
          "texture_preferences",
          true,
        )}
        <KidChipInput
          id={`${uid}-preparations`}
          label={t("kids.editor.textures.preparations", { defaultValue: "How {{name}} likes food prepared", name: kidName })}
          hint={t("kids.editor.chipHint", { defaultValue: "Press Enter or type a comma after each one." })}
          placeholder={t("kids.editor.textures.preparationsPlaceholder", { defaultValue: "e.g. roasted, sauce on the side" })}
          values={form.preferred_preparations}
          onChange={(next) => onChange({ preferred_preparations: next })}
          suggestions={PREPARATION_SUGGESTIONS}
          suggestionsLabel={t("kids.editor.textures.preparationSuggestions", { defaultValue: "Common preparations" })}
          removeLabel={removeLabel}
        />
      </div>
    );
  }

  if (section === "behavior") {
    const habits = form.behavioral_notes.split(",").map((h) => h.trim()).filter(Boolean);
    const pickiness =
      form.eating_behavior || form.new_food_willingness
        ? pickinessFromAnswers(form.eating_behavior, form.new_food_willingness)
        : form.pickiness_level;
    const pickinessOption = PICKINESS_LABELS.find((p) => p.value === pickiness);
    return (
      <div className="space-y-6">
        {radioList(
          "eating-behavior",
          t("kids.intake.behavior.varietyLegend", { defaultValue: "How would you describe {{name}}'s current eating habits?", name: kidName }),
          EATING_BEHAVIOR,
          form.eating_behavior,
          (v) => onChange({ eating_behavior: v }),
          t("kids.intake.behavior.varietyHint", { defaultValue: "Pick the one closest to how many foods they eat." }),
        )}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            {t("kids.intake.behavior.habitsLegend", { defaultValue: "Eating habits (select all that apply)" })}
          </legend>
          <div className="space-y-1">
            {EATING_HABITS.map((habit, i) => {
              const id = `${uid}-habit-${i}`;
              return (
                <div key={habit.value} className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={id}
                    checked={habits.includes(habit.value)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...habits.filter((h) => h !== habit.value), habit.value]
                        : habits.filter((h) => h !== habit.value);
                      onChange({ behavioral_notes: next.join(", ") });
                    }}
                  />
                  <Label htmlFor={id} className="cursor-pointer font-normal leading-snug">
                    {opt(habit)}
                  </Label>
                </div>
              );
            })}
          </div>
        </fieldset>
        {radioList(
          "willingness",
          t("kids.intake.behavior.willingnessLegend", { defaultValue: "Willingness to try new foods" }),
          WILLINGNESS,
          form.new_food_willingness,
          (v) => onChange({ new_food_willingness: v }),
        )}
        {pickiness && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {t("kids.editor.behavior.pickiness", { defaultValue: "Pickiness, from these answers:" })}
            </span>
            <Badge variant="outline" data-testid="pickiness-level">
              {pickinessOption ? opt(pickinessOption) : pickiness.replace(/_/g, " ")}
            </Badge>
          </div>
        )}
      </div>
    );
  }

  if (section === "goals") {
    return (
      <div className="space-y-6">
        {checkboxGroup(
          "goal",
          t("kids.intake.basics.goals", { defaultValue: "Health goals (optional)" }),
          HEALTH_GOALS,
          form.health_goals,
          "health_goals",
        )}
        {checkboxGroup(
          "concern",
          t("kids.intake.basics.concerns", { defaultValue: "Health conditions or growth concerns (select any that apply)" }),
          NUTRITION_CONCERNS,
          form.nutrition_concerns,
          "nutrition_concerns",
        )}
      </div>
    );
  }

  // notes
  const notesId = `${uid}-notes`;
  return (
    <div className="space-y-2">
      <Label htmlFor={notesId}>{t("kids.dialog.notes.label", { defaultValue: "Notes (optional)" })}</Label>
      <Textarea
        id={notesId}
        value={form.notes}
        maxLength={NOTES_MAX}
        rows={6}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder={t("kids.dialog.notes.placeholder", {
          defaultValue: "Dietary needs, textures, anything a caregiver should know",
        })}
        aria-describedby={`${notesId}-count`}
      />
      <p id={`${notesId}-count`} className="text-right text-xs tabular-nums text-muted-foreground">
        {t("kids.dialog.notes.count", { used: form.notes.length, max: NOTES_MAX, defaultValue: "{{used}}/{{max}}" })}
      </p>
    </div>
  );
}

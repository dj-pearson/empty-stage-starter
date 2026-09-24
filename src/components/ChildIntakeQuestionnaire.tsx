import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "@/i18n/appLocale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, Sparkles, AlertTriangle, Info, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useKids } from "@/contexts/KidsContext";
import { useFoods } from "@/contexts/FoodsContext";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { KidUpdateSchema } from "@/lib/validations";
import {
  KID_ALLERGEN_PICKER,
  canonicalAllergen,
  normalizeKidAllergenInput,
  pruneAllergenSeverity,
} from "@/lib/allergens";
import {
  EMPTY_INTAKE_FORM,
  commitListDraft,
  intakeFormFromRow,
  intakeFormToUpdate,
  pickinessFromAnswers,
  type AllergyStatus,
  type IntakeFormData,
  type IntakeRow,
  type KidIntakeUpdate,
} from "@/lib/kidIntakeForm";

interface ChildIntakeQuestionnaireProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kidId: string;
  kidName: string;
  onComplete: () => void;
}

interface Option {
  value: string;
  labelKey: string;
  label: string;
}

const DIETARY_RESTRICTIONS: Option[] = [
  { value: "vegetarian", labelKey: "kids.intake.restrictions.vegetarian", label: "Vegetarian" },
  { value: "vegan", labelKey: "kids.intake.restrictions.vegan", label: "Vegan" },
  { value: "halal", labelKey: "kids.intake.restrictions.halal", label: "Halal" },
  { value: "kosher", labelKey: "kids.intake.restrictions.kosher", label: "Kosher" },
  { value: "gluten-free", labelKey: "kids.intake.restrictions.glutenFree", label: "Gluten-free" },
  { value: "dairy-free", labelKey: "kids.intake.restrictions.dairyFree", label: "Dairy-free" },
];

const NUTRITION_CONCERNS: Option[] = [
  { value: "Underweight", labelKey: "kids.intake.concerns.underweight", label: "Underweight" },
  { value: "Overweight", labelKey: "kids.intake.concerns.overweight", label: "Overweight" },
  { value: "Iron deficiency", labelKey: "kids.intake.concerns.iron", label: "Iron deficiency" },
  { value: "Constipation", labelKey: "kids.intake.concerns.constipation", label: "Constipation" },
  { value: "Diabetes", labelKey: "kids.intake.concerns.diabetes", label: "Diabetes" },
  { value: "ADHD", labelKey: "kids.intake.concerns.adhd", label: "ADHD" },
];

const HEALTH_GOALS: Option[] = [
  { value: "Increase vegetable intake", labelKey: "kids.intake.goals.vegetables", label: "Increase vegetable intake" },
  { value: "More protein", labelKey: "kids.intake.goals.protein", label: "More protein" },
  { value: "Gain weight", labelKey: "kids.intake.goals.gainWeight", label: "Gain weight" },
  { value: "Better nutrition", labelKey: "kids.intake.goals.nutrition", label: "Better nutrition" },
  { value: "Reduce sugar", labelKey: "kids.intake.goals.sugar", label: "Reduce sugar" },
];

const EATING_BEHAVIOR: Option[] = [
  { value: "wide_variety", labelKey: "kids.intake.behavior.variety.wide", label: "Eats a wide variety (30+ different foods regularly)" },
  { value: "moderate", labelKey: "kids.intake.behavior.variety.moderate", label: "Eats moderately (15-30 foods)" },
  { value: "limited", labelKey: "kids.intake.behavior.variety.limited", label: "Limited variety (10-15 foods)" },
  { value: "very_limited", labelKey: "kids.intake.behavior.variety.veryLimited", label: "Very limited (fewer than 10 foods)" },
];

const EATING_HABITS: Option[] = [
  { value: "Eats the same foods every day", labelKey: "kids.intake.behavior.habits.sameFoods", label: "Eats the same foods every day" },
  { value: "Refuses to try new foods", labelKey: "kids.intake.behavior.habits.refusesNew", label: "Refuses to try new foods" },
  { value: "Gets upset when new foods are presented", labelKey: "kids.intake.behavior.habits.upset", label: "Gets upset when new foods are presented" },
  { value: "Only eats specific brands", labelKey: "kids.intake.behavior.habits.brands", label: "Only eats specific brands" },
  { value: "Food must be prepared a certain way", labelKey: "kids.intake.behavior.habits.prepared", label: "Food must be prepared a certain way" },
  { value: "Refuses mixed foods (foods touching)", labelKey: "kids.intake.behavior.habits.mixed", label: "Refuses mixed foods (foods touching)" },
];

const WILLINGNESS: Option[] = [
  { value: "willing", labelKey: "kids.intake.behavior.willingness.willing", label: "Willing and curious about new foods" },
  { value: "hesitant", labelKey: "kids.intake.behavior.willingness.hesitant", label: "Hesitant but will sometimes try" },
  { value: "very_hesitant", labelKey: "kids.intake.behavior.willingness.veryHesitant", label: "Very hesitant, rarely tries new foods" },
  { value: "refuses", labelKey: "kids.intake.behavior.willingness.refuses", label: "Refuses to try new foods entirely" },
];

const TEXTURE_LEVELS: Option[] = [
  { value: "none", labelKey: "kids.intake.texture.levels.none", label: "No texture issues, eats all textures" },
  { value: "mild", labelKey: "kids.intake.texture.levels.mild", label: "Mild, dislikes 1-2 specific textures" },
  { value: "strong", labelKey: "kids.intake.texture.levels.strong", label: "Strong, avoids several textures" },
  { value: "severe", labelKey: "kids.intake.texture.levels.severe", label: "Severe, texture aversions limit the diet a lot" },
];

const TEXTURE_DISLIKES: Option[] = [
  { value: "Soft/mushy", labelKey: "kids.intake.texture.avoid.mushy", label: "Soft/mushy" },
  { value: "Slimy", labelKey: "kids.intake.texture.avoid.slimy", label: "Slimy" },
  { value: "Crunchy", labelKey: "kids.intake.texture.avoid.crunchy", label: "Crunchy" },
  { value: "Chewy", labelKey: "kids.intake.texture.avoid.chewy", label: "Chewy" },
  { value: "Lumpy", labelKey: "kids.intake.texture.avoid.lumpy", label: "Lumpy" },
  { value: "Wet", labelKey: "kids.intake.texture.avoid.wet", label: "Wet" },
  { value: "Foods touching each other", labelKey: "kids.intake.texture.avoid.touching", label: "Foods touching each other" },
];

const TEXTURE_LIKES: Option[] = [
  { value: "Crunchy", labelKey: "kids.intake.texture.like.crunchy", label: "Crunchy" },
  { value: "Soft", labelKey: "kids.intake.texture.like.soft", label: "Soft" },
  { value: "Smooth", labelKey: "kids.intake.texture.like.smooth", label: "Smooth" },
  { value: "Chewy", labelKey: "kids.intake.texture.like.chewy", label: "Chewy" },
  { value: "Crispy", labelKey: "kids.intake.texture.like.crispy", label: "Crispy" },
];

const ALLERGY_STATUSES: Option[] = [
  { value: "has", labelKey: "kids.intake.allergies.status.has", label: "Has allergies" },
  { value: "none", labelKey: "kids.intake.allergies.status.none", label: "No known allergies" },
  { value: "unsure", labelKey: "kids.intake.allergies.status.unsure", label: "Not sure yet" },
];

const SEVERITIES: Option[] = [
  { value: "mild", labelKey: "kids.intake.allergies.severity.mild", label: "Mild" },
  { value: "moderate", labelKey: "kids.intake.allergies.severity.moderate", label: "Moderate" },
  { value: "severe", labelKey: "kids.intake.allergies.severity.severe", label: "Severe" },
];

const PICKINESS_LABELS: Option[] = [
  { value: "not_picky", labelKey: "kids.intake.pickiness.not_picky", label: "Not picky" },
  { value: "somewhat_picky", labelKey: "kids.intake.pickiness.somewhat_picky", label: "Somewhat picky" },
  { value: "very_picky", labelKey: "kids.intake.pickiness.very_picky", label: "Very picky" },
  { value: "extremely_picky", labelKey: "kids.intake.pickiness.extremely_picky", label: "Extremely picky" },
];

const STEP_COUNT = 7;
const REVIEW_STEP = STEP_COUNT - 1;

/** Which step owns each saved field, so a validation error can jump to it. */
const FIELD_STEP: Record<string, number> = {
  gender: 0,
  height_cm: 0,
  weight_kg: 0,
  nutrition_concerns: 0,
  health_goals: 0,
  allergens: 1,
  allergen_severity: 1,
  cross_contamination_sensitive: 1,
  dietary_restrictions: 1,
  eating_behavior: 2,
  new_food_willingness: 2,
  behavioral_notes: 2,
  texture_dislikes: 3,
  texture_preferences: 3,
  favorite_foods: 4,
  always_eats_foods: 4,
  disliked_foods: 5,
};

/** US, Liberia and Myanmar measure children in feet and pounds; everyone else in cm and kg. */
function defaultUnitSystem(): "imperial" | "metric" {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    return region === "US" || region === "LR" || region === "MM" ? "imperial" : "metric";
  } catch {
    return "imperial";
  }
}

// Unit conversion with precision that is fine for a growth record.
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

const humanize = (value: string) => value.replace(/_/g, " ");

interface ChipListInputProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  values: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  listId?: string;
  removeLabel: (item: string) => string;
}

/**
 * A list typed as chips. The old field was one comma-joined Input whose value
 * was re-split on every keystroke, which ate the comma and the space before a
 * parent could type the next food. Here the text being typed is kept apart
 * from the list and only committed on Enter, a comma, or leaving the field.
 */
function ChipListInput({ id, label, hint, values, onChange, placeholder, listId, removeLabel }: ChipListInputProps) {
  const [draft, setDraft] = useState("");
  const hintId = `${id}-hint`;

  const commit = (text: string) => {
    const next = commitListDraft(values, text);
    if (next.length !== values.length) onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(draft);
      setDraft("");
    } else if (e.key === "Backspace" && draft === "" && values.length > 0) {
      e.preventDefault();
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <Label htmlFor={id} className="mb-2 block">{label}</Label>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-2">
          {values.map((item) => (
            <li key={item}>
              <Badge variant="secondary" className="gap-1 pr-1 font-normal text-sm">
                {item}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={removeLabel(item)}
                  onClick={() => onChange(values.filter((v) => v !== item))}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        list={listId}
        autoComplete="off"
        aria-describedby={hint ? hintId : undefined}
        onKeyDown={handleKeyDown}
        onChange={(e) => {
          const text = e.target.value;
          if (text.includes(",")) {
            // Commit everything before the last comma; keep typing after it.
            const cut = text.lastIndexOf(",");
            commit(text.slice(0, cut));
            setDraft(text.slice(cut + 1).trimStart());
          } else {
            setDraft(text);
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft("");
          }
        }}
      />
      {hint && <p id={hintId} className="text-sm text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export function ChildIntakeQuestionnaire({ open, onOpenChange, kidId, kidName, onComplete }: ChildIntakeQuestionnaireProps) {
  const { t } = useTranslation();
  const uid = useId();
  const { updateKid } = useKids();
  const { foods } = useFoods();
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [unitSystem, setUnitSystem] = useState<"imperial" | "metric">(defaultUnitSystem);
  const [formData, setFormData] = useState<IntakeFormData>(EMPTY_INTAKE_FORM);
  // What was on the profile when the dialog opened: the baseline for "did the
  // parent clear this?" in intakeFormToUpdate and for the unsaved-changes guard.
  const [loadedForm, setLoadedForm] = useState<IntakeFormData>(EMPTY_INTAKE_FORM);
  const [stepError, setStepError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(currentStep);
  // The form used to open blank and write that blank state over the
  // saved profile, so re-running the intake to change one answer erased the
  // child's allergens. It now loads the saved row first, and Save stays off
  // until that load succeeds.
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadState("loading");
    setCurrentStep(0);
    setStepError(null);
    void (async () => {
      const { data, error } = await supabase
        .from("kids")
        // "*" so a column this form does not know about never fails the read.
        .select("*")
        .eq("id", kidId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        logger.error("Error loading profile for questionnaire:", error);
        toast.error(t("kids.intake.loadError", { defaultValue: "Couldn't load this profile, so it can't be edited right now" }));
        setLoadState("error");
        return;
      }
      const loaded = intakeFormFromRow(data as IntakeRow);
      setFormData(loaded);
      setLoadedForm(loaded);
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [open, kidId, t]);

  // Move focus to the new step's heading so a screen reader announces it and
  // keyboard users start at the top of the step.
  useEffect(() => {
    if (previousStep.current === currentStep) return;
    previousStep.current = currentStep;
    headingRef.current?.focus();
  }, [currentStep]);

  const foodNames = useMemo(() => {
    const names = new Set<string>();
    for (const food of foods) {
      if (food.name) names.add(food.name);
      if (names.size >= 500) break;
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [foods]);

  const isDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(loadedForm),
    [formData, loadedForm],
  );

  const update = useCallback((patch: Partial<IntakeFormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleArrayItem = (
    field: "nutrition_concerns" | "health_goals" | "dietary_restrictions" | "texture_dislikes" | "texture_preferences",
    item: string,
  ) => {
    setFormData((prev) => {
      const current = prev[field];
      const next = current.includes(item) ? current.filter((i) => i !== item) : [...current, item];
      return { ...prev, [field]: next };
    });
  };

  /** Replace the allergen list, keeping only the severities that still apply. */
  const setAllergens = (list: string[]) => {
    setFormData((prev) => {
      const allergens = normalizeKidAllergenInput(list);
      const allergen_severity = pruneAllergenSeverity(allergens, prev.allergen_severity) as Record<string, string>;
      return { ...prev, allergens, allergen_severity };
    });
  };

  const pickerCanonicals = useMemo(
    () => new Set(KID_ALLERGEN_PICKER.map((p) => canonicalAllergen(p.value))),
    [],
  );
  const isPicked = (value: string) => {
    const key = canonicalAllergen(value);
    return formData.allergens.some((a) => canonicalAllergen(a) === key);
  };
  const otherAllergens = formData.allergens.filter((a) => !pickerCanonicals.has(canonicalAllergen(a)));
  const severityOf = (allergen: string): string => {
    const direct = formData.allergen_severity[allergen];
    if (direct) return direct;
    const key = canonicalAllergen(allergen);
    const hit = Object.entries(formData.allergen_severity).find(([k]) => canonicalAllergen(k) === key);
    return hit?.[1] ?? "";
  };

  const steps = [
    { title: t("kids.intake.steps.basics.title", { defaultValue: "Basic information" }), description: t("kids.intake.steps.basics.description", { defaultValue: "Health and growth" }) },
    { title: t("kids.intake.steps.allergies.title", { defaultValue: "Allergies and restrictions" }), description: t("kids.intake.steps.allergies.description", { defaultValue: "Safety first" }) },
    { title: t("kids.intake.steps.behavior.title", { defaultValue: "Eating behavior" }), description: t("kids.intake.steps.behavior.description", { defaultValue: "Current habits" }) },
    { title: t("kids.intake.steps.texture.title", { defaultValue: "Texture and sensory" }), description: t("kids.intake.steps.texture.description", { defaultValue: "Sensitivities" }) },
    { title: t("kids.intake.steps.preferences.title", { defaultValue: "Food preferences" }), description: t("kids.intake.steps.preferences.description", { defaultValue: "What they eat" }) },
    { title: t("kids.intake.steps.avoid.title", { defaultValue: "Foods to avoid" }), description: t("kids.intake.steps.avoid.description", { defaultValue: "Dislikes (optional)" }) },
    { title: t("kids.intake.steps.review.title", { defaultValue: "Review" }), description: t("kids.intake.steps.review.description", { defaultValue: "Check before saving" }) },
  ];

  const progress = ((currentStep + 1) / STEP_COUNT) * 100;

  const goToStep = (step: number) => {
    setStepError(null);
    setCurrentStep(Math.max(0, Math.min(REVIEW_STEP, step)));
  };

  const friendlyError = (field: string): string => {
    switch (field) {
      case "height_cm":
        return t("kids.intake.errors.height", { defaultValue: "Height needs to be between 40 and 220 cm (about 1 ft 4 in to 7 ft 2 in)." });
      case "weight_kg":
        return t("kids.intake.errors.weight", { defaultValue: "Weight needs to be between 1 and 200 kg (about 2 to 440 lb)." });
      case "gender":
        return t("kids.intake.errors.gender", { defaultValue: "Pick one of the gender options, or leave it blank." });
      case "allergens":
      case "allergen_severity":
        return t("kids.intake.errors.allergens", { defaultValue: "Each allergen needs a name of 50 characters or fewer, and there can be at most 20." });
      case "favorite_foods":
      case "always_eats_foods":
      case "disliked_foods":
        return t("kids.intake.errors.foods", { defaultValue: "Keep each food under 100 characters, and the list to 50 foods." });
      case "behavioral_notes":
        return t("kids.intake.errors.notes", { defaultValue: "The eating habit notes are too long to save." });
      default:
        return t("kids.intake.errors.generic", { defaultValue: "One of these answers couldn't be saved. Check it and try again." });
    }
  };

  /**
   * Build and validate the patch. On a validation failure, jump to the step
   * that owns the first bad field and say what is wrong there.
   */
  const buildPayload = (): KidIntakeUpdate | null => {
    const payload = intakeFormToUpdate(formData, loadedForm);
    const result = KidUpdateSchema.safeParse(payload);
    if (result.success) return payload;
    const field = String(result.error.issues[0]?.path[0] ?? "");
    logger.warn("Intake validation failed:", result.error.issues);
    setCurrentStep(FIELD_STEP[field] ?? REVIEW_STEP);
    setStepError(friendlyError(field));
    return null;
  };

  const handleSubmit = async () => {
    if (loadState !== "ready" || saving) return;
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      const ok = await updateKid(kidId, {
        ...payload,
        profile_completed: true,
        profile_last_reviewed: new Date().toISOString(),
      });
      if (!ok) {
        // updateKid has already told the parent why; keep every answer on screen.
        setStepError(t("kids.intake.errors.saveFailed", { defaultValue: "Couldn't save. Your answers are still here, so try again." }));
        return;
      }
      toast.success(t("kids.intake.saved", { defaultValue: "{{name}}'s profile is saved", name: kidName }));
      onComplete();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForLater = async () => {
    if (loadState !== "ready" || saving) return;
    const payload = buildPayload();
    if (!payload) {
      setConfirmClose(false);
      return;
    }
    setSaving(true);
    try {
      const ok = Object.keys(payload).length === 0 ? true : await updateKid(kidId, payload);
      if (!ok) {
        setConfirmClose(false);
        setStepError(t("kids.intake.errors.saveFailed", { defaultValue: "Couldn't save. Your answers are still here, so try again." }));
        return;
      }
      toast.success(t("kids.intake.savedForLater", { defaultValue: "Saved. You can finish {{name}}'s profile later.", name: kidName }));
      setConfirmClose(false);
      onComplete();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDialogOpenChange = (next: boolean) => {
    if (!next && isDirty && loadState === "ready") {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  // --- Imperial height: the two boxes are views of one height_cm. An empty
  // pair clears it; inches past 11.5 carry into feet on the next render.
  const imperial = formData.height_cm != null ? convertHeightToImperial(formData.height_cm) : null;
  const setImperialHeight = (feetText: string | null, inchesText: string | null) => {
    const feet = feetText !== null ? parseNumber(feetText) : imperial?.feet ?? null;
    const inches = inchesText !== null ? parseNumber(inchesText) : imperial?.inches ?? null;
    if ((feet === null || feet === 0) && (inches === null || inches === 0)) {
      update({ height_cm: null });
      return;
    }
    update({ height_cm: convertHeightToMetric((feet ?? 0) * 12 + (inches ?? 0)) });
  };

  const ids = {
    gender: `${uid}-gender`,
    feet: `${uid}-feet`,
    inches: `${uid}-inches`,
    lbs: `${uid}-lbs`,
    cm: `${uid}-cm`,
    kg: `${uid}-kg`,
    crossContact: `${uid}-cross-contact`,
    otherAllergen: `${uid}-other-allergen`,
    favorites: `${uid}-favorites`,
    alwaysEats: `${uid}-always-eats`,
    dislikes: `${uid}-dislikes`,
    foodList: `${uid}-food-names`,
    stepDescription: `${uid}-step-description`,
  };

  const removeLabel = (item: string) => t("kids.intake.chips.remove", { defaultValue: "Remove {{item}}", item });

  const pickiness =
    formData.eating_behavior || formData.new_food_willingness
      ? pickinessFromAnswers(formData.eating_behavior, formData.new_food_willingness)
      : null;

  const optionLabel = (options: Option[], value: string) => {
    const o = options.find((opt) => opt.value === value);
    return o ? t(o.labelKey, { defaultValue: o.label }) : humanize(value);
  };

  const radioGroup = (
    name: string,
    legend: ReactNode,
    options: Option[],
    value: string,
    onSelect: (value: string) => void,
    hint?: ReactNode,
  ) => (
    <fieldset>
      <legend className="text-sm font-medium leading-none mb-3">{legend}</legend>
      {hint && <p className="text-sm text-muted-foreground mb-3">{hint}</p>}
      <div className="space-y-2">
        {options.map((option, i) => {
          const id = `${uid}-${name}-${i}`;
          return (
            <div key={option.value} className="flex items-center space-x-2">
              <input
                type="radio"
                id={id}
                name={`${uid}-${name}`}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onSelect(e.target.value)}
                className="cursor-pointer accent-primary"
              />
              <Label htmlFor={id} className="font-normal cursor-pointer">
                {t(option.labelKey, { defaultValue: option.label })}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );

  const checkboxGroup = (
    name: string,
    legend: ReactNode,
    options: Option[],
    selected: readonly string[],
    onToggle: (value: string) => void,
    className = "space-y-2",
  ) => (
    <fieldset>
      <legend className="text-sm font-medium leading-none mb-3">{legend}</legend>
      <div className={className}>
        {options.map((option, i) => {
          const id = `${uid}-${name}-${i}`;
          return (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox id={id} checked={selected.includes(option.value)} onCheckedChange={() => onToggle(option.value)} />
              <Label htmlFor={id} className="font-normal cursor-pointer">
                {t(option.labelKey, { defaultValue: option.label })}
              </Label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );

  const notAnswered = <p className="text-sm text-muted-foreground">{t("kids.intake.review.notAnswered", { defaultValue: "Not answered" })}</p>;

  const reviewSection = (title: string, step: number, body: ReactNode) => (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => goToStep(step)}
          aria-label={t("kids.intake.review.editAria", { defaultValue: "Edit {{section}}", section: title })}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          {t("kids.intake.review.edit", { defaultValue: "Edit" })}
        </Button>
      </div>
      {body}
    </section>
  );

  const listOrNone = (items: readonly string[]) =>
    items.length > 0 ? <p className="text-sm">{items.join(", ")}</p> : notAnswered;

  const allergyStatusLabel = optionLabel(ALLERGY_STATUSES, formData.allergy_status || "unsure");

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] md:max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("kids.intake.title", { defaultValue: "{{name}}'s profile questionnaire", name: kidName })}
            </DialogTitle>
            <DialogDescription>
              {t("kids.intake.subtitle", { defaultValue: "A few questions so meal plans fit {{name}}. Skip anything you're not sure about.", name: kidName })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Progress value={progress} className="h-2" aria-hidden="true" />
            <ol className="hidden md:flex justify-between gap-1 text-xs text-muted-foreground">
              {steps.map((step, idx) => (
                <li
                  key={step.title}
                  aria-current={currentStep === idx ? "step" : undefined}
                  className={cn("text-center flex-1", currentStep === idx && "text-primary font-medium")}
                >
                  {step.title}
                </li>
              ))}
            </ol>
            <div>
              <h3
                ref={headingRef}
                tabIndex={-1}
                aria-describedby={ids.stepDescription}
                className="text-base font-semibold focus:outline-none"
              >
                <span className="md:sr-only">
                  {t("kids.intake.stepOf", { defaultValue: "Step {{n}} of {{total}}:", n: currentStep + 1, total: STEP_COUNT })}{" "}
                </span>
                {steps[currentStep].title}
              </h3>
              <p id={ids.stepDescription} className="text-sm text-muted-foreground">
                {steps[currentStep].description}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2 space-y-6 px-1">
            {stepError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{stepError}</span>
              </div>
            )}

            {/* Step 1: Basic information */}
            {currentStep === 0 && (
              <div className="space-y-6">
                <div>
                  <Label htmlFor={ids.gender} className="mb-2 block">
                    {t("kids.intake.basics.gender", { defaultValue: "Gender (optional)" })}
                  </Label>
                  <Select value={formData.gender} onValueChange={(value) => update({ gender: value })}>
                    <SelectTrigger id={ids.gender}>
                      <SelectValue placeholder={t("kids.intake.basics.genderPlaceholder", { defaultValue: "Select gender" })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{t("kids.intake.basics.genders.male", { defaultValue: "Male" })}</SelectItem>
                      <SelectItem value="female">{t("kids.intake.basics.genders.female", { defaultValue: "Female" })}</SelectItem>
                      <SelectItem value="other">{t("kids.intake.basics.genders.other", { defaultValue: "Other" })}</SelectItem>
                      <SelectItem value="prefer_not_to_say">{t("kids.intake.basics.genders.preferNot", { defaultValue: "Prefer not to say" })}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <span className="text-sm font-medium" id={`${uid}-units`}>
                      {t("kids.intake.basics.units", { defaultValue: "Measurement units" })}
                    </span>
                    <div className="flex gap-2" role="group" aria-labelledby={`${uid}-units`}>
                      <Button
                        type="button"
                        variant={unitSystem === "imperial" ? "default" : "outline"}
                        size="sm"
                        aria-pressed={unitSystem === "imperial"}
                        onClick={() => setUnitSystem("imperial")}
                      >
                        {t("kids.intake.basics.imperial", { defaultValue: "Imperial (ft/lb)" })}
                      </Button>
                      <Button
                        type="button"
                        variant={unitSystem === "metric" ? "default" : "outline"}
                        size="sm"
                        aria-pressed={unitSystem === "metric"}
                        onClick={() => setUnitSystem("metric")}
                      >
                        {t("kids.intake.basics.metric", { defaultValue: "Metric (cm/kg)" })}
                      </Button>
                    </div>
                  </div>

                  {unitSystem === "imperial" ? (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={ids.feet}>{t("kids.intake.basics.feet", { defaultValue: "Height (feet)" })}</Label>
                        <Input
                          id={ids.feet}
                          type="number"
                          inputMode="numeric"
                          placeholder="4"
                          min="0"
                          onChange={(e) => setImperialHeight(e.target.value, null)}
                          value={imperial ? imperial.feet : ""}
                        />
                      </div>
                      <div>
                        <Label htmlFor={ids.inches}>{t("kids.intake.basics.inches", { defaultValue: "Height (inches)" })}</Label>
                        <Input
                          id={ids.inches}
                          type="number"
                          inputMode="decimal"
                          placeholder="5"
                          min="0"
                          step="0.5"
                          onChange={(e) => setImperialHeight(null, e.target.value)}
                          value={imperial ? imperial.inches : ""}
                        />
                      </div>
                      <div>
                        <Label htmlFor={ids.lbs}>{t("kids.intake.basics.pounds", { defaultValue: "Weight (lb)" })}</Label>
                        <Input
                          id={ids.lbs}
                          type="number"
                          inputMode="decimal"
                          placeholder="55"
                          step="0.1"
                          onChange={(e) => {
                            const lbs = parseNumber(e.target.value);
                            update({ weight_kg: lbs === null ? null : convertWeightToMetric(lbs) });
                          }}
                          value={formData.weight_kg != null ? convertWeightToImperial(formData.weight_kg) : ""}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={ids.cm}>{t("kids.intake.basics.cm", { defaultValue: "Height (cm)" })}</Label>
                        <Input
                          id={ids.cm}
                          type="number"
                          inputMode="decimal"
                          placeholder="120"
                          step="0.1"
                          value={formData.height_cm ?? ""}
                          onChange={(e) => update({ height_cm: parseNumber(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={ids.kg}>{t("kids.intake.basics.kg", { defaultValue: "Weight (kg)" })}</Label>
                        <Input
                          id={ids.kg}
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          placeholder="25"
                          value={formData.weight_kg ?? ""}
                          onChange={(e) => update({ weight_kg: parseNumber(e.target.value) })}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {checkboxGroup(
                  "concern",
                  t("kids.intake.basics.concerns", { defaultValue: "Health conditions or growth concerns (select any that apply)" }),
                  NUTRITION_CONCERNS,
                  formData.nutrition_concerns,
                  (v) => toggleArrayItem("nutrition_concerns", v),
                )}

                {checkboxGroup(
                  "goal",
                  t("kids.intake.basics.goals", { defaultValue: "Health goals (optional)" }),
                  HEALTH_GOALS,
                  formData.health_goals,
                  (v) => toggleArrayItem("health_goals", v),
                )}
              </div>
            )}

            {/* Step 2: Allergies and dietary restrictions */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
                      {t("kids.intake.allergies.heading", { defaultValue: "Food allergies" })}
                    </CardTitle>
                    <CardDescription>
                      {t("kids.intake.allergies.help", { defaultValue: "Meal plans and recipes skip any food that carries one of these." })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {radioGroup(
                      "allergy-status",
                      t("kids.intake.allergies.statusLegend", { defaultValue: "Does {{name}} have food allergies?", name: kidName }),
                      ALLERGY_STATUSES,
                      formData.allergy_status,
                      (v) => update({ allergy_status: v as AllergyStatus }),
                    )}

                    {formData.allergy_status === "has" && (
                      <>
                        <fieldset>
                          <legend className="text-sm font-medium leading-none mb-3">
                            {t("kids.intake.allergies.pickerLegend", { defaultValue: "Known food allergies" })}
                          </legend>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {KID_ALLERGEN_PICKER.map((allergen, i) => {
                              const id = `${uid}-allergen-${i}`;
                              const checked = isPicked(allergen.value);
                              return (
                                <div key={allergen.value} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={id}
                                    checked={checked}
                                    onCheckedChange={() => {
                                      const key = canonicalAllergen(allergen.value);
                                      setAllergens(
                                        checked
                                          ? formData.allergens.filter((a) => canonicalAllergen(a) !== key)
                                          : [...formData.allergens, allergen.value],
                                      );
                                    }}
                                  />
                                  <Label htmlFor={id} className="text-sm font-normal cursor-pointer capitalize">
                                    {t(allergen.labelKey, { defaultValue: allergen.value })}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </fieldset>

                        <ChipListInput
                          id={ids.otherAllergen}
                          label={t("kids.intake.allergies.other", { defaultValue: "Other allergen" })}
                          hint={t("kids.intake.allergies.otherHint", { defaultValue: "Type one and press Enter, for example kiwi or mustard." })}
                          values={otherAllergens}
                          onChange={(next) =>
                            setAllergens([
                              ...formData.allergens.filter((a) => pickerCanonicals.has(canonicalAllergen(a))),
                              ...next,
                            ])
                          }
                          removeLabel={removeLabel}
                        />

                        {formData.allergens.length > 0 && (
                          <div className="space-y-3 p-4 bg-destructive/10 rounded-lg">
                            <p className="text-sm font-medium">
                              {t("kids.intake.allergies.severityHeading", { defaultValue: "How severe is each reaction?" })}
                            </p>
                            {formData.allergens.map((allergen, i) => {
                              const id = `${uid}-severity-${i}`;
                              return (
                                <div key={allergen} className="flex items-center justify-between gap-2">
                                  <Label htmlFor={id} className="text-sm font-normal capitalize">{allergen}</Label>
                                  <Select
                                    value={severityOf(allergen)}
                                    onValueChange={(v) =>
                                      setFormData((prev) => {
                                        // Drop any other spelling of this allergen's key first.
                                        const key = canonicalAllergen(allergen);
                                        const rest = Object.fromEntries(
                                          Object.entries(prev.allergen_severity).filter(([k]) => canonicalAllergen(k) !== key),
                                        );
                                        return { ...prev, allergen_severity: { ...rest, [allergen]: v } };
                                      })
                                    }
                                  >
                                    <SelectTrigger id={id} className="w-32">
                                      <SelectValue placeholder={t("kids.intake.allergies.severityPlaceholder", { defaultValue: "Select" })} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SEVERITIES.map((s) => (
                                        <SelectItem key={s.value} value={s.value}>
                                          {t(s.labelKey, { defaultValue: s.label })}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              );
                            })}

                            <div className="flex items-center space-x-2 pt-2 border-t">
                              <Checkbox
                                id={ids.crossContact}
                                checked={formData.cross_contamination_sensitive}
                                onCheckedChange={(checked) => update({ cross_contamination_sensitive: checked === true })}
                              />
                              <Label htmlFor={ids.crossContact} className="text-sm font-normal cursor-pointer">
                                {t("kids.intake.allergies.crossContact", { defaultValue: "Reacts to cross-contact (shared pans, traces)" })}
                              </Label>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {checkboxGroup(
                      "restriction",
                      t("kids.intake.allergies.restrictions", { defaultValue: "Dietary restrictions" }),
                      DIETARY_RESTRICTIONS,
                      formData.dietary_restrictions,
                      (v) => toggleArrayItem("dietary_restrictions", v),
                      "grid grid-cols-2 sm:grid-cols-3 gap-3",
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 3: Eating behavior */}
            {currentStep === 2 && (
              <div className="space-y-6">
                {radioGroup(
                  "eating-behavior",
                  t("kids.intake.behavior.varietyLegend", { defaultValue: "How would you describe {{name}}'s current eating habits?", name: kidName }),
                  EATING_BEHAVIOR,
                  formData.eating_behavior,
                  (v) => update({ eating_behavior: v }),
                  t("kids.intake.behavior.varietyHint", { defaultValue: "Pick the one closest to how many foods they eat." }),
                )}

                <fieldset>
                  <legend className="text-sm font-medium leading-none mb-3">
                    {t("kids.intake.behavior.habitsLegend", { defaultValue: "Eating habits (select all that apply)" })}
                  </legend>
                  <div className="space-y-2">
                    {EATING_HABITS.map((habit, i) => {
                      const id = `${uid}-habit-${i}`;
                      const habits = formData.behavioral_notes.split(",").map((h) => h.trim()).filter(Boolean);
                      return (
                        <div key={habit.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={id}
                            checked={habits.includes(habit.value)}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [...habits.filter((h) => h !== habit.value), habit.value]
                                : habits.filter((h) => h !== habit.value);
                              update({ behavioral_notes: next.join(", ") });
                            }}
                          />
                          <Label htmlFor={id} className="font-normal cursor-pointer">
                            {t(habit.labelKey, { defaultValue: habit.label })}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>

                {radioGroup(
                  "willingness",
                  t("kids.intake.behavior.willingnessLegend", { defaultValue: "Willingness to try new foods" }),
                  WILLINGNESS,
                  formData.new_food_willingness,
                  (v) => update({ new_food_willingness: v }),
                )}
              </div>
            )}

            {/* Step 4: Texture and sensory */}
            {currentStep === 3 && (
              <div className="space-y-6">
                {radioGroup(
                  "texture-level",
                  t("kids.intake.texture.levelLegend", { defaultValue: "Does {{name}} have texture sensitivities?", name: kidName }),
                  TEXTURE_LEVELS,
                  formData.texture_sensitivity_level,
                  (v) =>
                    // "None" means there is nothing to avoid, so the list goes with it.
                    update(v === "none" ? { texture_sensitivity_level: v, texture_dislikes: [] } : { texture_sensitivity_level: v }),
                )}

                {formData.texture_sensitivity_level !== "none" && (
                  <div className="bg-muted/50 p-4 rounded-lg border">
                    {checkboxGroup(
                      "texture-avoid",
                      t("kids.intake.texture.avoidLegend", { defaultValue: "Which textures does {{name}} avoid?", name: kidName }),
                      TEXTURE_DISLIKES,
                      formData.texture_dislikes,
                      (v) => toggleArrayItem("texture_dislikes", v),
                    )}
                  </div>
                )}

                {checkboxGroup(
                  "texture-like",
                  t("kids.intake.texture.likeLegend", { defaultValue: "Textures they like" }),
                  TEXTURE_LIKES,
                  formData.texture_preferences,
                  (v) => toggleArrayItem("texture_preferences", v),
                )}
              </div>
            )}

            {/* Step 5: Food preferences */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {t("kids.intake.preferences.intro", { defaultValue: "Tell us what {{name}} regularly eats, so suggestions start from foods they know.", name: kidName })}
                </p>

                <ChipListInput
                  id={ids.favorites}
                  label={t("kids.intake.preferences.favorites", { defaultValue: "Favorite foods" })}
                  placeholder={t("kids.intake.preferences.favoritesPlaceholder", { defaultValue: "e.g. apples, chicken, pasta" })}
                  values={formData.favorite_foods}
                  onChange={(next) => update({ favorite_foods: next })}
                  listId={ids.foodList}
                  removeLabel={removeLabel}
                />

                <ChipListInput
                  id={ids.alwaysEats}
                  label={t("kids.intake.preferences.alwaysEats", { defaultValue: "Foods they eat every day" })}
                  placeholder={t("kids.intake.preferences.alwaysEatsPlaceholder", { defaultValue: "e.g. chicken nuggets, mac and cheese" })}
                  hint={t("kids.intake.preferences.alwaysEatsHint", { defaultValue: "These are the safe foods new meals are built around. Press Enter or type a comma after each." })}
                  values={formData.always_eats_foods}
                  onChange={(next) => update({ always_eats_foods: next })}
                  listId={ids.foodList}
                  removeLabel={removeLabel}
                />
              </div>
            )}

            {/* Step 6: Foods to avoid */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="flex items-start gap-2 bg-muted/30 p-4 rounded-lg border">
                  <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">
                    {t("kids.intake.avoid.optional", { defaultValue: "Optional. Foods listed here are left out of suggestions." })}
                  </p>
                </div>

                <ChipListInput
                  id={ids.dislikes}
                  label={t("kids.intake.avoid.label", { defaultValue: "Foods {{name}} strongly dislikes or refuses", name: kidName })}
                  placeholder={t("kids.intake.avoid.placeholder", { defaultValue: "e.g. mushrooms, onions" })}
                  values={formData.disliked_foods}
                  onChange={(next) => update({ disliked_foods: next })}
                  listId={ids.foodList}
                  removeLabel={removeLabel}
                />
              </div>
            )}

            {/* Step 7: Review */}
            {currentStep === REVIEW_STEP && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                    {t("kids.intake.review.heading", { defaultValue: "Profile summary" })}
                  </CardTitle>
                  <CardDescription>
                    {t("kids.intake.review.description", { defaultValue: "Check {{name}}'s answers before saving.", name: kidName })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {reviewSection(
                    t("kids.intake.review.allergies", { defaultValue: "Allergies" }),
                    1,
                    formData.allergy_status === "has" && formData.allergens.length > 0 ? (
                      <div className="space-y-2">
                        <ul className="flex flex-wrap gap-2">
                          {formData.allergens.map((allergen) => {
                            const severity = severityOf(allergen);
                            return (
                              <li key={allergen}>
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                  <span className="capitalize">{allergen}</span>
                                  <span className="font-normal">
                                    ({severity
                                      ? optionLabel(SEVERITIES, severity)
                                      : t("kids.intake.review.severityUnknown", { defaultValue: "severity not set" })})
                                  </span>
                                </Badge>
                              </li>
                            );
                          })}
                        </ul>
                        {formData.cross_contamination_sensitive && (
                          <p className="text-sm">{t("kids.intake.review.crossContact", { defaultValue: "Reacts to cross-contact" })}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm">{formData.allergy_status === "has" ? optionLabel(ALLERGY_STATUSES, "unsure") : allergyStatusLabel}</p>
                    ),
                  )}

                  {reviewSection(
                    t("kids.intake.review.alwaysEats", { defaultValue: "Eats every day" }),
                    4,
                    listOrNone(formData.always_eats_foods),
                  )}

                  {reviewSection(
                    t("kids.intake.review.favorites", { defaultValue: "Favorite foods" }),
                    4,
                    listOrNone(formData.favorite_foods),
                  )}

                  {reviewSection(
                    t("kids.intake.review.dislikes", { defaultValue: "Dislikes" }),
                    5,
                    listOrNone(formData.disliked_foods),
                  )}

                  {reviewSection(
                    t("kids.intake.review.restrictions", { defaultValue: "Dietary restrictions" }),
                    1,
                    listOrNone(formData.dietary_restrictions.map((r) => optionLabel(DIETARY_RESTRICTIONS, r))),
                  )}

                  {reviewSection(
                    t("kids.intake.review.eating", { defaultValue: "Eating habits" }),
                    2,
                    formData.eating_behavior || formData.new_food_willingness || pickiness ? (
                      <div className="space-y-1">
                        {formData.eating_behavior && <p className="text-sm">{optionLabel(EATING_BEHAVIOR, formData.eating_behavior)}</p>}
                        {formData.new_food_willingness && <p className="text-sm">{optionLabel(WILLINGNESS, formData.new_food_willingness)}</p>}
                        {pickiness && <Badge variant="outline">{optionLabel(PICKINESS_LABELS, pickiness)}</Badge>}
                      </div>
                    ) : (
                      notAnswered
                    ),
                  )}

                  {reviewSection(
                    t("kids.intake.review.textures", { defaultValue: "Textures" }),
                    3,
                    formData.texture_sensitivity_level || formData.texture_dislikes.length > 0 || formData.texture_preferences.length > 0 ? (
                      <div className="space-y-1">
                        {formData.texture_sensitivity_level && (
                          <Badge variant="outline" data-testid="texture-level">
                            {t(`kids.intake.texture.short.${formData.texture_sensitivity_level}`, {
                              defaultValue: humanize(formData.texture_sensitivity_level),
                            })}
                          </Badge>
                        )}
                        {formData.texture_dislikes.length > 0 && (
                          <p className="text-sm">
                            {t("kids.intake.review.avoids", { defaultValue: "Avoids: {{list}}", list: formData.texture_dislikes.map((v) => optionLabel(TEXTURE_DISLIKES, v)).join(", ") })}
                          </p>
                        )}
                        {formData.texture_preferences.length > 0 && (
                          <p className="text-sm">
                            {t("kids.intake.review.likes", { defaultValue: "Likes: {{list}}", list: formData.texture_preferences.map((v) => optionLabel(TEXTURE_LIKES, v)).join(", ") })}
                          </p>
                        )}
                      </div>
                    ) : (
                      notAnswered
                    ),
                  )}

                  {reviewSection(
                    t("kids.intake.review.goals", { defaultValue: "Goals and health" }),
                    0,
                    listOrNone([
                      ...formData.health_goals.map((g) => optionLabel(HEALTH_GOALS, g)),
                      ...formData.nutrition_concerns.map((c) => optionLabel(NUTRITION_CONCERNS, c)),
                    ]),
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <datalist id={ids.foodList}>
            {foodNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="flex items-center justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => goToStep(currentStep - 1)} disabled={currentStep === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              {t("kids.intake.back", { defaultValue: "Back" })}
            </Button>

            {currentStep < REVIEW_STEP ? (
              <Button onClick={() => goToStep(currentStep + 1)}>
                {t("kids.intake.next", { defaultValue: "Next" })}
                <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={saving || loadState !== "ready"}>
                {saving
                  ? t("kids.intake.saving", { defaultValue: "Saving..." })
                  : t("kids.intake.complete", { defaultValue: "Complete Profile" })}
                <Check className="h-4 w-4 ml-1" aria-hidden="true" />
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("kids.intake.closeGuard.title", { defaultValue: "Keep these answers?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("kids.intake.closeGuard.description", { defaultValue: "You've changed {{name}}'s profile. Save what you have and finish the rest later, or discard the changes.", name: kidName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t("kids.intake.closeGuard.keepEditing", { defaultValue: "Keep editing" })}</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmClose(false);
                onOpenChange(false);
              }}
            >
              {t("kids.intake.closeGuard.discard", { defaultValue: "Discard" })}
            </Button>
            <Button onClick={handleSaveForLater} disabled={saving}>
              {t("kids.intake.closeGuard.saveLater", { defaultValue: "Save and finish later" })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

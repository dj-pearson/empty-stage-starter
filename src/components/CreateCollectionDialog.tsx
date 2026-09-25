import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { RecipeCollection } from "@/types";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormValidation, validationRules } from "@/hooks/useFormValidation";
import {
  COLLECTION_ICON_OPTIONS,
  COLLECTION_TONES,
  COLLECTION_TONE_KEYS,
  DEFAULT_COLLECTION_COLOR,
  DEFAULT_COLLECTION_ICON,
  collectionIcon,
  collectionTone,
} from "@/lib/collectionAppearance";
import type { CollectionInput, CollectionPatch } from "@/hooks/useRecipeCollections";
import "@/i18n/appLocale";

const COLLECTION_TEMPLATES = [
  { key: "weeknight", name: "Weeknight Dinners", icon: "clock", color: "primary", description: "Quick meals for busy evenings" },
  { key: "kidFavorites", name: "Kid Favorites", icon: "heart", color: "pink", description: "Recipes kids love" },
  { key: "familyClassics", name: "Family Classics", icon: "users", color: "green", description: "Traditional family meals" },
  { key: "tryNew", name: "Try New Foods", icon: "sparkles", color: "purple", description: "Adventurous recipes" },
];

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCollection?: RecipeCollection | null;
  /** useRecipeCollections().create */
  onCreate: (input: CollectionInput) => Promise<RecipeCollection | null>;
  /** useRecipeCollections().update */
  onUpdate: (id: string, patch: CollectionPatch) => Promise<boolean>;
  /** Called with the new collection so the page can select it. */
  onCollectionCreated?: (collection: RecipeCollection) => void;
  onCollectionUpdated?: (collection: RecipeCollection) => void;
}

interface RadioOption {
  value: string;
  label: string;
  content: ReactNode;
}

/**
 * A row of radio buttons with roving focus: Tab lands on the checked one,
 * arrow keys move and select, as a native radio group does.
 */
function RadioRow({
  label,
  options,
  value,
  onChange,
  optionClassName,
}: {
  label: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  optionClassName?: (checked: boolean) => string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    let next = -1;
    if (delta !== 0) next = (current + delta + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            tabIndex={i === current ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border px-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              checked ? "border-primary bg-primary/10 font-medium" : "border-border bg-background hover:bg-muted",
              optionClassName?.(checked),
            )}
          >
            {option.content}
          </button>
        );
      })}
    </div>
  );
}

export function CreateCollectionDialog({
  open,
  onOpenChange,
  editCollection,
  onCreate,
  onUpdate,
  onCollectionCreated,
  onCollectionUpdated,
}: CreateCollectionDialogProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: DEFAULT_COLLECTION_ICON,
    color: DEFAULT_COLLECTION_COLOR,
    is_default: false,
  });
  const [saving, setSaving] = useState(false);

  const { errors, validate, clearError, clearErrors } = useFormValidation({
    name: validationRules.required(t("recipes.collections.nameLabel", { defaultValue: "Collection name" })),
  });

  useEffect(() => {
    if (!open) return;
    if (editCollection) {
      setFormData({
        name: editCollection.name,
        description: editCollection.description || "",
        icon: editCollection.icon || DEFAULT_COLLECTION_ICON,
        color: editCollection.color || DEFAULT_COLLECTION_COLOR,
        is_default: editCollection.is_default,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        icon: DEFAULT_COLLECTION_ICON,
        color: DEFAULT_COLLECTION_COLOR,
        is_default: false,
      });
    }
    clearErrors();
  }, [editCollection, open, clearErrors]);

  const handleTemplateSelect = (template: (typeof COLLECTION_TEMPLATES)[number]) => {
    setFormData((prev) => ({
      ...prev,
      name: t(`recipes.collections.templates.${template.key}.name`, { defaultValue: template.name }),
      description: t(`recipes.collections.templates.${template.key}.description`, {
        defaultValue: template.description,
      }),
      icon: template.icon,
      color: template.color,
    }));
    clearError("name");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(formData)) return;

    const input: CollectionInput = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      icon: formData.icon,
      color: formData.color,
      is_default: formData.is_default,
    };

    setSaving(true);
    try {
      if (editCollection) {
        const ok = await onUpdate(editCollection.id, input);
        if (!ok) return;
        toast.success(t("recipes.collections.updated", { defaultValue: "Saved \"{{name}}\"", name: input.name }));
        onCollectionUpdated?.({
          ...editCollection,
          name: input.name,
          description: input.description ?? undefined,
          icon: input.icon,
          color: input.color,
          is_default: Boolean(input.is_default),
        });
      } else {
        const created = await onCreate(input);
        if (!created) return;
        toast.success(t("recipes.collections.created", { defaultValue: "Created \"{{name}}\"", name: created.name }));
        onCollectionCreated?.(created);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const tone = collectionTone(formData.color);
  const PreviewIcon = collectionIcon(formData.icon);

  const iconOptions: RadioOption[] = COLLECTION_ICON_OPTIONS.map((option) => {
    const Icon = option.icon;
    return {
      value: option.value,
      label: t(`recipes.collections.icon.${option.labelKey}`, { defaultValue: option.label }),
      content: <Icon className={cn("h-5 w-5", tone.text)} aria-hidden="true" />,
    };
  });

  const colorOptions: RadioOption[] = COLLECTION_TONE_KEYS.map((key) => {
    const option = COLLECTION_TONES[key];
    const label = t(`recipes.collections.color.${key}`, { defaultValue: option.label });
    return {
      value: key,
      label,
      content: (
        <>
          <PreviewIcon className={cn("h-4 w-4", option.text)} aria-hidden="true" />
          <span>{label}</span>
        </>
      ),
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editCollection
              ? t("recipes.collections.editTitle", { defaultValue: "Edit collection" })
              : t("recipes.collections.createTitle", { defaultValue: "New collection" })}
          </DialogTitle>
          <DialogDescription>
            {t("recipes.collections.createDescription", {
              defaultValue: "Group recipes so the right one is a tap away.",
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4">
          {!editCollection && (
            <div className="space-y-2">
              <Label>{t("recipes.collections.templatesLabel", { defaultValue: "Start from" })}</Label>
              <div className="grid grid-cols-2 gap-2">
                {COLLECTION_TEMPLATES.map((template) => {
                  const TemplateIcon = collectionIcon(template.icon);
                  return (
                    <Button
                      key={template.key}
                      type="button"
                      variant="outline"
                      onClick={() => handleTemplateSelect(template)}
                      className="h-auto min-h-11 justify-start py-3"
                    >
                      <TemplateIcon
                        className={cn("mr-2 h-5 w-5 shrink-0", collectionTone(template.color).text)}
                        aria-hidden="true"
                      />
                      <span className="text-left">
                        <span className="block text-sm font-medium">
                          {t(`recipes.collections.templates.${template.key}.name`, { defaultValue: template.name })}
                        </span>
                        <span className="line-clamp-1 block text-xs text-muted-foreground">
                          {t(`recipes.collections.templates.${template.key}.description`, {
                            defaultValue: template.description,
                          })}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <FormField
            label={t("recipes.collections.nameLabel", { defaultValue: "Collection name" })}
            htmlFor="collection-name"
            error={errors.name}
            required
          >
            <Input
              id="collection-name"
              value={formData.name}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev) => ({ ...prev, name: value }));
                if (errors.name && value.trim()) clearError("name");
              }}
              placeholder={t("recipes.collections.namePlaceholder", {
                defaultValue: "e.g. Weeknight Dinners, Kid Favorites",
              })}
              className={errors.name ? "border-destructive" : ""}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "collection-name-error" : undefined}
              autoFocus
            />
          </FormField>

          <div className="space-y-2">
            <Label>{t("recipes.collections.iconLabel", { defaultValue: "Icon" })}</Label>
            <RadioRow
              label={t("recipes.collections.iconLabel", { defaultValue: "Icon" })}
              options={iconOptions}
              value={formData.icon}
              onChange={(icon) => setFormData((prev) => ({ ...prev, icon }))}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("recipes.collections.colorLabel", { defaultValue: "Color" })}</Label>
            <RadioRow
              label={t("recipes.collections.colorLabel", { defaultValue: "Color" })}
              options={colorOptions}
              value={formData.color}
              onChange={(color) => setFormData((prev) => ({ ...prev, color }))}
              optionClassName={() => "px-3"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection-description">
              {t("recipes.collections.descriptionLabel", { defaultValue: "Description (optional)" })}
            </Label>
            <Textarea
              id="collection-description"
              value={formData.description}
              onChange={(e) => {
                const value = e.target.value;
                setFormData((prev) => ({ ...prev, description: value }));
              }}
              placeholder={t("recipes.collections.descriptionPlaceholder", {
                defaultValue: "What kind of recipes go in this collection?",
              })}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="collection-is-default"
              checked={formData.is_default}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_default: checked === true }))}
            />
            <label htmlFor="collection-is-default" className="text-sm font-medium leading-none">
              {t("recipes.collections.setDefault", { defaultValue: "Set as default collection" })}
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("recipes.collections.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                  {t("recipes.collections.saving", { defaultValue: "Saving..." })}
                </>
              ) : editCollection ? (
                t("recipes.collections.update", { defaultValue: "Save" })
              ) : (
                t("recipes.collections.createCta", { defaultValue: "Create collection" })
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

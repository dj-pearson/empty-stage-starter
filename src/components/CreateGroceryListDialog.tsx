import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";
import type { GroceryListRow } from "@/hooks/useGroceryLists";
import "@/i18n/appLocale";

/** Icon values are emoji; the key names the label so it can be translated. */
const LIST_ICONS = [
  { value: "🛒", key: "cart" },
  { value: "🏪", key: "store" },
  { value: "📦", key: "package" },
  { value: "🎉", key: "party" },
  { value: "🍕", key: "pizza" },
  { value: "🍰", key: "cake" },
  { value: "🏠", key: "home" },
  { value: "💚", key: "heart" },
] as const;

/**
 * Templates carry a stable key, not an English name: the name is translated
 * at render and again at the moment it is copied into the form, so a
 * template's identity never depends on the UI language.
 */
const LIST_TEMPLATES = [
  { key: "weekly", icon: "🛒", name: "Weekly groceries", description: "Regular weekly shopping" },
  { key: "bulk", icon: "📦", name: "Costco run", description: "Bulk shopping" },
  { key: "party", icon: "🎉", name: "Party supplies", description: "For events and parties" },
  { key: "quick", icon: "🏪", name: "Quick shop", description: "Quick essentials" },
] as const;

type TemplateKey = (typeof LIST_TEMPLATES)[number]["key"];

interface CreateGroceryListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string | null;
  /** The inserted row. The page puts it in the lists (upsertLocal) and selects it. */
  onCreated: (row: GroceryListRow) => void;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  icon: "🛒",
  store_name: "",
  is_default: false,
};

export function CreateGroceryListDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  onCreated,
}: CreateGroceryListDialogProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData(EMPTY_FORM);
      setNameError(undefined);
    }
  }, [open]);

  const templateName = (key: TemplateKey, fallback: string) =>
    t(`grocery.lists.templates.${key}.name`, fallback);
  const templateDescription = (key: TemplateKey, fallback: string) =>
    t(`grocery.lists.templates.${key}.description`, fallback);

  const handleTemplateSelect = (template: (typeof LIST_TEMPLATES)[number]) => {
    setFormData((prev) => ({
      ...prev,
      name: templateName(template.key, template.name),
      description: templateDescription(template.key, template.description),
      icon: template.icon,
    }));
    setNameError(undefined);
  };

  /**
   * Clear the current default before writing a new one. Scoped by household,
   * like the lists themselves: clearing by user_id left a co-parent's default
   * standing, and the household ended up with two.
   */
  const clearExistingDefault = async () => {
    const base = supabase.from("grocery_lists").update({ is_default: false }).eq("is_default", true);
    const { error } = householdId ? await base.eq("household_id", householdId) : await base.eq("user_id", userId);
    if (error) throw error;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      setNameError(t("grocery.lists.create.nameRequired", "Give the list a name"));
      return;
    }

    setCreating(true);
    try {
      if (formData.is_default) await clearExistingDefault();

      const { data, error } = await supabase
        .from("grocery_lists")
        .insert({
          user_id: userId,
          household_id: householdId ?? null,
          name,
          description: formData.description.trim() || null,
          icon: formData.icon,
          store_name: formData.store_name.trim() || null,
          is_default: formData.is_default,
          is_archived: false,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success(t("grocery.lists.create.created", { defaultValue: "{{name}} created", name }));
      onCreated(data);
      onOpenChange(false);
    } catch (error) {
      logger.error("Error creating list:", error);
      toast.error(t("grocery.lists.create.failed", "Couldn't create the list. Try again."));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("grocery.lists.create.title", "New grocery list")}</DialogTitle>
          <DialogDescription>
            {t("grocery.lists.create.description", "Keep a separate list for each store or occasion.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("grocery.lists.create.templates", "Start from")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {LIST_TEMPLATES.map((template) => (
                <Button
                  key={template.key}
                  type="button"
                  variant="outline"
                  onClick={() => handleTemplateSelect(template)}
                  className="h-auto min-h-11 justify-start py-2"
                >
                  <span className="mr-2 text-xl" aria-hidden="true">
                    {template.icon}
                  </span>
                  <span className="text-left">
                    <span className="block text-sm font-medium">{templateName(template.key, template.name)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {templateDescription(template.key, template.description)}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <FormField
            label={t("grocery.lists.create.nameLabel", "List name")}
            htmlFor="grocery-list-name"
            error={nameError}
            required
          >
            <Input
              id="grocery-list-name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (nameError && e.target.value.trim()) setNameError(undefined);
              }}
              placeholder={t("grocery.lists.create.namePlaceholder", "e.g. Weekly groceries, Costco run")}
              className={nameError ? "border-destructive" : ""}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "grocery-list-name-error" : undefined}
              autoFocus
            />
          </FormField>

          <div className="space-y-2">
            <Label id="grocery-list-icon-label">{t("grocery.lists.create.iconLabel", "Icon")}</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="grocery-list-icon-label">
              {LIST_ICONS.map((icon) => (
                <Button
                  key={icon.value}
                  type="button"
                  variant={formData.icon === icon.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, icon: icon.value })}
                  className="h-12 w-12 text-xl"
                  aria-pressed={formData.icon === icon.value}
                  aria-label={t(`grocery.lists.icons.${icon.key}`, icon.key)}
                >
                  {icon.value}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grocery-list-store">{t("grocery.lists.create.storeLabel", "Store (optional)")}</Label>
            <Input
              id="grocery-list-store"
              value={formData.store_name}
              onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
              placeholder={t("grocery.lists.create.storePlaceholder", "e.g. Costco, Whole Foods, Target")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="grocery-list-description">
              {t("grocery.lists.create.descriptionLabel", "Notes (optional)")}
            </Label>
            <Textarea
              id="grocery-list-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={t("grocery.lists.create.descriptionPlaceholder", "What is this list for?")}
              rows={2}
            />
          </div>

          <div className="flex min-h-11 items-center space-x-2">
            <Checkbox
              id="grocery-list-is-default"
              checked={formData.is_default}
              onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked === true })}
            />
            <Label htmlFor="grocery-list-is-default" className="text-sm font-medium leading-none">
              {t("grocery.lists.create.setDefault", "Open this list by default")}
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              {t("grocery.lists.common.cancel", "Cancel")}
            </Button>
            <Button type="submit" className="h-11" disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("grocery.lists.create.creating", "Creating...")}
                </>
              ) : (
                t("grocery.lists.create.submit", "Create list")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

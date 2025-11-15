import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";
import { useFormValidation, validationRules } from "@/hooks/useFormValidation";

const LIST_ICONS = [
  { value: "🛒", label: "Shopping Cart" },
  { value: "🏪", label: "Store" },
  { value: "📦", label: "Package" },
  { value: "🎉", label: "Party" },
  { value: "🍕", label: "Pizza" },
  { value: "🍰", label: "Cake" },
  { value: "🏠", label: "Home" },
  { value: "💚", label: "Heart" },
];

const LIST_TEMPLATES = [
  { name: "Weekly Groceries", icon: "🛒", description: "Regular weekly shopping" },
  { name: "Costco Run", icon: "📦", description: "Bulk shopping" },
  { name: "Party Supplies", icon: "🎉", description: "For events and parties" },
  { name: "Quick Shop", icon: "🏪", description: "Quick essentials" },
];

interface CreateGroceryListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string;
  onListCreated: (listId: string) => void;
}

export function CreateGroceryListDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  onListCreated,
}: CreateGroceryListDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "🛒",
    store_name: "",
    is_default: false,
  });
  const [creating, setCreating] = useState(false);

  // Form validation
  const { errors, validate, clearError, clearErrors } = useFormValidation({
    name: validationRules.required("List name"),
  });

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setFormData({
        name: "",
        description: "",
        icon: "🛒",
        store_name: "",
        is_default: false,
      });
      clearErrors();
    }
  }, [open, clearErrors]);

  const handleTemplateSelect = (template: typeof LIST_TEMPLATES[0]) => {
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      icon: template.icon,
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!validate(formData)) {
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('grocery_lists')
        .insert([
          {
            user_id: userId,
            household_id: householdId,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            icon: formData.icon,
            store_name: formData.store_name.trim() || null,
            is_default: formData.is_default,
            is_archived: false,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success(`List "${formData.name}" created!`);
      onListCreated(data.id);
      onOpenChange(false);
    } catch (error) {
      logger.error('Error creating list:', error);
      toast.error("Failed to create list. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create New Grocery List</DialogTitle>
          <DialogDescription>
            Create a new list to organize your shopping by store, occasion, or category.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* Quick Templates */}
          <div className="space-y-2">
            <Label>Quick Templates</Label>
            <div className="grid grid-cols-2 gap-2">
              {LIST_TEMPLATES.map((template) => (
                <Button
                  key={template.name}
                  type="button"
                  variant="outline"
                  onClick={() => handleTemplateSelect(template)}
                  className="justify-start h-auto py-2"
                >
                  <span className="text-xl mr-2">{template.icon}</span>
                  <div className="text-left">
                    <div className="text-sm font-medium">{template.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {template.description}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Name */}
          <FormField label="List Name" htmlFor="name" error={errors.name} required>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name && e.target.value.trim()) {
                  clearError("name");
                }
              }}
              placeholder="e.g., Weekly Groceries, Costco Run"
              className={errors.name ? "border-red-500" : ""}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
            />
          </FormField>

          {/* Icon */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {LIST_ICONS.map((icon) => (
                <Button
                  key={icon.value}
                  type="button"
                  variant={formData.icon === icon.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, icon: icon.value })}
                  className="text-xl h-12 w-12"
                  title={icon.label}
                >
                  {icon.value}
                </Button>
              ))}
            </div>
          </div>

          {/* Store Name */}
          <div className="space-y-2">
            <Label htmlFor="store_name">Store Name (optional)</Label>
            <Input
              id="store_name"
              value={formData.store_name}
              onChange={(e) => setFormData({ ...formData, store_name: e.target.value })}
              placeholder="e.g., Costco, Whole Foods, Target"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this list for?"
              rows={2}
            />
          </div>

          {/* Default List */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_default"
              checked={formData.is_default}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_default: checked as boolean })
              }
            />
            <label
              htmlFor="is_default"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Set as default list
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create List"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


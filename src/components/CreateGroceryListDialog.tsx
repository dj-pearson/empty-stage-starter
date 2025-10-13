import { useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShoppingCart, Store, Package } from "lucide-react";

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

  const handleTemplateSelect = (template: typeof LIST_TEMPLATES[0]) => {
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      icon: template.icon,
    });
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a list name");
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
      handleClose();
    } catch (error) {
      console.error('Error creating list:', error);
      toast.error("Failed to create list");
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: "",
      description: "",
      icon: "🛒",
      store_name: "",
      is_default: false,
    });
    onOpenChange(false);
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

        <div className="space-y-4">
          {/* Quick Templates */}
          <div className="space-y-2">
            <Label>Quick Templates</Label>
            <div className="grid grid-cols-2 gap-2">
              {LIST_TEMPLATES.map((template) => (
                <Button
                  key={template.name}
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
          <div className="space-y-2">
            <Label htmlFor="name">List Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Weekly Groceries, Costco Run"
              required
            />
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {LIST_ICONS.map((icon) => (
                <Button
                  key={icon.value}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create List"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


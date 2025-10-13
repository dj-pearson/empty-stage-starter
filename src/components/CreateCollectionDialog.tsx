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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RecipeCollection } from "@/types";
import { Folder, Star, Heart, Zap, Pizza, Clock, Users, Sparkles } from "lucide-react";

const COLLECTION_ICONS = [
  { value: "folder", icon: Folder, label: "Folder" },
  { value: "star", icon: Star, label: "Favorites" },
  { value: "heart", icon: Heart, label: "Love" },
  { value: "zap", icon: Zap, label: "Quick" },
  { value: "pizza", icon: Pizza, label: "Pizza" },
  { value: "clock", icon: Clock, label: "Weeknight" },
  { value: "users", icon: Users, label: "Family" },
  { value: "sparkles", icon: Sparkles, label: "Special" },
];

const COLLECTION_COLORS = [
  { value: "primary", label: "Blue", class: "text-primary" },
  { value: "green", label: "Green", class: "text-green-600" },
  { value: "red", label: "Red", class: "text-red-600" },
  { value: "yellow", label: "Yellow", class: "text-yellow-600" },
  { value: "purple", label: "Purple", class: "text-purple-600" },
  { value: "pink", label: "Pink", class: "text-pink-600" },
  { value: "orange", label: "Orange", class: "text-orange-600" },
  { value: "gray", label: "Gray", class: "text-gray-600" },
];

const COLLECTION_TEMPLATES = [
  { name: "Weeknight Dinners", icon: "clock", color: "primary", description: "Quick meals for busy evenings" },
  { name: "Kid Favorites", icon: "heart", color: "pink", description: "Recipes kids love" },
  { name: "Family Classics", icon: "users", color: "green", description: "Traditional family meals" },
  { name: "Try New Foods", icon: "sparkles", color: "purple", description: "Adventurous recipes" },
];

interface CreateCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string;
  editCollection?: RecipeCollection | null;
  onCollectionCreated?: (collection: RecipeCollection) => void;
}

export function CreateCollectionDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  editCollection,
  onCollectionCreated,
}: CreateCollectionDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "folder",
    color: "primary",
    is_default: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editCollection) {
      setFormData({
        name: editCollection.name,
        description: editCollection.description || "",
        icon: editCollection.icon || "folder",
        color: editCollection.color || "primary",
        is_default: editCollection.is_default,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        icon: "folder",
        color: "primary",
        is_default: false,
      });
    }
  }, [editCollection, open]);

  const handleTemplateSelect = (template: typeof COLLECTION_TEMPLATES[0]) => {
    setFormData({
      ...formData,
      name: template.name,
      description: template.description,
      icon: template.icon,
      color: template.color,
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a collection name");
      return;
    }

    setSaving(true);
    try {
      if (editCollection) {
        // Update existing collection
        const { data, error } = await supabase
          .from('recipe_collections')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            icon: formData.icon,
            color: formData.color,
            is_default: formData.is_default,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editCollection.id)
          .select()
          .single();

        if (error) throw error;

        toast.success(`Collection "${formData.name}" updated!`);
        if (onCollectionCreated && data) {
          onCollectionCreated(data as unknown as RecipeCollection);
        }
      } else {
        // Create new collection
        const { data, error } = await supabase
          .from('recipe_collections')
          .insert([
            {
              user_id: userId,
              household_id: householdId,
              name: formData.name.trim(),
              description: formData.description.trim() || null,
              icon: formData.icon,
              color: formData.color,
              is_default: formData.is_default,
              sort_order: 0,
            },
          ])
          .select()
          .single();

        if (error) throw error;

        toast.success(`Collection "${formData.name}" created!`);
        if (onCollectionCreated && data) {
          onCollectionCreated(data as unknown as RecipeCollection);
        }
      }

      handleClose();
    } catch (error) {
      console.error('Error saving collection:', error);
      toast.error(editCollection ? "Failed to update collection" : "Failed to create collection");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const selectedIcon = COLLECTION_ICONS.find(i => i.value === formData.icon);
  const IconComponent = selectedIcon?.icon || Folder;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editCollection ? "Edit Collection" : "Create Recipe Collection"}
          </DialogTitle>
          <DialogDescription>
            Organize your recipes into collections for easy access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Templates (only for new collections) */}
          {!editCollection && (
            <div className="space-y-2">
              <Label>Quick Templates</Label>
              <div className="grid grid-cols-2 gap-2">
                {COLLECTION_TEMPLATES.map((template) => {
                  const TemplateIcon = COLLECTION_ICONS.find(i => i.value === template.icon)?.icon || Folder;
                  const colorClass = COLLECTION_COLORS.find(c => c.value === template.color)?.class || "text-primary";
                  
                  return (
                    <Button
                      key={template.name}
                      variant="outline"
                      onClick={() => handleTemplateSelect(template)}
                      className="justify-start h-auto py-3"
                    >
                      <TemplateIcon className={`h-5 w-5 mr-2 ${colorClass}`} />
                      <div className="text-left">
                        <div className="text-sm font-medium">{template.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {template.description}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Collection Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Weeknight Dinners, Kid Favorites"
              required
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {COLLECTION_ICONS.map((iconOption) => {
                const Icon = iconOption.icon;
                const colorClass = COLLECTION_COLORS.find(c => c.value === formData.color)?.class || "text-primary";
                
                return (
                  <Button
                    key={iconOption.value}
                    variant={formData.icon === iconOption.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFormData({ ...formData, icon: iconOption.value })}
                    className="h-12 w-12"
                    title={iconOption.label}
                  >
                    <Icon className={formData.icon === iconOption.value ? "" : colorClass} />
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLLECTION_COLORS.map((colorOption) => (
                <Button
                  key={colorOption.value}
                  variant={formData.color === colorOption.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormData({ ...formData, color: colorOption.value })}
                  className="h-10"
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full ${colorOption.class}`}>
                      <IconComponent className="w-full h-full" />
                    </div>
                    <span>{colorOption.label}</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What kind of recipes go in this collection?"
              rows={2}
            />
          </div>

          {/* Default Collection */}
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
              Set as default collection
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editCollection ? "Update" : "Create Collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


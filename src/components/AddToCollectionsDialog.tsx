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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { RecipeCollection } from "@/types";
import { Folder, Star, Heart, Zap, Pizza, Clock, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

const ICON_MAP: Record<string, any> = {
  folder: Folder,
  star: Star,
  heart: Heart,
  zap: Zap,
  pizza: Pizza,
  clock: Clock,
  users: Users,
  sparkles: Sparkles,
};

const COLOR_CLASS_MAP: Record<string, string> = {
  primary: "text-primary",
  green: "text-green-600",
  red: "text-red-600",
  yellow: "text-yellow-600",
  purple: "text-purple-600",
  pink: "text-pink-600",
  orange: "text-orange-600",
  gray: "text-gray-600",
};

interface AddToCollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeName: string;
  collections: RecipeCollection[];
  currentCollectionIds: string[];
  onCollectionsUpdated?: () => void;
}

export function AddToCollectionsDialog({
  open,
  onOpenChange,
  recipeId,
  recipeName,
  collections,
  currentCollectionIds,
  onCollectionsUpdated,
}: AddToCollectionsDialogProps) {
  const [selectedCollections, setSelectedCollections] = useState<string[]>(currentCollectionIds);
  const [saving, setSaving] = useState(false);

  const handleToggleCollection = (collectionId: string) => {
    setSelectedCollections(prev => {
      if (prev.includes(collectionId)) {
        return prev.filter(id => id !== collectionId);
      } else {
        return [...prev, collectionId];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Find which collections to add and remove
      const collectionsToAdd = selectedCollections.filter(id => !currentCollectionIds.includes(id));
      const collectionsToRemove = currentCollectionIds.filter(id => !selectedCollections.includes(id));

      // Add to new collections
      if (collectionsToAdd.length > 0) {
        const { error: insertError } = await supabase
          .from('recipe_collection_items')
          .insert(
            collectionsToAdd.map(collectionId => ({
              collection_id: collectionId,
              recipe_id: recipeId,
              sort_order: 0,
            }))
          );

        if (insertError) throw insertError;
      }

      // Remove from collections
      if (collectionsToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('recipe_collection_items')
          .delete()
          .in('collection_id', collectionsToRemove)
          .eq('recipe_id', recipeId);

        if (deleteError) throw deleteError;
      }

      toast.success("Collections updated!");
      if (onCollectionsUpdated) {
        onCollectionsUpdated();
      }
      onOpenChange(false);
    } catch (error) {
      logger.error('Error updating collections:', error);
      toast.error("Failed to update collections");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add to Collections</DialogTitle>
          <DialogDescription>
            Choose which collections "{recipeName}" should be in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {collections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No collections yet.</p>
              <p className="text-sm mt-2">Create a collection first to organize your recipes.</p>
            </div>
          ) : (
            collections.map((collection) => {
              const Icon = collection.icon ? ICON_MAP[collection.icon] || Folder : Folder;
              const colorClass = collection.color ? COLOR_CLASS_MAP[collection.color] || "text-primary" : "text-primary";
              const isSelected = selectedCollections.includes(collection.id);

              return (
                <div
                  key={collection.id}
                  className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => handleToggleCollection(collection.id)}
                >
                  <Checkbox
                    id={collection.id}
                    checked={isSelected}
                    onCheckedChange={() => handleToggleCollection(collection.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Icon className={`h-5 w-5 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={collection.id}
                      className="font-medium cursor-pointer"
                    >
                      {collection.name}
                    </Label>
                    {collection.description && (
                      <p className="text-sm text-muted-foreground truncate">
                        {collection.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || collections.length === 0}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


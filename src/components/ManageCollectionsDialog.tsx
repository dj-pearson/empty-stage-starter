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
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { RecipeCollection } from "@/types";
import { Folder, Edit, Trash2, GripVertical, Star, Heart, Zap, Pizza, Clock, Users, Sparkles } from "lucide-react";
import { toast } from "sonner";

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

interface ManageCollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string;
  onEditCollection: (collection: RecipeCollection) => void;
  recipeCountsByCollection?: Record<string, number>;
}

export function ManageCollectionsDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  onEditCollection,
  recipeCountsByCollection = {},
}: ManageCollectionsDialogProps) {
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<RecipeCollection | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      loadCollections();
    }
  }, [open, userId, householdId]);

  const loadCollections = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('recipe_collections')
        .select('*')
        .or(`user_id.eq.${userId}${householdId ? `,household_id.eq.${householdId}` : ''}`)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;

      setCollections(data as unknown as RecipeCollection[] || []);
    } catch (error) {
      console.error('Error loading collections:', error);
      toast.error("Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!collectionToDelete) return;

    setDeleting(true);
    try {
      // First, check if there are any recipes in this collection
      const { data: items, error: itemsError } = await supabase
        .from('recipe_collection_items')
        .select('id')
        .eq('collection_id', collectionToDelete.id)
        .limit(1);

      if (itemsError) throw itemsError;

      if (items && items.length > 0) {
        // Delete all items in the collection first
        const { error: deleteItemsError } = await supabase
          .from('recipe_collection_items')
          .delete()
          .eq('collection_id', collectionToDelete.id);

        if (deleteItemsError) throw deleteItemsError;
      }

      // Now delete the collection
      const { error } = await supabase
        .from('recipe_collections')
        .delete()
        .eq('id', collectionToDelete.id);

      if (error) throw error;

      toast.success(`Collection "${collectionToDelete.name}" deleted`);
      setCollections(prev => prev.filter(c => c.id !== collectionToDelete.id));
      setDeleteDialogOpen(false);
      setCollectionToDelete(null);
    } catch (error) {
      console.error('Error deleting collection:', error);
      toast.error("Failed to delete collection");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = (collection: RecipeCollection) => {
    setCollectionToDelete(collection);
    setDeleteDialogOpen(true);
  };

  const handleEdit = (collection: RecipeCollection) => {
    onEditCollection(collection);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Manage Recipe Collections</DialogTitle>
            <DialogDescription>
              Edit or delete your recipe collections. Deleting a collection won't delete the recipes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading collections...
              </div>
            ) : collections.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No collections yet. Create one to get started!
              </div>
            ) : (
              collections.map((collection) => {
                const Icon = collection.icon ? ICON_MAP[collection.icon] || Folder : Folder;
                const colorClass = collection.color ? COLOR_CLASS_MAP[collection.color] || "text-primary" : "text-primary";
                const count = recipeCountsByCollection[collection.id] || 0;

                return (
                  <div
                    key={collection.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                    
                    <Icon className={`h-5 w-5 ${colorClass}`} />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{collection.name}</span>
                        {collection.is_default && (
                          <Badge variant="secondary" className="text-xs">Default</Badge>
                        )}
                        {count > 0 && (
                          <Badge variant="outline" className="text-xs">{count}</Badge>
                        )}
                      </div>
                      {collection.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {collection.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(collection)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => confirmDelete(collection)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the collection "{collectionToDelete?.name}"?
              {recipeCountsByCollection[collectionToDelete?.id || ''] > 0 && (
                <span className="block mt-2 font-medium">
                  This collection has {recipeCountsByCollection[collectionToDelete?.id || '']} recipe(s).
                  The recipes will not be deleted, only removed from this collection.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


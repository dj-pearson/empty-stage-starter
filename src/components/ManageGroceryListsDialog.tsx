import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { toast } from "sonner";
import { GroceryList } from "@/types";
import { Trash2, Archive, Star, StarOff, ArchiveRestore } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ManageGroceryListsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string;
  currentListId?: string | null;
  onListDeleted?: (listId: string) => void;
}

export function ManageGroceryListsDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  currentListId,
  onListDeleted,
}: ManageGroceryListsDialogProps) {
  const [lists, setLists] = useState<GroceryList[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (open) {
      loadLists();
    }
  }, [open, userId, householdId, showArchived]);

  const loadLists = async () => {
    setLoading(true);
    try {
      const query = supabase
        .from('grocery_lists')
        .select('*')
        .eq('is_archived', showArchived)
        .order('is_default', { ascending: false })
        .order('name');

      if (householdId) {
        query.or(`user_id.eq.${userId},household_id.eq.${householdId}`);
      } else {
        query.eq('user_id', userId);
      }

      const { data, error } = await query;

      if (!error && data) {
        setLists(data as unknown as GroceryList[]);
      }
    } catch (err) {
      console.error('Error loading lists:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (listId: string) => {
    try {
      // Unset all defaults first
      await supabase
        .from('grocery_lists')
        .update({ is_default: false })
        .eq('user_id', userId);

      // Set new default
      const { error } = await supabase
        .from('grocery_lists')
        .update({ is_default: true })
        .eq('id', listId);

      if (error) throw error;

      toast.success("Default list updated");
      loadLists();
    } catch (error) {
      console.error('Error setting default:', error);
      toast.error("Failed to set default list");
    }
  };

  const handleArchive = async (listId: string, archive: boolean) => {
    if (listId === currentListId) {
      toast.error("Cannot archive the currently active list");
      return;
    }

    try {
      const { error } = await supabase
        .from('grocery_lists')
        .update({ is_archived: archive })
        .eq('id', listId);

      if (error) throw error;

      toast.success(archive ? "List archived" : "List restored");
      loadLists();
    } catch (error) {
      console.error('Error archiving list:', error);
      toast.error(archive ? "Failed to archive list" : "Failed to restore list");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    if (deleteId === currentListId) {
      toast.error("Cannot delete the currently active list");
      setDeleteId(null);
      return;
    }

    try {
      // Delete all items in the list first
      await supabase.from('grocery_items').delete().eq('grocery_list_id', deleteId);

      // Delete the list
      const { error } = await supabase.from('grocery_lists').delete().eq('id', deleteId);

      if (error) throw error;

      toast.success("List deleted");
      if (onListDeleted) onListDeleted(deleteId);
      setDeleteId(null);
      loadLists();
    } catch (error) {
      console.error('Error deleting list:', error);
      toast.error("Failed to delete list");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Grocery Lists</DialogTitle>
            <DialogDescription>
              Organize, archive, or delete your grocery lists.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Toggle archived */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
              >
                {showArchived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4 mr-2" />
                    Show Active Lists
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2" />
                    Show Archived
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                {lists.length} {showArchived ? "archived" : "active"} list{lists.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Lists */}
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : lists.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">
                    {showArchived
                      ? "No archived lists"
                      : "No active lists. Create one to get started!"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {lists.map((list) => (
                  <Card
                    key={list.id}
                    className={list.id === currentListId ? "border-primary" : ""}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {list.icon && <span className="text-xl">{list.icon}</span>}
                            <h4 className="font-medium">{list.name}</h4>
                            {list.is_default && (
                              <Badge variant="default" className="text-xs">
                                Default
                              </Badge>
                            )}
                            {list.id === currentListId && (
                              <Badge variant="outline" className="text-xs">
                                Active
                              </Badge>
                            )}
                          </div>
                          {list.description && (
                            <p className="text-sm text-muted-foreground">
                              {list.description}
                            </p>
                          )}
                          {list.store_name && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Store: {list.store_name}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-1">
                          {!showArchived && !list.is_default && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSetDefault(list.id)}
                              title="Set as default"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          {!showArchived ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchive(list.id, true)}
                              title="Archive"
                              disabled={list.id === currentListId}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleArchive(list.id, false)}
                              title="Restore"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(list.id)}
                            title="Delete"
                            disabled={list.id === currentListId}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this list and all items in it. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


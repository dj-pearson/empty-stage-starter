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
import { toast } from "sonner";
import { Store, MapPin, Edit, Trash2, List, GripVertical, Plus, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";

interface StoreLayout {
  id: string;
  user_id: string;
  household_id: string | null;
  store_name: string;
  store_chain: string | null;
  store_location: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface ManageStoreLayoutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string;
  onEditStore: (store: StoreLayout) => void;
  onManageAisles: (store: StoreLayout) => void;
}

export function ManageStoreLayoutsDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  onEditStore,
  onManageAisles,
}: ManageStoreLayoutsDialogProps) {
  const [stores, setStores] = useState<StoreLayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<StoreLayout | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [aisleCounts, setAisleCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open) {
      loadStores();
    }
  }, [open, userId, householdId]);

  const loadStores = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('store_layouts')
        .select('*')
        .or(`user_id.eq.${userId}${householdId ? `,household_id.eq.${householdId}` : ''}`)
        .order('store_name', { ascending: true });

      if (error) throw error;

      setStores(data as unknown as StoreLayout[] || []);
      
      // Load aisle counts for each store
      if (data && data.length > 0) {
        loadAisleCounts(data.map(s => s.id));
      }
    } catch (error) {
      console.error('Error loading stores:', error);
      toast.error("Failed to load stores");
    } finally {
      setLoading(false);
    }
  };

  const loadAisleCounts = async (storeIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from('store_aisles')
        .select('store_layout_id')
        .in('store_layout_id', storeIds);

      if (error) throw error;

      // Count aisles per store
      const counts: Record<string, number> = {};
      data?.forEach((aisle: any) => {
        counts[aisle.store_layout_id] = (counts[aisle.store_layout_id] || 0) + 1;
      });

      setAisleCounts(counts);
    } catch (error) {
      console.error('Error loading aisle counts:', error);
    }
  };

  const handleDelete = async () => {
    if (!storeToDelete) return;

    setDeleting(true);
    try {
      // First, delete all aisles for this store
      const { error: aislesError } = await supabase
        .from('store_aisles')
        .delete()
        .eq('store_layout_id', storeToDelete.id);

      if (aislesError) throw aislesError;

      // Now delete the store
      const { error } = await supabase
        .from('store_layouts')
        .delete()
        .eq('id', storeToDelete.id);

      if (error) throw error;

      toast.success(`Store "${storeToDelete.store_name}" deleted`);
      setStores(prev => prev.filter(s => s.id !== storeToDelete.id));
      setDeleteDialogOpen(false);
      setStoreToDelete(null);
    } catch (error) {
      console.error('Error deleting store:', error);
      toast.error("Failed to delete store");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = (store: StoreLayout) => {
    setStoreToDelete(store);
    setDeleteDialogOpen(true);
  };

  const handleEdit = (store: StoreLayout) => {
    onEditStore(store);
  };

  const handleManageAisles = (store: StoreLayout) => {
    onManageAisles(store);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Manage Store Layouts</span>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onEditStore(null as any);
                }}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Store
              </Button>
            </DialogTitle>
            <DialogDescription>
              Create custom store layouts and organize aisles for optimized shopping.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[500px]">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Loading stores...</p>
              </div>
            ) : stores.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Store className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No store layouts yet.</p>
                <p className="text-sm mt-2">Create a store layout to organize your shopping.</p>
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {stores.map((store) => {
                  const aisleCount = aisleCounts[store.id] || 0;

                  return (
                    <Card key={store.id} className="hover:bg-accent/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Store className="h-6 w-6 text-primary mt-1 shrink-0" />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold">{store.store_name}</h4>
                              {store.is_default && (
                                <Badge variant="secondary" className="text-xs">Default</Badge>
                              )}
                            </div>
                            
                            {store.store_location && (
                              <div className="flex items-start gap-1 text-sm text-muted-foreground mb-2">
                                <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                <span className="line-clamp-2">{store.store_location}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs">
                                {aisleCount} {aisleCount === 1 ? 'aisle' : 'aisles'}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex flex-col gap-1 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleManageAisles(store)}
                              className="h-8"
                            >
                              <List className="h-4 w-4 mr-1" />
                              Aisles
                            </Button>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(store)}
                                className="h-8 w-8 p-0"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => confirmDelete(store)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Store Layout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{storeToDelete?.store_name}"?
              {aisleCounts[storeToDelete?.id || ''] > 0 && (
                <span className="block mt-2 font-medium">
                  This will also delete {aisleCounts[storeToDelete?.id || '']} aisle(s) and all food mappings.
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


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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, GripVertical, Edit, Trash2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface StoreAisle {
  id: string;
  store_layout_id: string;
  aisle_number: string | null;
  aisle_name: string;
  sort_order: number;
  created_at: string;
}

interface ManageStoreAislesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeLayout: StoreLayout;
}

export function ManageStoreAislesDialog({
  open,
  onOpenChange,
  storeLayout,
}: ManageStoreAislesDialogProps) {
  const [aisles, setAisles] = useState<StoreAisle[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAisleName, setNewAisleName] = useState("");
  const [newAisleNumber, setNewAisleNumber] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [aisleToDelete, setAisleToDelete] = useState<StoreAisle | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      loadAisles();
    }
  }, [open, storeLayout.id]);

  const loadAisles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('store_aisles')
        .select('*')
        .eq('store_layout_id', storeLayout.id)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setAisles(data as unknown as StoreAisle[] || []);
    } catch (error) {
      console.error('Error loading aisles:', error);
      toast.error("Failed to load aisles");
    } finally {
      setLoading(false);
    }
  };

  const handleAddAisle = async () => {
    if (!newAisleName.trim()) {
      toast.error("Please enter an aisle name");
      return;
    }

    setAdding(true);
    try {
      const maxSortOrder = aisles.length > 0 
        ? Math.max(...aisles.map(a => a.sort_order))
        : 0;

      const { data, error } = await supabase
        .from('store_aisles')
        .insert([
          {
            store_layout_id: storeLayout.id,
            aisle_name: newAisleName.trim(),
            aisle_number: newAisleNumber.trim() || null,
            sort_order: maxSortOrder + 1,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      toast.success(`Aisle "${newAisleName}" added!`);
      setAisles([...aisles, data as unknown as StoreAisle]);
      setNewAisleName("");
      setNewAisleNumber("");
    } catch (error) {
      console.error('Error adding aisle:', error);
      toast.error("Failed to add aisle");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!aisleToDelete) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('store_aisles')
        .delete()
        .eq('id', aisleToDelete.id);

      if (error) throw error;

      toast.success(`Aisle "${aisleToDelete.aisle_name}" deleted`);
      setAisles(prev => prev.filter(a => a.id !== aisleToDelete.id));
      setDeleteDialogOpen(false);
      setAisleToDelete(null);
    } catch (error) {
      console.error('Error deleting aisle:', error);
      toast.error("Failed to delete aisle");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = (aisle: StoreAisle) => {
    setAisleToDelete(aisle);
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Manage Aisles - {storeLayout.store_name}</DialogTitle>
            <DialogDescription>
              Create and organize aisles for this store. You can then map foods to aisles for optimized shopping.
            </DialogDescription>
          </DialogHeader>

          {/* Add New Aisle Form */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <Label htmlFor="aisle-name" className="sr-only">Aisle Name</Label>
                  <Input
                    id="aisle-name"
                    placeholder="Aisle name (e.g., Produce, Dairy)"
                    value={newAisleName}
                    onChange={(e) => setNewAisleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddAisle();
                      }
                    }}
                  />
                </div>
                <div className="w-32">
                  <Label htmlFor="aisle-number" className="sr-only">Aisle Number</Label>
                  <Input
                    id="aisle-number"
                    placeholder="# (optional)"
                    value={newAisleNumber}
                    onChange={(e) => setNewAisleNumber(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddAisle();
                      }
                    }}
                  />
                </div>
                <Button onClick={handleAddAisle} disabled={adding || !newAisleName.trim()}>
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {adding ? "Adding..." : "Add"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Aisles List */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Store Aisles ({aisles.length})</Label>
            <ScrollArea className="max-h-[400px]">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p>Loading aisles...</p>
                </div>
              ) : aisles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No aisles yet.</p>
                  <p className="text-sm mt-2">Add aisles to organize your shopping trips.</p>
                </div>
              ) : (
                <div className="space-y-2 pr-4">
                  {aisles.map((aisle, index) => (
                    <div
                      key={aisle.id}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      
                      <Badge variant="outline" className="w-12 justify-center">
                        {aisle.aisle_number || index + 1}
                      </Badge>
                      
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{aisle.aisle_name}</span>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => confirmDelete(aisle)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
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
            <AlertDialogTitle>Delete Aisle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the aisle "{aisleToDelete?.aisle_name}"?
              This will remove all food-to-aisle mappings for this aisle.
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


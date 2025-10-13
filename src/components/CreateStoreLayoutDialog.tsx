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
import { Store, MapPin } from "lucide-react";

interface StoreLayout {
  id: string;
  user_id: string;
  household_id: string | null;
  name: string;
  address: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface CreateStoreLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string;
  editStore?: StoreLayout | null;
  onStoreCreated?: (store: StoreLayout) => void;
}

export function CreateStoreLayoutDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  editStore,
  onStoreCreated,
}: CreateStoreLayoutDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    is_default: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editStore) {
      setFormData({
        name: editStore.name,
        address: editStore.address || "",
        is_default: editStore.is_default,
      });
    } else {
      setFormData({
        name: "",
        address: "",
        is_default: false,
      });
    }
  }, [editStore, open]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a store name");
      return;
    }

    setSaving(true);
    try {
      if (editStore) {
        // Update existing store
        const { data, error } = await supabase
          .from('store_layouts')
          .update({
            name: formData.name.trim(),
            address: formData.address.trim() || null,
            is_default: formData.is_default,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editStore.id)
          .select()
          .single();

        if (error) throw error;

        toast.success(`Store "${formData.name}" updated!`);
        if (onStoreCreated && data) {
          onStoreCreated(data as unknown as StoreLayout);
        }
      } else {
        // Create new store
        const { data, error } = await supabase
          .from('store_layouts')
          .insert([
            {
              user_id: userId,
              household_id: householdId,
              name: formData.name.trim(),
              address: formData.address.trim() || null,
              is_default: formData.is_default,
            },
          ])
          .select()
          .single();

        if (error) throw error;

        toast.success(`Store "${formData.name}" created!`);
        if (onStoreCreated && data) {
          onStoreCreated(data as unknown as StoreLayout);
        }
      }

      handleClose();
    } catch (error) {
      console.error('Error saving store:', error);
      toast.error(editStore ? "Failed to update store" : "Failed to create store");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editStore ? "Edit Store Layout" : "Create Store Layout"}
          </DialogTitle>
          <DialogDescription>
            Organize your grocery aisles for efficient shopping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Store Name *</Label>
            <div className="relative">
              <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Costco, Whole Foods, Kroger"
                className="pl-10"
                required
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">Address (optional)</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Main St, City, State"
                className="pl-10 resize-none"
                rows={2}
              />
            </div>
          </div>

          {/* Default Store */}
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
              Set as default store
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : editStore ? "Update" : "Create Store"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


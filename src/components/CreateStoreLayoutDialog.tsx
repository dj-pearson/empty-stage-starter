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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Store, MapPin } from "lucide-react";
import { logger } from "@/lib/logger";
import { storeDisplayName, type StoreLayoutInsert, type StoreLayoutRow } from "@/lib/storeLayouts";
import "@/i18n/appLocale";

interface CreateStoreLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /**
   * Required to create: a store with no household is invisible to the
   * co-parent and, with user_id set, is not a catalog chain either.
   */
  householdId: string | null | undefined;
  /** Edit this store instead of creating one. */
  editStore?: StoreLayoutRow | null;
  /**
   * The saved row. After a create the page selects it for the list and opens
   * the aisles dialog, where "Start from a typical store" is offered.
   */
  onStoreCreated?: (store: StoreLayoutRow, created: boolean) => void;
}

export function CreateStoreLayoutDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  editStore,
  onStoreCreated,
}: CreateStoreLayoutDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editStore ? storeDisplayName(editStore) : "");
    setAddress(editStore?.store_location ?? "");
  }, [editStore, open]);

  const canCreate = Boolean(householdId);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("grocery.stores.create.nameRequired", "Give the store a name"));
      return;
    }

    setSaving(true);
    try {
      if (editStore) {
        const { data, error } = await supabase
          .from("store_layouts")
          .update({
            name: trimmed,
            store_name: trimmed,
            store_location: address.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editStore.id)
          .select()
          .single();
        if (error) throw error;

        toast.success(t("grocery.stores.create.updated", { defaultValue: "{{name}} updated", name: trimmed }));
        onStoreCreated?.(data, false);
      } else {
        if (!householdId) return;
        // Both name columns: iOS reads `name`, the web wrote `store_name`, and
        // the sync trigger only fills a null one.
        const row: StoreLayoutInsert = {
          user_id: userId,
          household_id: householdId,
          name: trimmed,
          store_name: trimmed,
          store_location: address.trim() || null,
        };
        const { data, error } = await supabase.from("store_layouts").insert(row).select().single();
        if (error) throw error;

        toast.success(t("grocery.stores.create.created", { defaultValue: "{{name}} added", name: trimmed }));
        onStoreCreated?.(data, true);
      }
      onOpenChange(false);
    } catch (error) {
      logger.error("Error saving store:", error);
      toast.error(
        editStore
          ? t("grocery.stores.create.updateFailed", "Couldn't save the store")
          : t("grocery.stores.create.createFailed", "Couldn't add the store"),
      );
    } finally {
      setSaving(false);
    }
  };

  const submitDisabled = saving || (!editStore && !canCreate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editStore
              ? t("grocery.stores.create.editTitle", { defaultValue: "Edit {{name}}", name: storeDisplayName(editStore) })
              : t("grocery.stores.create.title", "Add a store")}
          </DialogTitle>
          <DialogDescription>
            {t("grocery.stores.create.description", "Set up its aisles once and the list sorts itself in the order you walk.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitDisabled) void handleSave();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="store-layout-name">{t("grocery.stores.create.nameLabel", "Store name")}</Label>
            <div className="relative">
              <Store className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="store-layout-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("grocery.stores.create.namePlaceholder", "e.g. Kroger on Main St")}
                className="h-11 pl-10"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-layout-address">{t("grocery.stores.create.addressLabel", "Address (optional)")}</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Textarea
                id="store-layout-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("grocery.stores.create.addressPlaceholder", "123 Main St, City")}
                className="resize-none pl-10"
                rows={2}
              />
            </div>
          </div>

          {!editStore && !canCreate && (
            <p className="text-sm text-muted-foreground" role="status">
              {t("grocery.stores.create.needsHousehold", "Your household is still loading. Try again in a moment.")}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("grocery.lists.common.cancel", "Cancel")}
            </Button>
            <Button type="submit" className="h-11" disabled={submitDisabled}>
              {saving
                ? t("grocery.stores.create.saving", "Saving...")
                : editStore
                  ? t("grocery.stores.create.save", "Save")
                  : t("grocery.stores.create.submit", "Add store")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

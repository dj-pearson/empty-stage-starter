import { useState, useEffect, useCallback } from "react";
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
import { assertUUID } from "@/lib/query-sanitize";
import { toast } from "sonner";
import { Store, MapPin, Edit, Trash2, List, Plus, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { logger } from "@/lib/logger";
import {
  isCatalogStore,
  storeDisplayName,
  type StoreLayoutRow,
} from "@/lib/storeLayouts";

interface ManageStoreLayoutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId: string | null | undefined;
  onCreateStore: () => void;
  onEditStore: (store: StoreLayoutRow) => void;
  onManageAisles: (store: StoreLayoutRow) => void;
  /** useStoreLayouts().refresh, after a delete. */
  onStoresChanged?: () => void;
}

type StoreWithCount = StoreLayoutRow & { aisleCount: number };

export function ManageStoreLayoutsDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  onCreateStore,
  onEditStore,
  onManageAisles,
  onStoresChanged,
}: ManageStoreLayoutsDialogProps) {
  const { t } = useTranslation();
  const [stores, setStores] = useState<StoreWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeToDelete, setStoreToDelete] = useState<StoreWithCount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      // One request: the stores, the shared chains and an aisle count each.
      let query = supabase.from("store_layouts").select("*, store_aisles(id)");
      query = householdId
        ? query.or(`household_id.is.null,household_id.eq.${assertUUID(householdId, "householdId")}`)
        : query.or(`household_id.is.null,user_id.eq.${assertUUID(userId, "userId")}`);
      const { data, error } = await query;
      if (error) throw error;

      const rows: StoreWithCount[] = (data ?? []).map(({ store_aisles, ...row }) => ({
        ...row,
        aisleCount: store_aisles?.length ?? 0,
      }));
      rows.sort((a, b) => {
        const ac = isCatalogStore(a);
        const bc = isCatalogStore(b);
        if (ac !== bc) return ac ? 1 : -1;
        return storeDisplayName(a).localeCompare(storeDisplayName(b));
      });
      setStores(rows);
    } catch (error) {
      logger.error("Error loading stores:", error);
      toast.error(t("grocery.stores.manage.loadFailed", "Couldn't load your stores"));
    } finally {
      setLoading(false);
    }
  }, [householdId, t, userId]);

  useEffect(() => {
    if (open) void loadStores();
  }, [open, loadStores]);

  const handleDelete = async () => {
    const store = storeToDelete;
    if (!store) return;
    setDeleting(true);
    try {
      // store_aisles cascades with the layout, and grocery_lists.store_layout_id
      // is SET NULL, so lists walking this store fall back to the typical order.
      const { data, error } = await supabase.from("store_layouts").delete().eq("id", store.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No store deleted");

      toast.success(t("grocery.stores.manage.deleted", { defaultValue: "{{name}} deleted", name: storeDisplayName(store) }));
      setStores((prev) => prev.filter((s) => s.id !== store.id));
      setStoreToDelete(null);
      onStoresChanged?.();
    } catch (error) {
      logger.error("Error deleting store:", error);
      toast.error(t("grocery.stores.manage.deleteFailed", "Couldn't delete the store"));
    } finally {
      setDeleting(false);
    }
  };

  const own = stores.filter((s) => !isCatalogStore(s));
  const chains = stores.filter(isCatalogStore);

  const renderStore = (store: StoreWithCount) => {
    const name = storeDisplayName(store);
    const readOnly = isCatalogStore(store);
    return (
      <li key={store.id} className="flex items-start gap-3 rounded-xl border p-3">
        <Store className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{name}</p>
          {store.store_location && (
            <p className="mt-0.5 flex items-start gap-1 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{store.store_location}</span>
            </p>
          )}
          {!readOnly && (
            <Badge variant="outline" className="mt-1 text-xs">
              {t("grocery.stores.manage.aisleCount", { defaultValue: "{{count}} aisles", count: store.aisleCount })}
            </Badge>
          )}
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => onManageAisles(store)}
              aria-label={t("grocery.stores.manage.aislesFor", { defaultValue: "Aisles for {{name}}", name })}
            >
              <List className="mr-1 h-4 w-4" aria-hidden="true" />
              {t("grocery.stores.manage.aisles", "Aisles")}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={() => onEditStore(store)}
              aria-label={t("grocery.stores.manage.editFor", { defaultValue: "Edit {{name}}", name })}
            >
              <Edit className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 text-destructive hover:text-destructive"
              onClick={() => setStoreToDelete(store)}
              aria-label={t("grocery.stores.manage.deleteFor", { defaultValue: "Delete {{name}}", name })}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t("grocery.stores.manage.title", "Stores")}</DialogTitle>
            <DialogDescription>
              {t("grocery.stores.manage.description", "Add the stores you shop at and set their aisle order.")}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh]">
            {loading ? (
              <div className="py-12 text-center text-muted-foreground" role="status">
                <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin" aria-hidden="true" />
                <p>{t("grocery.stores.manage.loading", "Loading stores...")}</p>
              </div>
            ) : (
              <div className="space-y-4 pr-3">
                <section className="space-y-2">
                  <h3 className="text-sm font-medium">{t("grocery.stores.picker.yourStores", "Your stores")}</h3>
                  {own.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("grocery.stores.manage.emptyOwn", "None yet. Add the store you shop at most.")}
                    </p>
                  ) : (
                    <ul className="space-y-2">{own.map(renderStore)}</ul>
                  )}
                </section>
                {chains.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-medium">{t("grocery.stores.picker.commonChains", "Common chains")}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t("grocery.stores.manage.chainsNote", "Built in. Pick one from the Store menu on your list.")}
                    </p>
                    <ul className="space-y-2">{chains.map(renderStore)}</ul>
                  </section>
                )}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
              {t("grocery.stores.manage.done", "Done")}
            </Button>
            <Button
              className="h-11"
              disabled={!householdId}
              onClick={() => {
                onOpenChange(false);
                onCreateStore();
              }}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("grocery.stores.manage.create", "Add store")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!storeToDelete} onOpenChange={(next) => !next && !deleting && setStoreToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {storeToDelete
                ? t("grocery.stores.manage.deleteConfirm", {
                    defaultValue: "Delete {{name}}?",
                    name: storeDisplayName(storeToDelete),
                  })
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {storeToDelete && storeToDelete.aisleCount > 0
                ? t("grocery.stores.manage.deleteWarningAisles", {
                    defaultValue: "Its {{count}} aisles go with it. Lists using it switch to the typical store.",
                    count: storeToDelete.aisleCount,
                  })
                : t("grocery.stores.manage.deleteWarning", "Lists using it switch to the typical store.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("grocery.lists.common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t("grocery.lists.common.deleting", "Deleting...") : t("grocery.lists.common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

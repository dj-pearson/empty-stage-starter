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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Loader2, ArrowUp, ArrowDown, Pencil, Check, X, Store } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { logger } from "@/lib/logger";
import {
  sortAislesByWalk,
  storeDisplayName,
  type StoreAisleInsert,
  type StoreAisleRow,
  type StoreLayoutRow,
} from "@/lib/storeLayouts";
import { typicalStoreAisleNames } from "@/lib/storeWalkOrder";
import "@/i18n/appLocale";

interface ManageStoreAislesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeLayout: StoreLayoutRow;
  /** useStoreLayouts().refresh, so the list re-sorts after an edit. */
  onAislesChanged?: () => void;
}

export function ManageStoreAislesDialog({
  open,
  onOpenChange,
  storeLayout,
  onAislesChanged,
}: ManageStoreAislesDialogProps) {
  const { t } = useTranslation();
  const storeName = storeDisplayName(storeLayout);
  const [aisles, setAisles] = useState<StoreAisleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAisleName, setNewAisleName] = useState("");
  const [newAisleNumber, setNewAisleNumber] = useState("");
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [aisleToDelete, setAisleToDelete] = useState<StoreAisleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadAisles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_aisles")
        .select("*")
        .eq("store_layout_id", storeLayout.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setAisles(sortAislesByWalk(data ?? []));
    } catch (error) {
      logger.error("Error loading aisles:", error);
      toast.error(t("grocery.stores.aisles.loadFailed", "Couldn't load the aisles"));
    } finally {
      setLoading(false);
    }
  }, [storeLayout.id, t]);

  useEffect(() => {
    if (open) void loadAisles();
  }, [open, loadAisles]);

  const handleAddAisle = async () => {
    const name = newAisleName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const maxSortOrder = aisles.reduce((max, a) => Math.max(max, a.sort_order), 0);
      const row: StoreAisleInsert = {
        store_layout_id: storeLayout.id,
        aisle_name: name,
        aisle_number: newAisleNumber.trim() || null,
        sort_order: maxSortOrder + 1,
      };
      const { data, error } = await supabase.from("store_aisles").insert(row).select().single();
      if (error) throw error;

      setAisles((prev) => [...prev, data]);
      setNewAisleName("");
      setNewAisleNumber("");
      onAislesChanged?.();
    } catch (error) {
      logger.error("Error adding aisle:", error);
      toast.error(t("grocery.stores.aisles.addFailed", "Couldn't add the aisle"));
    } finally {
      setAdding(false);
    }
  };

  /** Seed an empty store with the universal aisles, already in walk order. */
  const handleSeedTypical = async () => {
    if (aisles.length > 0) return;
    setSeeding(true);
    try {
      // The canonical names, untranslated: they are what the list's aisle
      // groups are matched against (see storeWalkOrder.ts), and the user can
      // rename any of them afterwards.
      const rows: StoreAisleInsert[] = typicalStoreAisleNames().map((aisleName, i) => ({
        store_layout_id: storeLayout.id,
        aisle_name: aisleName,
        sort_order: i + 1,
      }));
      const { data, error } = await supabase.from("store_aisles").insert(rows).select();
      if (error) throw error;
      setAisles(sortAislesByWalk(data ?? []));
      onAislesChanged?.();
    } catch (error) {
      logger.error("Error seeding aisles:", error);
      toast.error(t("grocery.stores.aisles.seedFailed", "Couldn't add the typical aisles"));
    } finally {
      setSeeding(false);
    }
  };

  /**
   * Swap an aisle with its neighbour. Optimistic; on any error both rows go
   * back where they were, on screen and (best effort) on the server.
   */
  const handleMove = async (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (moving || other < 0 || other >= aisles.length) return;
    const before = aisles;
    const a = before[index];
    const b = before[other];

    // Equal sort_orders cannot be swapped into an order; renumber that pair
    // from their positions instead.
    const aOrder = a.sort_order === b.sort_order ? other + 1 : b.sort_order;
    const bOrder = a.sort_order === b.sort_order ? index + 1 : a.sort_order;

    const next = [...before];
    next[index] = { ...b, sort_order: bOrder };
    next[other] = { ...a, sort_order: aOrder };
    setAisles(next);
    setMoving(true);

    try {
      const results = await Promise.all([
        supabase.from("store_aisles").update({ sort_order: aOrder }).eq("id", a.id).select("id"),
        supabase.from("store_aisles").update({ sort_order: bOrder }).eq("id", b.id).select("id"),
      ]);
      const failed = results.find((r) => r.error || !r.data || r.data.length === 0);
      if (failed) throw failed.error ?? new Error("No aisle updated");
      onAislesChanged?.();
    } catch (error) {
      logger.error("Error reordering aisles:", error);
      setAisles(before);
      toast.error(t("grocery.stores.aisles.moveFailed", "Couldn't move the aisle"));
      void Promise.all([
        supabase.from("store_aisles").update({ sort_order: a.sort_order }).eq("id", a.id),
        supabase.from("store_aisles").update({ sort_order: b.sort_order }).eq("id", b.id),
      ]).catch((err) => logger.warn("Could not restore aisle order", err));
    } finally {
      setMoving(false);
    }
  };

  const startRename = (aisle: StoreAisleRow) => {
    setRenamingId(aisle.id);
    setRenameValue(aisle.aisle_name);
  };

  const handleRename = async (aisle: StoreAisleRow) => {
    const name = renameValue.trim();
    if (!name || name === aisle.aisle_name) {
      setRenamingId(null);
      return;
    }
    setAisles((prev) => prev.map((x) => (x.id === aisle.id ? { ...x, aisle_name: name } : x)));
    setRenamingId(null);
    try {
      const { data, error } = await supabase
        .from("store_aisles")
        .update({ aisle_name: name })
        .eq("id", aisle.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No aisle updated");
      onAislesChanged?.();
    } catch (error) {
      logger.error("Error renaming aisle:", error);
      setAisles((prev) => prev.map((x) => (x.id === aisle.id ? { ...x, aisle_name: aisle.aisle_name } : x)));
      toast.error(t("grocery.stores.aisles.renameFailed", "Couldn't rename the aisle"));
    }
  };

  const handleDelete = async () => {
    const aisle = aisleToDelete;
    if (!aisle) return;
    setDeleting(true);
    try {
      // An RLS-filtered delete returns no error and no rows; that is a failure.
      const { data, error } = await supabase.from("store_aisles").delete().eq("id", aisle.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No aisle deleted");

      setAisles((prev) => prev.filter((a) => a.id !== aisle.id));
      setAisleToDelete(null);
      onAislesChanged?.();
    } catch (error) {
      logger.error("Error deleting aisle:", error);
      toast.error(t("grocery.stores.aisles.deleteFailed", "Couldn't delete the aisle"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>
              {t("grocery.stores.aisles.title", { defaultValue: "Aisles at {{name}}", name: storeName })}
            </DialogTitle>
            <DialogDescription>
              {t("grocery.stores.aisles.description", "Put them in the order you walk. The list follows it.")}
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddAisle();
            }}
          >
            <Label htmlFor="aisle-name" className="sr-only">
              {t("grocery.stores.aisles.nameLabel", "Aisle name")}
            </Label>
            <Input
              id="aisle-name"
              className="h-11 flex-1"
              placeholder={t("grocery.stores.aisles.namePlaceholder", "Aisle name, e.g. Produce")}
              value={newAisleName}
              onChange={(e) => setNewAisleName(e.target.value)}
            />
            <Label htmlFor="aisle-number" className="sr-only">
              {t("grocery.stores.aisles.numberLabel", "Aisle number")}
            </Label>
            <Input
              id="aisle-number"
              className="h-11 sm:w-28"
              placeholder={t("grocery.stores.aisles.numberPlaceholder", "No. (optional)")}
              value={newAisleNumber}
              onChange={(e) => setNewAisleNumber(e.target.value)}
            />
            <Button type="submit" className="h-11" disabled={adding || !newAisleName.trim()}>
              {adding ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {t("grocery.stores.aisles.add", "Add")}
            </Button>
          </form>

          <ScrollArea className="max-h-[50vh]">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground" role="status">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" aria-hidden="true" />
                <p>{t("grocery.stores.aisles.loading", "Loading aisles...")}</p>
              </div>
            ) : aisles.length === 0 ? (
              <div className="space-y-3 py-6 text-center">
                <p className="text-muted-foreground">
                  {t("grocery.stores.aisles.empty", "No aisles yet. Add them one by one, or start from a typical layout and adjust.")}
                </p>
                <Button variant="outline" className="h-11" onClick={() => void handleSeedTypical()} disabled={seeding}>
                  {seeding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Store className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {t("grocery.stores.aisles.seedTypical", "Start from a typical store")}
                </Button>
              </div>
            ) : (
              <ol className="space-y-2 pr-3">
                {aisles.map((aisle, index) => {
                  const name = aisle.aisle_name;
                  const isRenaming = renamingId === aisle.id;
                  return (
                    <li key={aisle.id} className="flex items-center gap-2 rounded-xl border p-2">
                      <Badge variant="outline" className="w-10 shrink-0 justify-center">
                        {aisle.aisle_number || index + 1}
                      </Badge>

                      {isRenaming ? (
                        <form
                          className="flex min-w-0 flex-1 items-center gap-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleRename(aisle);
                          }}
                        >
                          <Input
                            className="h-11 min-w-0 flex-1"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setRenamingId(null);
                              }
                            }}
                            aria-label={t("grocery.stores.aisles.renameInput", { defaultValue: "New name for {{name}}", name })}
                            autoFocus
                          />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            aria-label={t("grocery.stores.aisles.saveName", "Save name")}
                          >
                            <Check className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => setRenamingId(null)}
                            aria-label={t("grocery.stores.aisles.cancelRename", "Cancel rename")}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </form>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => void handleMove(index, -1)}
                            disabled={moving || index === 0}
                            aria-label={t("grocery.stores.aisles.moveUp", { defaultValue: "Move {{name}} up", name })}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => void handleMove(index, 1)}
                            disabled={moving || index === aisles.length - 1}
                            aria-label={t("grocery.stores.aisles.moveDown", { defaultValue: "Move {{name}} down", name })}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11"
                            onClick={() => startRename(aisle)}
                            aria-label={t("grocery.stores.aisles.rename", { defaultValue: "Rename {{name}}", name })}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 text-destructive hover:text-destructive"
                            onClick={() => setAisleToDelete(aisle)}
                            aria-label={t("grocery.stores.aisles.delete", { defaultValue: "Delete {{name}}", name })}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button className="h-11" onClick={() => onOpenChange(false)}>
              {t("grocery.stores.manage.done", "Done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aisleToDelete} onOpenChange={(next) => !next && !deleting && setAisleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {aisleToDelete
                ? t("grocery.stores.aisles.deleteConfirm", { defaultValue: "Delete {{name}}?", name: aisleToDelete.aisle_name })
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("grocery.stores.aisles.deleteWarning", "Foods filed under it go back to unplaced for this store.")}
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

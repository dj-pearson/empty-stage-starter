import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from "@/components/ResponsiveDialog";
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
import { assertUUID } from "@/lib/query-sanitize";
import { toast } from "sonner";
import { Trash2, Archive, Star, ArchiveRestore } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { logger } from "@/lib/logger";
import type { GroceryListRow } from "@/hooks/useGroceryLists";
import "@/i18n/appLocale";

interface ManageGroceryListsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  householdId?: string | null;
  currentListId?: string | null;
  /**
   * The list and its items are gone on the server (ON DELETE CASCADE). The
   * page drops the matching local rows, e.g. via deleteGroceryItems.
   */
  onListDeleted: (listId: string) => void;
  /** useGroceryLists().refresh, called after set-default, archive and restore. */
  refresh?: () => Promise<void>;
  /** useGroceryLists().removeLocal, called after a delete. It refetches too. */
  removeLocal?: (listId: string) => void;
}

export function ManageGroceryListsDialog({
  open,
  onOpenChange,
  userId,
  householdId,
  currentListId,
  onListDeleted,
  refresh,
  removeLocal,
}: ManageGroceryListsDialogProps) {
  const { t } = useTranslation();
  const [lists, setLists] = useState<GroceryListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<GroceryListRow | null>(null);
  const [deleteItemCount, setDeleteItemCount] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("grocery_lists")
        .select("*")
        .eq("is_archived", showArchived)
        .order("is_default", { ascending: false })
        .order("name");
      query = householdId
        ? query.or(`user_id.eq.${assertUUID(userId, "userId")},household_id.eq.${assertUUID(householdId, "householdId")}`)
        : query.eq("user_id", userId);

      const { data, error } = await query;
      if (error) throw error;
      setLists(data ?? []);
    } catch (err) {
      logger.error("Error loading lists:", err);
      toast.error(t("grocery.lists.manage.loadFailed", "Couldn't load your lists"));
    } finally {
      setLoading(false);
    }
  }, [householdId, showArchived, t, userId]);

  useEffect(() => {
    if (open) void loadLists();
  }, [open, loadLists]);

  const handleSetDefault = async (list: GroceryListRow) => {
    try {
      // Household-scoped, matching how lists are shared. Clearing by user_id
      // left a co-parent's default in place and gave the household two.
      const clear = supabase.from("grocery_lists").update({ is_default: false }).eq("is_default", true);
      const { error: clearError } = householdId
        ? await clear.eq("household_id", householdId)
        : await clear.eq("user_id", userId);
      if (clearError) throw clearError;

      const { data, error } = await supabase
        .from("grocery_lists")
        .update({ is_default: true })
        .eq("id", list.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No list updated");

      toast.success(t("grocery.lists.manage.defaultSet", { defaultValue: "{{name}} is now the default", name: list.name }));
    } catch (error) {
      logger.error("Error setting default:", error);
      toast.error(t("grocery.lists.manage.defaultFailed", "Couldn't change the default list"));
    }
    void loadLists();
    void refresh?.();
  };

  const handleArchive = async (list: GroceryListRow, archive: boolean) => {
    if (list.id === currentListId) {
      toast.error(t("grocery.lists.manage.cannotArchiveActive", "Switch to another list before archiving this one"));
      return;
    }
    try {
      const { data, error } = await supabase
        .from("grocery_lists")
        .update({ is_archived: archive })
        .eq("id", list.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No list updated");

      toast.success(
        archive
          ? t("grocery.lists.manage.archived", { defaultValue: "{{name}} archived", name: list.name })
          : t("grocery.lists.manage.restored", { defaultValue: "{{name}} restored", name: list.name }),
      );
    } catch (error) {
      logger.error("Error archiving list:", error);
      toast.error(
        archive
          ? t("grocery.lists.manage.archiveFailed", "Couldn't archive the list")
          : t("grocery.lists.manage.restoreFailed", "Couldn't restore the list"),
      );
    }
    void loadLists();
    void refresh?.();
  };

  const askDelete = async (list: GroceryListRow) => {
    setToDelete(list);
    setDeleteItemCount(null);
    try {
      const { count, error } = await supabase
        .from("grocery_items")
        .select("id", { count: "exact", head: true })
        .eq("grocery_list_id", list.id);
      if (!error && typeof count === "number") setDeleteItemCount(count);
    } catch (err) {
      logger.warn("Could not count list items", err);
    }
  };

  const handleDelete = async () => {
    const list = toDelete;
    if (!list) return;
    if (list.id === currentListId) {
      toast.error(t("grocery.lists.manage.cannotDeleteActive", "Switch to another list before deleting this one"));
      setToDelete(null);
      return;
    }

    setDeleting(true);
    try {
      // grocery_items.grocery_list_id is ON DELETE CASCADE, so the items go
      // with the list in one statement. .select() so an RLS-filtered delete
      // (zero rows, no error) is reported instead of toasted as a success.
      const { data, error } = await supabase.from("grocery_lists").delete().eq("id", list.id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No list deleted");

      toast.success(t("grocery.lists.manage.deleted", { defaultValue: "{{name}} deleted", name: list.name }));
      onListDeleted(list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      if (removeLocal) removeLocal(list.id);
      else void refresh?.();
      setToDelete(null);
    } catch (error) {
      logger.error("Error deleting list:", error);
      toast.error(t("grocery.lists.manage.deleteFailed", "Couldn't delete the list"));
    } finally {
      setDeleting(false);
    }
  };

  const confirmTitle = toDelete
    ? deleteItemCount && deleteItemCount > 0
      ? t("grocery.lists.manage.deleteConfirmWithItems", {
          defaultValue: "Delete {{name}} and its {{count}} items?",
          name: toDelete.name,
          count: deleteItemCount,
        })
      : t("grocery.lists.manage.deleteConfirm", { defaultValue: "Delete {{name}}?", name: toDelete.name })
    : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("grocery.lists.manage.title", "Manage lists")}</DialogTitle>
            <DialogDescription>
              {t("grocery.lists.manage.description", "Pick the default list, archive old ones, or delete them.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" className="h-11" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? (
                  <>
                    <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("grocery.lists.manage.showActive", "Show active lists")}
                  </>
                ) : (
                  <>
                    <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("grocery.lists.manage.showArchived", "Show archived")}
                  </>
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                {showArchived
                  ? t("grocery.lists.manage.archivedCount", { defaultValue: "{{count}} archived", count: lists.length })
                  : t("grocery.lists.manage.activeCount", { defaultValue: "{{count}} active", count: lists.length })}
              </p>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : lists.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                {showArchived
                  ? t("grocery.lists.manage.emptyArchived", "No archived lists")
                  : t("grocery.lists.manage.emptyActive", "No lists yet")}
              </p>
            ) : (
              <div className="space-y-2">
                {lists.map((list) => {
                  const isCurrent = list.id === currentListId;
                  return (
                    <Card key={list.id} className={isCurrent ? "border-primary" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              {list.icon && (
                                <span className="text-xl" aria-hidden="true">
                                  {list.icon}
                                </span>
                              )}
                              <h4 className="font-medium">{list.name}</h4>
                              {list.is_default && (
                                <Badge variant="default" className="text-xs">
                                  {t("grocery.lists.manage.defaultBadge", "Default")}
                                </Badge>
                              )}
                              {isCurrent && (
                                <Badge variant="outline" className="text-xs">
                                  {t("grocery.lists.manage.openBadge", "Open")}
                                </Badge>
                              )}
                            </div>
                            {list.description && <p className="text-sm text-muted-foreground">{list.description}</p>}
                            {list.store_name && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("grocery.lists.manage.store", { defaultValue: "Store: {{name}}", name: list.store_name })}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 gap-1">
                            {!showArchived && !list.is_default && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() => void handleSetDefault(list)}
                                aria-label={t("grocery.lists.manage.setDefaultFor", {
                                  defaultValue: "Make {{name}} the default",
                                  name: list.name,
                                })}
                              >
                                <Star className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                            {!showArchived ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() => void handleArchive(list, true)}
                                aria-label={t("grocery.lists.manage.archiveFor", {
                                  defaultValue: "Archive {{name}}",
                                  name: list.name,
                                })}
                                disabled={isCurrent}
                              >
                                <Archive className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-11 w-11"
                                onClick={() => void handleArchive(list, false)}
                                aria-label={t("grocery.lists.manage.restoreFor", {
                                  defaultValue: "Restore {{name}}",
                                  name: list.name,
                                })}
                              >
                                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11"
                              onClick={() => void askDelete(list)}
                              aria-label={t("grocery.lists.manage.deleteFor", {
                                defaultValue: "Delete {{name}}",
                                name: list.name,
                              })}
                              disabled={isCurrent}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(next) => !next && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("grocery.lists.manage.deleteWarning", "This can't be undone, on this phone or anyone else's.")}
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

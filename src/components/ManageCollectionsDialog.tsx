import { useTranslation } from "react-i18next";
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
import type { RecipeCollection } from "@/types";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { collectionIcon, collectionTone } from "@/lib/collectionAppearance";
import "@/i18n/appLocale";

/** What a delete hands back so it can be undone (useRecipeCollections.remove). */
export interface DeletedCollectionSnapshot {
  collection: RecipeCollection;
  recipeIds: string[];
  undo: () => Promise<boolean> | void;
}

interface ManageCollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: RecipeCollection[];
  counts?: Record<string, number>;
  /**
   * Delete right away (optimistic). Return the snapshot and the dialog offers
   * Undo in a toast; return null when the delete failed.
   */
  onDelete: (id: string) => Promise<DeletedCollectionSnapshot | null> | void;
  onEdit: (collection: RecipeCollection) => void;
}

export function ManageCollectionsDialog({
  open,
  onOpenChange,
  collections,
  counts = {},
  onDelete,
  onEdit,
}: ManageCollectionsDialogProps) {
  const { t } = useTranslation();

  const handleDelete = async (collection: RecipeCollection) => {
    const snapshot = await onDelete(collection.id);
    if (!snapshot) return;
    const count = snapshot.recipeIds.length;
    toast.success(
      t("recipes.collections.deleted", { defaultValue: "Deleted \"{{name}}\"", name: collection.name }),
      {
        description:
          count > 0
            ? t("recipes.collections.deletedKept", {
                defaultValue: "Its {{count}} recipes are still in your library.",
                defaultValue_one: "Its recipe is still in your library.",
                count,
              })
            : undefined,
        action: {
          label: t("recipes.collections.undo", { defaultValue: "Undo" }),
          onClick: () => {
            void snapshot.undo();
          },
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("recipes.collections.manageTitle", { defaultValue: "Manage collections" })}</DialogTitle>
          <DialogDescription>
            {t("recipes.collections.manageDescription", {
              defaultValue: "Rename or delete collections. Deleting one keeps its recipes.",
            })}
          </DialogDescription>
        </DialogHeader>

        {collections.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">
            {t("recipes.collections.empty", { defaultValue: "No collections yet." })}
          </p>
        ) : (
          <ul className="max-h-[400px] space-y-2 overflow-y-auto">
            {collections.map((collection) => {
              const Icon = collectionIcon(collection.icon);
              const tone = collectionTone(collection.color);
              const count = counts[collection.id] ?? 0;
              return (
                <li key={collection.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${tone.soft}`}>
                    <Icon className={`h-5 w-5 ${tone.text}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{collection.name}</span>
                      {collection.is_default && (
                        <Badge variant="secondary" className="text-xs">
                          {t("recipes.collections.default", { defaultValue: "Default" })}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">
                      {t("recipes.collections.count", {
                        defaultValue: "{{count}} recipes",
                        defaultValue_one: "{{count}} recipe",
                        count,
                      })}
                      {collection.description ? ` · ${collection.description}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      onClick={() => onEdit(collection)}
                      aria-label={t("recipes.collections.editOne", {
                        defaultValue: "Edit {{name}}",
                        name: collection.name,
                      })}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-destructive hover:text-destructive"
                      onClick={() => void handleDelete(collection)}
                      aria-label={t("recipes.collections.deleteOne", {
                        defaultValue: "Delete {{name}}",
                        name: collection.name,
                      })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t("recipes.collections.done", { defaultValue: "Done" })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { RecipeCollection } from "@/types";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { collectionIcon, collectionTone } from "@/lib/collectionAppearance";

interface AddToCollectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipeId: string;
  recipeName: string;
  collections: RecipeCollection[];
  /** Collections the recipe is in now (useRecipeCollections().collectionIdsByRecipe[recipeId]). */
  currentCollectionIds: readonly string[];
  /** Persist the full set of collection ids for this recipe (useRecipeCollections().setMembership). */
  onSave: (recipeId: string, collectionIds: string[]) => Promise<boolean>;
  /** Create a collection inline (useRecipeCollections().create). */
  onCreate?: (input: { name: string }) => Promise<RecipeCollection | null>;
}

export function AddToCollectionsDialog({
  open,
  onOpenChange,
  recipeId,
  recipeName,
  collections,
  currentCollectionIds,
  onSave,
  onCreate,
}: AddToCollectionsDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(() => [...currentCollectionIds]);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Re-seed each time the dialog opens (or opens for another recipe); the
  // initial useState value alone went stale after the first recipe.
  useEffect(() => {
    if (open) {
      setSelected([...currentCollectionIds]);
      setNewName("");
    }
    // currentCollectionIds is intentionally not a dependency: a membership
    // change while the dialog is open must not wipe the user's unsaved picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recipeId]);

  const toggle = (collectionId: string, checked: boolean) => {
    setSelected((prev) =>
      checked ? (prev.includes(collectionId) ? prev : [...prev, collectionId]) : prev.filter((id) => id !== collectionId),
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !onCreate || creating) return;
    setCreating(true);
    try {
      const created = await onCreate({ name });
      if (created) {
        setSelected((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await onSave(recipeId, selected);
      if (ok) {
        toast.success(t("recipes.collections.saved", { defaultValue: "Collections updated" }));
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("recipes.collections.addTitle", { defaultValue: "Add to collections" })}</DialogTitle>
          <DialogDescription>
            {t("recipes.collections.addDescription", {
              defaultValue: "Choose where \"{{name}}\" belongs.",
              name: recipeName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[360px] space-y-2 overflow-y-auto">
          {collections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("recipes.collections.noneYet", { defaultValue: "No collections yet. Name one below." })}
            </p>
          ) : (
            collections.map((collection) => {
              const Icon = collectionIcon(collection.icon);
              const tone = collectionTone(collection.color);
              const isSelected = selected.includes(collection.id);
              // One <label> wraps the checkbox and the text: a click anywhere on
              // the row reaches the checkbox exactly once, through the label.
              return (
                <label
                  key={collection.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => toggle(collection.id, checked === true)}
                  />
                  <Icon className={`h-5 w-5 shrink-0 ${tone.text}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{collection.name}</span>
                    {collection.description && (
                      <span className="block truncate text-sm text-muted-foreground">{collection.description}</span>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {onCreate && (
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("recipes.collections.newPlaceholder", { defaultValue: "New collection" })}
              aria-label={t("recipes.collections.newName", { defaultValue: "New collection name" })}
              className="min-h-11"
              maxLength={80}
            />
            <Button type="submit" variant="outline" className="min-h-11 shrink-0" disabled={!newName.trim() || creating}>
              {creating ? (
                <Loader2 className="mr-1.5 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              )}
              {t("recipes.collections.add", { defaultValue: "Add" })}
            </Button>
          </form>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("recipes.collections.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || collections.length === 0}>
            {saving
              ? t("recipes.collections.saving", { defaultValue: "Saving..." })
              : t("recipes.collections.save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

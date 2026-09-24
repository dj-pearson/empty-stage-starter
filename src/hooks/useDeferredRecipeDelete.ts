import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Recipe } from "@/types";

/**
 * The Recipes screen's one delete path: hide now, commit later.
 *
 * requestDelete hides the recipe at once and shows a toast with Undo. The row
 * is only deleted when that toast goes away on its own (or is swiped/closed),
 * when the page unmounts, or when the tab is being put away (pagehide), so a
 * parent who taps Delete by mistake gets the recipe back without a second
 * confirmation dialog in the way every other time.
 */

export const RECIPE_DELETE_UNDO_MS = 6000;

export interface UseDeferredRecipeDeleteOptions {
  /** Commits the delete (RecipesContext.deleteRecipe). */
  deleteRecipe: (id: string) => void;
  /** Drops the recipe from collection membership (useRecipeCollections.dropRecipe). */
  dropRecipe?: (id: string) => void;
  /** Runs when a delete is requested, e.g. to close the detail sheet. */
  onRequested?: (recipe: Recipe) => void;
  durationMs?: number;
}

export interface UseDeferredRecipeDelete {
  /** Recipes hidden while their Undo toast is up. */
  pendingDeleteIds: ReadonlySet<string>;
  requestDelete: (recipe: Recipe) => void;
  undo: (id: string) => void;
  /** Commit every pending delete now. */
  flush: () => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export function useDeferredRecipeDelete({
  deleteRecipe,
  dropRecipe,
  onRequested,
  durationMs = RECIPE_DELETE_UNDO_MS,
}: UseDeferredRecipeDeleteOptions): UseDeferredRecipeDelete {
  const { t } = useTranslation();
  const [pendingDeleteIds, setPendingDeleteIds] = useState<ReadonlySet<string>>(EMPTY);

  // id -> toast id. The source of truth for "still pending", so a commit that
  // races an Undo (or a flush that races an auto-close) runs exactly once.
  const pendingRef = useRef(new Map<string, string | number>());
  const mountedRef = useRef(true);

  // Latest callbacks, so the handlers below stay stable across renders and a
  // toast created three renders ago still commits through the current ones.
  const deleteRef = useRef(deleteRecipe);
  deleteRef.current = deleteRecipe;
  const dropRef = useRef(dropRecipe);
  dropRef.current = dropRecipe;
  const requestedRef = useRef(onRequested);
  requestedRef.current = onRequested;

  const forget = useCallback((id: string) => {
    if (!mountedRef.current) return;
    setPendingDeleteIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const commit = useCallback(
    (id: string) => {
      if (!pendingRef.current.has(id)) return;
      pendingRef.current.delete(id);
      deleteRef.current(id);
      dropRef.current?.(id);
      forget(id);
    },
    [forget],
  );

  const undo = useCallback(
    (id: string) => {
      const toastId = pendingRef.current.get(id);
      if (toastId === undefined) return;
      pendingRef.current.delete(id);
      toast.dismiss(toastId);
      forget(id);
    },
    [forget],
  );

  const requestDelete = useCallback(
    (recipe: Recipe) => {
      const id = recipe.id;
      if (pendingRef.current.has(id)) return;
      // Reserve the slot before the toast exists so a double tap is a no-op.
      pendingRef.current.set(id, `recipe-delete-${id}`);
      setPendingDeleteIds((prev) => new Set(prev).add(id));
      requestedRef.current?.(recipe);
      const toastId = toast(
        t("recipes.toasts.deleted", { defaultValue: 'Deleted "{{name}}"', name: recipe.name }),
        {
          id: `recipe-delete-${id}`,
          duration: durationMs,
          action: {
            label: t("recipes.toasts.undo", { defaultValue: "Undo" }),
            onClick: () => undo(id),
          },
          onAutoClose: () => commit(id),
          onDismiss: () => commit(id),
        },
      );
      if (pendingRef.current.has(id)) pendingRef.current.set(id, toastId);
    },
    [t, durationMs, undo, commit],
  );

  const flush = useCallback(() => {
    for (const [id, toastId] of [...pendingRef.current]) {
      commit(id);
      toast.dismiss(toastId);
    }
  }, [commit]);

  // A tab put away (or closed) with an Undo toast up would otherwise lose the
  // delete: the timer never fires and the recipe comes back on the next load.
  useEffect(() => {
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flush]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flush();
    };
  }, [flush]);

  return { pendingDeleteIds, requestDelete, undo, flush };
}

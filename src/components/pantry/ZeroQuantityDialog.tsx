import { useTranslation } from "react-i18next";
import type { Food } from "@/types";
import { Button } from "@/components/ui/button";
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
import "@/i18n/appLocale";

interface ZeroQuantityDialogProps {
  food: Pick<Food, "name">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Keep at 0": the count was used up, or was wrong. */
  onSetZero: () => void;
  /**
   * US-672: "we threw this out", which the ledger records as waste rather
   * than as a correction. Without it the button falls back to onSetZero, so
   * it is never a dead end.
   */
  onWaste?: () => void;
  onDelete: () => void;
}

/**
 * The one question asked whenever a pantry item is about to reach zero, from
 * the grid card and the list row alike: used up, thrown out, or remove it.
 */
export function ZeroQuantityDialog({
  food,
  open,
  onOpenChange,
  onSetZero,
  onWaste,
  onDelete,
}: ZeroQuantityDialogProps) {
  const { t } = useTranslation();

  const close = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("pantry.item.zeroTitle", "Quantity reaching zero")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("pantry.item.zeroBody", {
              defaultValue:
                "{{name}} will be at 0. Did you use it up, throw it out, or would you rather remove it from your pantry?",
              name: food.name,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel>{t("pantry.item.cancel", "Cancel")}</AlertDialogCancel>
          <Button variant="outline" onClick={close(onSetZero)}>
            {t("pantry.item.keepAtZero", "Keep at 0")}
          </Button>
          <Button variant="outline" onClick={close(onWaste ?? onSetZero)}>
            {t("pantry.item.threwOut", "Threw it out")}
          </Button>
          <AlertDialogAction
            onClick={onDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("pantry.item.deleteFood", "Delete food")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

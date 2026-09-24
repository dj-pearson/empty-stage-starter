import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Camera, FileSpreadsheet, MoreHorizontal, Sparkles, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { haptic } from "@/lib/haptics";
import "@/i18n/appLocale";

/**
 * The pantry's secondary capture paths, behind one menu rendered once.
 *
 * Barcode and receipt are not here: they are the two a parent reaches for
 * in the kitchen, so the page shows them as first-class icons next to the
 * quick-add bar. What is left is the occasional stuff: a photo, a CSV, AI
 * ideas, and (for an empty pantry) the starter list.
 *
 * Every item uses onSelect and only calls back. None of them renders a dialog
 * inside the menu: a Radix dialog nested in a DropdownMenuItem unmounts with
 * the menu the moment the menu closes, which is how "Import CSV" used to open
 * and vanish in the same tap. The page owns the dialogs and opens them from
 * these callbacks.
 */
export interface PantryCaptureMenuProps {
  onPhoto: () => void;
  onImportCsv: () => void;
  onAiIdeas: () => void;
  /** The starter list item is shown only when this is passed. */
  onStarter?: () => void;
}

function PantryCaptureMenuImpl({ onPhoto, onImportCsv, onAiIdeas, onStarter }: PantryCaptureMenuProps) {
  const { t } = useTranslation();
  const select = (fn: () => void) => () => {
    haptic.light();
    fn();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-11 shrink-0 p-0 md:w-auto md:gap-2 md:px-3"
          data-testid="pantry-capture-menu"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only md:not-sr-only">{t("pantry.capture.more", "More ways to add")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem className="min-h-11 gap-2" onSelect={select(onPhoto)}>
          <Camera className="h-4 w-4" aria-hidden="true" />
          {t("pantry.capture.photo", "Identify from a photo")}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 gap-2" onSelect={select(onImportCsv)}>
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          {t("pantry.capture.importCsv", "Import a CSV file")}
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 gap-2" onSelect={select(onAiIdeas)}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {t("pantry.capture.aiIdeas", "Food ideas for my kids")}
        </DropdownMenuItem>
        {onStarter && (
          <DropdownMenuItem className="min-h-11 gap-2" onSelect={select(onStarter)}>
            <Sprout className="h-4 w-4" aria-hidden="true" />
            {t("pantry.capture.starter", "Load the starter list")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PantryCaptureMenu = memo(PantryCaptureMenuImpl);

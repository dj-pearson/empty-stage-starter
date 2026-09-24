import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LikelyDuplicate } from "@/lib/recipeImportReview";
import "@/i18n/appLocale";

interface ImportDuplicateNoticeProps {
  duplicate: LikelyDuplicate;
  onOpenExisting: () => void;
  onSaveAsNew: () => void;
}

/** "You may already have this one" above an import under review (item 12). */
export function ImportDuplicateNotice({ duplicate, onOpenExisting, onSaveAsNew }: ImportDuplicateNoticeProps) {
  const { t } = useTranslation();
  return (
    <div role="status" className="mb-4 rounded-xl border border-border bg-muted p-3" data-testid="import-duplicate">
      <div className="flex items-start gap-2">
        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {duplicate.reason === "source"
              ? t("recipes.importReview.dupSource", {
                  defaultValue: "You imported this page before, as \"{{name}}\".",
                  name: duplicate.recipe.name,
                })
              : t("recipes.importReview.dupName", {
                  defaultValue: "You already have a recipe called \"{{name}}\".",
                  name: duplicate.recipe.name,
                })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="min-h-11" onClick={onOpenExisting}>
              {t("recipes.importReview.openExisting", { defaultValue: "Open existing" })}
            </Button>
            <Button size="sm" variant="outline" className="min-h-11" onClick={onSaveAsNew}>
              {t("recipes.importReview.saveAsNew", { defaultValue: "Save as new" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

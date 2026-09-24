import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Loader2, Star, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { addIsoDays, parseIsoDate } from "@/lib/date-utils";
import { userFacingError } from "@/lib/networkFailure";
import { saveWeekAsTemplate, type TemplateSeason } from "@/lib/mealPlanTemplatesApi";
import { cn } from "@/lib/utils";

interface SaveMealPlanTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 'YYYY-MM-DD'. The dialog renders nothing without it. */
  startDate?: string;
  /** 'YYYY-MM-DD'. Defaults to startDate + 6 days. */
  endDate?: string;
  kidId?: string;
  onTemplateSaved?: () => void;
}

const SEASONS: TemplateSeason[] = ["year_round", "spring", "summer", "fall", "winter"];

export function SaveMealPlanTemplateDialog({
  open,
  onOpenChange,
  startDate,
  endDate,
  kidId,
  onTemplateSaved,
}: SaveMealPlanTemplateDialogProps) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState<TemplateSeason>("year_round");
  const [isFavorite, setIsFavorite] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const effectiveEnd = startDate ? endDate ?? addIsoDays(startDate, 6) : undefined;
  const formatShort = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language || undefined, { month: "short", day: "numeric" }).format(parseIsoDate(iso));

  // Prefill a name every time the dialog opens, so "Save" is one tap for the
  // parent who does not care what it is called.
  useEffect(() => {
    if (!open || !startDate) return;
    setName(
      t("planner.templates.save.defaultName", {
        defaultValue: "Week of {{date}}",
        date: formatShort(startDate),
      })
    );
    setDescription("");
    setSeason("year_round");
    setIsFavorite(false);
    setShowMore(false);
    // formatShort/t only change with the language; the reset is keyed on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startDate]);

  if (!startDate || !effectiveEnd) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t("planner.templates.save.nameRequired", { defaultValue: "Please enter a template name" }));
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await saveWeekAsTemplate({
        startDate,
        endDate: effectiveEnd,
        kidId,
        name: name.trim(),
        description: description.trim() || null,
        season,
        isFavorite,
      });
      if (!data) throw error ?? new Error("Failed to save template");
      if (error) {
        // The template saved; only the favourite flag did not.
        logger.warn("Template saved but favourite flag failed:", error);
      }

      toast.success(t("planner.templates.save.saved", { defaultValue: "Template saved" }), {
        description: t("planner.templates.save.savedCount", {
          defaultValue: '{{count}} meals saved to "{{name}}"',
          count: data.entriesCount,
          name: name.trim(),
        }),
      });

      onOpenChange(false);
      onTemplateSaved?.();
    } catch (error) {
      logger.error("Error saving template:", error);
      toast.error(
        userFacingError(error, t("planner.templates.save.failed", { defaultValue: "Failed to save template" }))
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>{t("planner.templates.save.title", { defaultValue: "Save week as template" })}</DialogTitle>
          </div>
          <DialogDescription>
            {t("planner.templates.save.description", {
              defaultValue: "Saves every meal from {{from}} to {{to}} so you can reuse the week later.",
              from: formatShort(startDate),
              to: formatShort(effectiveEnd),
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="template-name">
              {t("planner.templates.save.nameLabel", { defaultValue: "Template name" })}
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            aria-controls="save-template-more"
            className="flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} aria-hidden="true" />
            {t("planner.templates.save.moreOptions", { defaultValue: "More options" })}
          </button>

          {showMore && (
            <div id="save-template-more" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-description">
                  {t("planner.templates.save.descriptionLabel", { defaultValue: "Description (optional)" })}
                </Label>
                <Textarea
                  id="template-description"
                  placeholder={t("planner.templates.save.descriptionPlaceholder", {
                    defaultValue: "e.g. Emma loved these meals, minimal prep",
                  })}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">{description.length}/500</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="season">{t("planner.templates.save.seasonLabel", { defaultValue: "Season" })}</Label>
                <Select value={season} onValueChange={(v) => setSeason(v as TemplateSeason)}>
                  <SelectTrigger id="season">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEASONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`planner.templates.season.${s}`, {
                          defaultValue:
                            s === "year_round" ? "Year round" : s.charAt(0).toUpperCase() + s.slice(1),
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex min-h-11 items-center space-x-2">
                <Checkbox
                  id="favorite"
                  checked={isFavorite}
                  onCheckedChange={(checked) => setIsFavorite(checked === true)}
                />
                <Label htmlFor="favorite" className="text-sm font-normal cursor-pointer flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("planner.templates.save.favorite", { defaultValue: "Mark as favorite" })}
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  {t("planner.templates.save.saving", { defaultValue: "Saving..." })}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t("planner.templates.save.submit", { defaultValue: "Save template" })}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

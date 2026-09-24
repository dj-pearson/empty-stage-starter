import { useState, useEffect, useMemo } from "react";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookTemplate,
  Search,
  Star,
  Calendar,
  Users,
  ChefHat,
  Sparkles,
  TrendingUp,
  Loader2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listTemplates, type MealPlanTemplate } from "@/lib/mealPlanTemplatesApi";
import "@/i18n/appLocale";

export type { MealPlanTemplate } from "@/lib/mealPlanTemplatesApi";

interface MealPlanTemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: MealPlanTemplate) => void;
}

export function MealPlanTemplateGallery({
  open,
  onOpenChange,
  onSelectTemplate,
}: MealPlanTemplateGalleryProps) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<MealPlanTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<string>("all");

  useEffect(() => {
    if (!open) return;
    // Closing the dialog (or reopening it) before the list lands must not let
    // a stale response overwrite state or toast after the fact.
    let cancelled = false;
    setIsLoading(true);
    void listTemplates().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        logger.error("Error loading templates:", error);
        toast.error(t("planner.templates.gallery.loadFailed", { defaultValue: "Failed to load templates" }));
      } else {
        setTemplates(data);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      const matchesSearch =
        !q ||
        template.name.toLowerCase().includes(q) ||
        (template.description?.toLowerCase().includes(q) ?? false);
      if (!matchesSearch) return false;
      if (selectedTab === "favorites") return template.is_favorite;
      if (selectedTab === "mine") return !template.is_admin_template;
      if (selectedTab === "starter") return template.is_starter_template;
      return true;
    });
  }, [templates, searchQuery, selectedTab]);

  const seasonLabel = (season: string | null) => {
    if (!season || season === "year_round") return null;
    return t(`planner.templates.season.${season}`, {
      defaultValue: season.charAt(0).toUpperCase() + season.slice(1),
    });
  };

  const getMealCount = (template: MealPlanTemplate) => {
    return template.meal_plan_template_entries?.length || 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BookTemplate className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>{t("planner.templates.gallery.title", { defaultValue: "Meal plan templates" })}</DialogTitle>
          </div>
          <DialogDescription>
            {t("planner.templates.gallery.description", {
              defaultValue: "Pick a template to fill a week with meals that worked before",
            })}
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label={t("planner.templates.gallery.searchLabel", { defaultValue: "Search templates" })}
            placeholder={t("planner.templates.gallery.searchPlaceholder", { defaultValue: "Search templates..." })}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">{t("planner.templates.gallery.tabAll", { defaultValue: "All" })}</TabsTrigger>
            <TabsTrigger value="favorites">
              <Star className="h-4 w-4 mr-1" aria-hidden="true" />
              {t("planner.templates.gallery.tabFavorites", { defaultValue: "Favorites" })}
            </TabsTrigger>
            <TabsTrigger value="mine">
              <Users className="h-4 w-4 mr-1" aria-hidden="true" />
              {t("planner.templates.gallery.tabMine", { defaultValue: "Mine" })}
            </TabsTrigger>
            <TabsTrigger value="starter">
              <Sparkles className="h-4 w-4 mr-1" aria-hidden="true" />
              {t("planner.templates.gallery.tabStarter", { defaultValue: "Starter" })}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t("planner.templates.gallery.loading", { defaultValue: "Loading templates" })} />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <BookTemplate className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" aria-hidden="true" />
                <h3 className="font-semibold text-lg mb-2">
                  {searchQuery
                    ? t("planner.templates.gallery.noResults", { defaultValue: "No templates found" })
                    : t("planner.templates.gallery.empty", { defaultValue: "No templates yet" })}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {searchQuery
                    ? t("planner.templates.gallery.noResultsHint", { defaultValue: "Try a different search term" })
                    : t("planner.templates.gallery.emptyHint", {
                        defaultValue: "Save a week that went well and it shows up here",
                      })}
                </p>
                {!searchQuery && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    <Calendar className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t("planner.templates.gallery.backToPlanner", { defaultValue: "Back to planner" })}
                  </Button>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="grid gap-3 pr-4">
                  {filteredTemplates.map((template) => (
                    <button
                      type="button"
                      key={template.id}
                      onClick={() => {
                        onSelectTemplate(template);
                        onOpenChange(false);
                      }}
                      className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent transition-colors group"
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="mt-1">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            {template.is_admin_template ? (
                              <ChefHat className="h-5 w-5 text-primary" aria-hidden="true" />
                            ) : (
                              <Calendar className="h-5 w-5 text-primary" aria-hidden="true" />
                            )}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold group-hover:text-primary transition-colors">
                              {template.name}
                            </h4>
                            {template.is_favorite && (
                              <Star
                                className="h-4 w-4 fill-primary text-primary"
                                aria-label={t("planner.templates.gallery.favorite", { defaultValue: "Favorite" })}
                              />
                            )}
                            {template.is_admin_template && (
                              <Badge variant="secondary" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                                {t("planner.templates.gallery.curated", { defaultValue: "Curated" })}
                              </Badge>
                            )}
                            {seasonLabel(template.season) && (
                              <Badge variant="outline" className="text-xs">
                                {seasonLabel(template.season)}
                              </Badge>
                            )}
                          </div>

                          {template.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                              {template.description}
                            </p>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" aria-hidden="true" />
                              {t("planner.templates.gallery.mealCount", {
                                defaultValue: "{{count}} meals",
                                count: getMealCount(template),
                              })}
                            </div>
                            {template.times_used > 0 && (
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                                {t("planner.templates.gallery.timesUsed", {
                                  defaultValue: "Used {{count}}x",
                                  count: template.times_used,
                                })}
                              </div>
                            )}
                            {template.success_rate !== null && template.success_rate > 0 && (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs">
                                  {t("planner.templates.gallery.successRate", {
                                    defaultValue: "{{pct}}% success",
                                    pct: Math.round(template.success_rate),
                                  })}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>

        {/* Info */}
        {!isLoading && filteredTemplates.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              {t("planner.templates.gallery.tip", {
                defaultValue: "You choose the week and the children on the next step. Nothing is added until you apply.",
              })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

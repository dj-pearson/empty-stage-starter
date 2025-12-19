import { useState, useEffect } from "react";
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
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface MealPlanTemplate {
  id: string;
  name: string;
  description: string | null;
  season: string | null;
  is_favorite: boolean;
  is_admin_template: boolean;
  is_starter_template: boolean;
  times_used: number;
  success_rate: number | null;
  created_at: string;
  meal_plan_template_entries: any[];
}

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
  const [templates, setTemplates] = useState<MealPlanTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<string>("all");

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }

      // Use VITE_FUNCTIONS_URL for self-hosted Supabase edge functions
      const functionsUrl = import.meta.env.VITE_FUNCTIONS_URL ||
        (import.meta.env.VITE_SUPABASE_URL?.replace('api.', 'functions.') ?? '');
      const response = await fetch(
        `${functionsUrl}/manage-meal-plan-templates`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'list',
            templateData: {},
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load templates');
      }

      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTemplates = templates.filter(template => {
    // Search filter
    const matchesSearch =
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description?.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Tab filter
    if (selectedTab === "favorites") return template.is_favorite;
    if (selectedTab === "mine") return !template.is_admin_template;
    if (selectedTab === "starter") return template.is_starter_template;
    return true; // "all" tab
  });

  const getSeasonEmoji = (season: string | null) => {
    switch (season) {
      case 'spring': return '🌸';
      case 'summer': return '☀️';
      case 'fall': return '🍂';
      case 'winter': return '❄️';
      default: return '📅';
    }
  };

  const getMealCount = (template: MealPlanTemplate) => {
    return template.meal_plan_template_entries?.length || 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BookTemplate className="h-5 w-5 text-primary" />
            <DialogTitle>Meal Plan Templates</DialogTitle>
          </div>
          <DialogDescription>
            Choose a template to instantly fill your week with proven meal plans
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="favorites">
              <Star className="h-4 w-4 mr-1" />
              Favorites
            </TabsTrigger>
            <TabsTrigger value="mine">
              <Users className="h-4 w-4 mr-1" />
              Mine
            </TabsTrigger>
            <TabsTrigger value="starter">
              <Sparkles className="h-4 w-4 mr-1" />
              Starter
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <BookTemplate className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-2">
                  {searchQuery ? "No templates found" : "No templates yet"}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {searchQuery
                    ? "Try a different search term"
                    : "Create your first template by saving a successful week"}
                </p>
                {!searchQuery && (
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Go to Planner
                  </Button>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="grid gap-3 pr-4">
                  {filteredTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        onSelectTemplate(template);
                        onOpenChange(false);
                      }}
                      className="w-full text-left p-4 rounded-lg border hover:border-primary hover:bg-accent transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="mt-1">
                          {template.is_admin_template ? (
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <ChefHat className="h-5 w-5 text-primary" />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-xl">
                              {getSeasonEmoji(template.season)}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold group-hover:text-primary transition-colors">
                              {template.name}
                            </h4>
                            {template.is_favorite && (
                              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                            )}
                            {template.is_admin_template && (
                              <Badge variant="secondary" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Curated
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
                              <Calendar className="h-3 w-3" />
                              {getMealCount(template)} meals
                            </div>
                            {template.times_used > 0 && (
                              <div className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Used {template.times_used}x
                              </div>
                            )}
                            {template.success_rate !== null && template.success_rate > 0 && (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs">
                                  {Math.round(template.success_rate)}% success
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
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
            <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-600 dark:text-blue-400">
              <strong>Tip:</strong> Templates save you time by instantly populating your
              calendar with meals that worked well in the past.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

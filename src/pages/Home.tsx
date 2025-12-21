import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Utensils, Calendar, ShoppingCart, Sparkles, Download, Upload, Trash2, Users, BarChart3, ChefHat, Target, ArrowRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { BackupDataSchema } from "@/lib/validations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ManageKidsDialog } from "@/components/ManageKidsDialog";
import { ManageHouseholdDialog } from "@/components/ManageHouseholdDialog";
import {
  AnimatedDashboard,
  AnimatedPanel,
  AnimatedStatCard,
  AnimatedActionCard,
  AnimatedWelcomeBanner,
} from "@/components/AnimatedDashboard";
import { SubscriptionStatusBanner } from "@/components/SubscriptionStatusBanner";
import { MotivationalMessage } from "@/components/MotivationalMessage";
import { TodayMeals } from "@/components/TodayMeals";
import { QuickLogModal } from "@/components/QuickLogModal";

export default function Home() {
  const { foods, planEntries, groceryItems, kids, recipes, activeKidId, exportData, importData, resetAllData, updatePlanEntry } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parentName, setParentName] = useState<string>("Parent");
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<{ slot: string; entryId: string } | null>(null);

  const activeKid = kids.find(k => k.id === activeKidId);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
          logger.error("Error fetching user:", authError);
          return;
        }

        if (!user) {
          logger.warn("No authenticated user found");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (profileError) {
          logger.error("Error fetching profile:", profileError);
          // Use default name if profile fetch fails
          return;
        }

        if (profile?.full_name) {
          setParentName(profile.full_name);
        }
      } catch (error) {
        logger.error("Unexpected error fetching profile:", error);
        // Silently fail - parentName defaults to "Parent"
      }
    };

    fetchProfile();
  }, []);

  const safeFoods = foods.filter(f => f.is_safe).length;
  const tryBites = foods.filter(f => f.is_try_bite).length;
  const kidPlanEntries = planEntries.filter(p => p.kid_id === activeKidId);

  // Determine if user is new (has little to no data)
  const isNewUser = safeFoods < 3 && kidPlanEntries.length === 0;
  const needsMoreFoods = safeFoods < 5;
  const needsMealPlan = kidPlanEntries.length === 0 && safeFoods >= 3;

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-planner-backup-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data exported successfully!");
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      toast.error("Please upload a JSON file");
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File too large. Maximum size is 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;

        // Parse JSON
        const parsed = JSON.parse(jsonData);

        // Validate schema
        const validation = BackupDataSchema.safeParse(parsed);
        if (!validation.success) {
          const errorMessage = validation.error.errors[0]?.message || 'Invalid backup file structure';
          toast.error(`Validation failed: ${errorMessage}`);
          logger.warn("Import validation failed:", validation.error.errors);
          return;
        }

        // Import validated data
        importData(jsonData);
        toast.success("Data imported successfully!");
      } catch (error) {
        logger.error("Import error:", error);
        if (error instanceof SyntaxError) {
          toast.error("Invalid JSON format. Please upload a valid backup file.");
        } else {
          toast.error("Failed to import data. Please check the file format.");
        }
      }
    };

    reader.onerror = () => {
      toast.error("Failed to read file");
      logger.error("FileReader error");
    };

    reader.readAsText(file);
  };

  const handleReset = () => {
    resetAllData();
    toast.success("All data has been reset to defaults!");
  };

  const handleLogMeal = (mealSlot: string, entryId: string) => {
    setSelectedMeal({ slot: mealSlot, entryId });
    setQuickLogOpen(true);
  };

  const handleQuickLog = async (result: 'ate' | 'tasted' | 'refused', notes?: string) => {
    if (!selectedMeal || !updatePlanEntry) return;

    try {
      const entry = planEntries.find(p => p.id === selectedMeal.entryId);
      if (entry) {
        await updatePlanEntry(selectedMeal.entryId, {
          ...entry,
          result,
          notes: notes || entry.notes,
        });
        toast.success(`Meal logged as ${result}!`);
      }
    } catch (error) {
      toast.error("Failed to log meal. Please try again.");
    }
  };

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <AnimatedDashboard className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Subscription Status Banner */}
        <SubscriptionStatusBanner />

        {/* Welcome Banner with Animations */}
        <AnimatedWelcomeBanner
          name={parentName}
          subtitle="Plan delicious meals with safe foods and daily try bites for your picky eater"
        />

        {/* Motivational Message */}
        <AnimatedPanel>
          <MotivationalMessage type="greeting" className="mb-6" childName={activeKid?.name} />
        </AnimatedPanel>

        {/* Getting Started Section - Shows for new users */}
        {isNewUser && (
          <AnimatedPanel>
            <Card className="mb-8 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                  Let's Get You Started!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-6">
                  Complete these steps to unlock the full power of EatPal and start planning stress-free meals.
                </p>
                <div className="space-y-4">
                  {/* Step 1: Add Safe Foods */}
                  <div
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      safeFoods >= 3
                        ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20'
                        : 'border-primary/30 bg-primary/5 hover:border-primary'
                    }`}
                    onClick={() => navigate("/dashboard/pantry")}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      safeFoods >= 3 ? 'bg-green-500 text-white' : 'bg-primary/10 text-primary'
                    }`}>
                      {safeFoods >= 3 ? '✓' : '1'}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">Add Your Child's Safe Foods</h4>
                      <p className="text-sm text-muted-foreground">
                        {safeFoods >= 3
                          ? `Great! You've added ${safeFoods} safe foods`
                          : `Add at least 3 foods your child enjoys (${safeFoods}/3 added)`
                        }
                      </p>
                    </div>
                    {safeFoods < 3 && (
                      <Button size="sm" className="gap-1">
                        <Plus className="h-4 w-4" /> Add Foods
                      </Button>
                    )}
                  </div>

                  {/* Step 2: Create Meal Plan */}
                  <div
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      kidPlanEntries.length > 0
                        ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20'
                        : safeFoods >= 3
                          ? 'border-primary/30 bg-primary/5 hover:border-primary'
                          : 'border-muted bg-muted/30 opacity-60'
                    }`}
                    onClick={() => safeFoods >= 3 && navigate("/dashboard/planner")}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      kidPlanEntries.length > 0
                        ? 'bg-green-500 text-white'
                        : safeFoods >= 3
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {kidPlanEntries.length > 0 ? '✓' : '2'}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">Create Your First Meal Plan</h4>
                      <p className="text-sm text-muted-foreground">
                        {kidPlanEntries.length > 0
                          ? `Awesome! You have ${kidPlanEntries.length} meals planned`
                          : safeFoods >= 3
                            ? 'Generate a weekly meal plan with AI'
                            : 'Complete step 1 first'
                        }
                      </p>
                    </div>
                    {kidPlanEntries.length === 0 && safeFoods >= 3 && (
                      <Button size="sm" className="gap-1">
                        <Calendar className="h-4 w-4" /> Plan Meals
                      </Button>
                    )}
                  </div>

                  {/* Step 3: Generate Grocery List */}
                  <div
                    className={`flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                      groceryItems.length > 0
                        ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20'
                        : kidPlanEntries.length > 0
                          ? 'border-primary/30 bg-primary/5 hover:border-primary'
                          : 'border-muted bg-muted/30 opacity-60'
                    }`}
                    onClick={() => kidPlanEntries.length > 0 && navigate("/dashboard/grocery")}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      groceryItems.length > 0
                        ? 'bg-green-500 text-white'
                        : kidPlanEntries.length > 0
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {groceryItems.length > 0 ? '✓' : '3'}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">Generate Grocery List</h4>
                      <p className="text-sm text-muted-foreground">
                        {groceryItems.length > 0
                          ? `Perfect! ${groceryItems.length} items on your list`
                          : kidPlanEntries.length > 0
                            ? 'Auto-create your shopping list from meal plans'
                            : 'Complete step 2 first'
                        }
                      </p>
                    </div>
                    {groceryItems.length === 0 && kidPlanEntries.length > 0 && (
                      <Button size="sm" className="gap-1">
                        <ShoppingCart className="h-4 w-4" /> Create List
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </AnimatedPanel>
        )}

        {/* Quick Action Prompts for returning users */}
        {!isNewUser && needsMoreFoods && (
          <AnimatedPanel>
            <Card className="mb-6 border-primary/20 bg-primary/5 cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/dashboard/pantry")}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Add More Safe Foods</h4>
                      <p className="text-sm text-muted-foreground">The more foods you add, the better your meal plans will be</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary" />
                </div>
              </CardContent>
            </Card>
          </AnimatedPanel>
        )}

        {!isNewUser && needsMealPlan && (
          <AnimatedPanel>
            <Card className="mb-6 border-accent/20 bg-accent/5 cursor-pointer hover:shadow-md transition-all" onClick={() => navigate("/dashboard/planner")}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Create Your First Meal Plan</h4>
                      <p className="text-sm text-muted-foreground">You have {safeFoods} foods ready - let's plan some meals!</p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-accent" />
                </div>
              </CardContent>
            </Card>
          </AnimatedPanel>
        )}

        {/* Today's Meals */}
        <AnimatedPanel delay={0.05}>
          <TodayMeals onLogMeal={handleLogMeal} />
        </AnimatedPanel>

        {/* Stats Cards with Animations */}
        <AnimatedPanel>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <AnimatedStatCard
              value={safeFoods}
              label="Safe Foods"
              color="text-safe-food"
              icon={<Utensils className="w-6 h-6" />}
            />
            <AnimatedStatCard
              value={tryBites}
              label="Try Bites"
              color="text-try-bite"
              icon={<Target className="w-6 h-6" />}
            />
            <AnimatedStatCard
              value={recipes.length}
              label="Recipes"
              color="text-secondary"
              icon={<ChefHat className="w-6 h-6" />}
            />
            <AnimatedStatCard
              value={kidPlanEntries.length}
              label="Meals Planned"
              color="text-primary"
              icon={<Calendar className="w-6 h-6" />}
            />
            <AnimatedStatCard
              value={groceryItems.length}
              label="Grocery Items"
              color="text-accent"
              icon={<ShoppingCart className="w-6 h-6" />}
            />
          </div>
        </AnimatedPanel>

        {/* Action Cards with Animations */}
        <AnimatedPanel delay={0.1}>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <AnimatedActionCard
              title="Manage Pantry"
              description="Add and organize safe foods and try bites"
              icon={<Utensils className="h-6 w-6" />}
              onClick={() => navigate("/dashboard/pantry")}
              color="primary"
            />
            <AnimatedActionCard
              title="Recipes"
              description="Create meal templates and grouped foods"
              icon={<ChefHat className="h-6 w-6" />}
              onClick={() => navigate("/dashboard/recipes")}
              color="secondary"
            />
            <AnimatedActionCard
              title="Meal Planner"
              description="Build your weekly meal schedule"
              icon={<Calendar className="h-6 w-6" />}
              onClick={() => navigate("/dashboard/planner")}
              color="accent"
            />
            <AnimatedActionCard
              title="Analytics"
              description="Track food preferences and outcomes"
              icon={<BarChart3 className="h-6 w-6" />}
              onClick={() => navigate("/dashboard/analytics")}
              color="try-bite"
            />
          </div>
        </AnimatedPanel>

        {/* Quick Tip */}
        <Card className="mt-8 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Quick Start Tip</h3>
                <p className="text-sm text-muted-foreground">
                  Start by adding your child's favorite safe foods in the Pantry, then head to the Planner to generate your first week of meals!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Data Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 mb-4">
              <ManageHouseholdDialog />
              <ManageKidsDialog />
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button onClick={handleExport} variant="outline" className="flex-1">
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                variant="outline"
                className="flex-1"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Data
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your foods, meal plans, and grocery lists. 
                      This action cannot be undone. Consider exporting your data first.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Export your data for backup, import from a previous backup, or reset to start fresh with default foods.
            </p>
          </CardContent>
        </Card>
      </AnimatedDashboard>

      {/* Quick Log Modal */}
      <QuickLogModal
        open={quickLogOpen}
        onOpenChange={setQuickLogOpen}
        mealName={selectedMeal?.slot.replace('_', ' ')}
        onLog={handleQuickLog}
      />
    </div>
  );
}

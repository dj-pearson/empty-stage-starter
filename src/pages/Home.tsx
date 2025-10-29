import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Utensils, Calendar, ShoppingCart, Sparkles, Download, Upload, Trash2, Users, BarChart3, ChefHat, Target } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export default function Home() {
  const { foods, planEntries, groceryItems, kids, recipes, activeKidId, exportData, importData, resetAllData } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parentName, setParentName] = useState<string>("Parent");

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          setParentName(profile.full_name);
        }
      }
    };
    
    fetchProfile();
  }, []);

  const safeFoods = foods.filter(f => f.is_safe).length;
  const tryBites = foods.filter(f => f.is_try_bite).length;
  const activeKid = kids.find(k => k.id === activeKidId);
  const kidPlanEntries = planEntries.filter(p => p.kid_id === activeKidId);

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

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = e.target?.result as string;
        importData(jsonData);
        toast.success("Data imported successfully!");
      } catch (error) {
        toast.error("Invalid file format. Please upload a valid backup file.");
      }
    };
    reader.readAsText(file);
  };

  const handleReset = () => {
    resetAllData();
    toast.success("All data has been reset to defaults!");
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
    </div>
  );
}

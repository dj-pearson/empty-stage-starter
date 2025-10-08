import { useApp } from "@/contexts/AppContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Utensils, Calendar, ShoppingCart, Sparkles, Download, Upload, Trash2, Users, BarChart3, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";
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

export default function Home() {
  const { foods, planEntries, groceryItems, kids, recipes, activeKidId, exportData, importData, resetAllData } = useApp();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full mb-4">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-medium">Kid Meal Planner</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Welcome, {activeKid?.name || "Parent"}!
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Plan delicious meals with safe foods and daily try bites for your picky eater
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Safe Foods</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-safe-food">{safeFoods}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Try Bites</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-try-bite">{tryBites}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Recipes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-secondary">{recipes.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Meals Planned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-primary">{kidPlanEntries.length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Grocery Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-accent">{groceryItems.length}</p>
            </CardContent>
          </Card>
        </div>

        {/* Action Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate("/dashboard/pantry")}>
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Utensils className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Manage Pantry</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Add and organize safe foods and try bites
              </p>
              <Button variant="outline" className="w-full">
                Go to Pantry
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate("/dashboard/recipes")}>
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ChefHat className="h-6 w-6 text-secondary" />
              </div>
              <CardTitle>Recipes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Create meal templates and grouped foods
              </p>
              <Button variant="outline" className="w-full">
                Manage Recipes
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate("/dashboard/planner")}>
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Calendar className="h-6 w-6 text-accent" />
              </div>
              <CardTitle>Meal Planner</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Build your weekly meal schedule
              </p>
              <Button variant="outline" className="w-full">
                Plan Meals
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-all cursor-pointer group" onClick={() => navigate("/dashboard/analytics")}>
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-try-bite/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BarChart3 className="h-6 w-6 text-try-bite" />
              </div>
              <CardTitle>Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Track food preferences and outcomes
              </p>
              <Button variant="outline" className="w-full">
                View Insights
              </Button>
            </CardContent>
          </Card>
        </div>

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
      </div>
    </div>
  );
}

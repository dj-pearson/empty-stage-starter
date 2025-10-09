import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { FoodCard } from "@/components/FoodCard";
import { AddFoodDialog } from "@/components/AddFoodDialog";
import { ImportCsvDialog } from "@/components/ImportCsvDialog";
import { BarcodeScannerDialog } from "@/components/admin/BarcodeScannerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Sparkles, Download, ScanBarcode } from "lucide-react";
import { Food, FoodCategory } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { starterFoods } from "@/lib/starterFoods";

interface FoodSuggestion {
  name: string;
  category: FoodCategory;
  reason: string;
}

export default function Pantry() {
  const { foods, addFood, updateFood, deleteFood, planEntries, kids, activeKidId } = useApp();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editFood, setEditFood] = useState<Food | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<FoodSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const filteredFoods = foods.filter(food => {
    if (!food || !food.name) return false;
    const matchesSearch = food.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || food.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleGetSuggestions = async () => {
    setIsLoadingSuggestions(true);
    setShowSuggestions(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('suggest-foods', {
        body: { foods, planEntries }
      });

      if (error) throw error;

      if (data?.error) {
        if (data.error.includes('Rate limits')) {
          toast({
            title: "Rate Limit Reached",
            description: "Please try again in a few moments.",
            variant: "destructive",
          });
        } else if (data.error.includes('Payment required')) {
          toast({
            title: "Credits Required",
            description: "Please add credits to your workspace to continue using AI features.",
            variant: "destructive",
          });
        } else {
          throw new Error(data.error);
        }
        setSuggestions([]);
      } else {
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error getting suggestions:', error);
      toast({
        title: "Error",
        description: "Failed to get AI suggestions. Please try again.",
        variant: "destructive",
      });
      setSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = (suggestion: FoodSuggestion) => {
    addFood({
      name: suggestion.name,
      category: suggestion.category,
      is_safe: false,
      is_try_bite: true,
    });
    
    toast({
      title: "Food Added",
      description: `${suggestion.name} has been added to your pantry as a try bite food.`,
    });
  };

  const handleEdit = (food: Food) => {
    setEditFood(food);
    setDialogOpen(true);
  };

  const handleSave = (foodData: Omit<Food, "id">) => {
    if (editFood) {
      updateFood(editFood.id, foodData);
    } else {
      addFood(foodData);
    }
    setEditFood(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditFood(null);
    }
  };

  const handleLoadStarterList = () => {
    let addedCount = 0;
    starterFoods.forEach(starterFood => {
      // Check if food already exists
      const exists = foods.some(f => f.name.toLowerCase() === starterFood.name.toLowerCase());
      if (!exists) {
        addFood(starterFood);
        addedCount++;
      }
    });
    
    toast({
      title: "Starter List Loaded",
      description: `${addedCount} foods added to your pantry!`,
    });
  };

  return (
    <div className="min-h-screen pb-20 md:pt-20 bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Food Pantry</h1>
              <p className="text-muted-foreground">
                Manage your child's safe foods and try bites
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handleLoadStarterList}
                size="lg"
              >
                <Download className="h-5 w-5 mr-2" />
                Load Starter List
              </Button>
              <Button 
                variant="outline" 
                onClick={handleGetSuggestions}
                disabled={isLoadingSuggestions}
                size="lg"
              >
                <Sparkles className="h-5 w-5 mr-2" />
                {isLoadingSuggestions ? "Getting Ideas..." : "AI Suggestions"}
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => setScannerOpen(true)}
                size="lg"
              >
                <ScanBarcode className="h-5 w-5 mr-2" />
                Scan Barcode
              </Button>
              <ImportCsvDialog />
              <Button onClick={() => setDialogOpen(true)} size="lg" className="shadow-lg">
                <Plus className="h-5 w-5 mr-2" />
                Add Food
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search foods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="protein">Protein</SelectItem>
                <SelectItem value="carb">Carb</SelectItem>
                <SelectItem value="dairy">Dairy</SelectItem>
                <SelectItem value="fruit">Fruit</SelectItem>
                <SelectItem value="vegetable">Vegetable</SelectItem>
                <SelectItem value="snack">Snack</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground mb-1">Total Foods</p>
              <p className="text-2xl font-bold">{foods.length}</p>
            </div>
            <div className="bg-card rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground mb-1">Safe Foods</p>
              <p className="text-2xl font-bold text-safe-food">
                {foods.filter(f => f.is_safe).length}
              </p>
            </div>
            <div className="bg-card rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground mb-1">Try Bites</p>
              <p className="text-2xl font-bold text-try-bite">
                {foods.filter(f => f.is_try_bite).length}
              </p>
            </div>
            <div className="bg-card rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground mb-1">Filtered</p>
              <p className="text-2xl font-bold">{filteredFoods.length}</p>
            </div>
          </div>

          {/* Food Grid */}
          {filteredFoods.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4 px-4">
                {searchQuery || categoryFilter !== "all"
                  ? "No foods match your filters"
                  : "No foods yet. Start by adding some!"}
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Food
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredFoods.map(food => {
                const activeKid = kids.find(k => k.id === activeKidId);
                return (
                  <FoodCard
                    key={food.id}
                    food={food}
                    onEdit={handleEdit}
                    onDelete={deleteFood}
                    kidAllergens={activeKid?.allergens}
                  />
                );
              })}
            </div>
          )}
        </div>

        <AddFoodDialog
          open={dialogOpen}
          onOpenChange={handleDialogClose}
          onSave={handleSave}
          editFood={editFood}
        />

        <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Food Suggestions
              </DialogTitle>
              <DialogDescription>
                These foods are suggested based on your child's current preferences and eating history.
              </DialogDescription>
            </DialogHeader>
            
            {isLoadingSuggestions ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-muted-foreground">Analyzing eating patterns...</p>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-4">
                {suggestions.map((suggestion, index) => (
                  <Card key={index} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">{suggestion.name}</h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            Category: <span className="capitalize">{suggestion.category}</span>
                          </p>
                          <p className="text-sm">{suggestion.reason}</p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddSuggestion(suggestion)}
                          className="shrink-0"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No suggestions available at the moment.</p>
                <p className="text-sm mt-2">Try again or add more foods to your pantry first.</p>
              </div>
            )}
          </DialogContent>
      </Dialog>

      <BarcodeScannerDialog 
        open={scannerOpen} 
        onOpenChange={setScannerOpen}
        onFoodAdded={() => {
          // Just refresh - the food is already saved to database
          setScannerOpen(false);
        }}
        targetTable="foods"
      />
      </div>
    </div>
  );
}

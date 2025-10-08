import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

type NutritionItem = {
  id: string;
  name: string;
  category: string;
  serving_size: string | null;
  ingredients: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  allergens: string[] | null;
};

const categories = ["Protein", "Carb", "Fruit", "Veg", "Dairy", "Snack"];

export const NutritionManager = () => {
  const [items, setItems] = useState<NutritionItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<NutritionItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NutritionItem | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "Protein",
    serving_size: "",
    ingredients: "",
    calories: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    allergens: "",
  });

  useEffect(() => {
    fetchNutritionItems();
  }, []);

  useEffect(() => {
    if (searchTerm) {
      setFilteredItems(
        items.filter(
          (item) =>
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredItems(items);
    }
  }, [searchTerm, items]);

  const fetchNutritionItems = async () => {
    const { data, error } = await supabase
      .from("nutrition")
      .select("*")
      .order("name");

    if (error) {
      toast({
        title: "Error",
        description: "Failed to fetch nutrition items",
        variant: "destructive",
      });
    } else {
      setItems(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const nutritionData = {
      name: formData.name,
      category: formData.category,
      serving_size: formData.serving_size || null,
      ingredients: formData.ingredients || null,
      calories: formData.calories ? parseInt(formData.calories) : null,
      protein_g: formData.protein_g ? parseFloat(formData.protein_g) : null,
      carbs_g: formData.carbs_g ? parseFloat(formData.carbs_g) : null,
      fat_g: formData.fat_g ? parseFloat(formData.fat_g) : null,
      allergens: formData.allergens
        ? formData.allergens.split(",").map((a) => a.trim()).filter(Boolean)
        : null,
    };

    if (editingItem) {
      const { error } = await supabase
        .from("nutrition")
        .update(nutritionData)
        .eq("id", editingItem.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update nutrition item",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Nutrition item updated successfully",
        });
        fetchNutritionItems();
        handleCloseDialog();
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("nutrition")
        .insert({ ...nutritionData, created_by: user?.id });

      if (error) {
        toast({
          title: "Error",
          description: "Failed to create nutrition item",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Nutrition item created successfully",
        });
        fetchNutritionItems();
        handleCloseDialog();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this nutrition item?")) return;

    const { error } = await supabase.from("nutrition").delete().eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete nutrition item",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Nutrition item deleted successfully",
      });
      fetchNutritionItems();
    }
  };

  const handleEdit = (item: NutritionItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.category,
      serving_size: item.serving_size || "",
      ingredients: item.ingredients || "",
      calories: item.calories?.toString() || "",
      protein_g: item.protein_g?.toString() || "",
      carbs_g: item.carbs_g?.toString() || "",
      fat_g: item.fat_g?.toString() || "",
      allergens: item.allergens?.join(", ") || "",
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
    setFormData({
      name: "",
      category: "Protein",
      serving_size: "",
      ingredients: "",
      calories: "",
      protein_g: "",
      carbs_g: "",
      fat_g: "",
      allergens: "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search nutrition items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingItem(null)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Edit" : "Add"} Nutrition Item</DialogTitle>
              <DialogDescription>
                {editingItem ? "Update" : "Create"} nutrition information for the community database
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="serving_size">Serving Size</Label>
                  <Input
                    id="serving_size"
                    value={formData.serving_size}
                    onChange={(e) => setFormData({ ...formData, serving_size: e.target.value })}
                    placeholder="e.g., 1 cup, 2 slices"
                  />
                </div>

                <div>
                  <Label htmlFor="ingredients">Ingredients</Label>
                  <Textarea
                    id="ingredients"
                    value={formData.ingredients}
                    onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                    placeholder="List ingredients"
                  />
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="calories">Calories</Label>
                    <Input
                      id="calories"
                      type="number"
                      value={formData.calories}
                      onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="protein_g">Protein (g)</Label>
                    <Input
                      id="protein_g"
                      type="number"
                      step="0.1"
                      value={formData.protein_g}
                      onChange={(e) => setFormData({ ...formData, protein_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="carbs_g">Carbs (g)</Label>
                    <Input
                      id="carbs_g"
                      type="number"
                      step="0.1"
                      value={formData.carbs_g}
                      onChange={(e) => setFormData({ ...formData, carbs_g: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="fat_g">Fat (g)</Label>
                    <Input
                      id="fat_g"
                      type="number"
                      step="0.1"
                      value={formData.fat_g}
                      onChange={(e) => setFormData({ ...formData, fat_g: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="allergens">Allergens (comma-separated)</Label>
                  <Input
                    id="allergens"
                    value={formData.allergens}
                    onChange={(e) => setFormData({ ...formData, allergens: e.target.value })}
                    placeholder="e.g., wheat, dairy, peanut"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button type="submit">{editingItem ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Serving</TableHead>
              <TableHead>Cal</TableHead>
              <TableHead>P/C/F</TableHead>
              <TableHead>Allergens</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No nutrition items found. Add your first item to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.category}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.serving_size || "-"}
                  </TableCell>
                  <TableCell>{item.calories || "-"}</TableCell>
                  <TableCell className="text-sm">
                    {item.protein_g || 0}g / {item.carbs_g || 0}g / {item.fat_g || 0}g
                  </TableCell>
                  <TableCell>
                    {item.allergens && item.allergens.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.allergens.map((allergen) => (
                          <Badge key={allergen} variant="secondary" className="text-xs">
                            {allergen}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">none</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

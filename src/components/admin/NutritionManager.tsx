import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Scan } from "lucide-react";
import { NutritionImportDialog } from "./NutritionImportDialog";
import { BarcodeScannerDialog } from "./BarcodeScannerDialog";
import { PromotionCandidateQueue } from "./PromotionCandidateQueue";

/**
 * US-799 AC2: this screen is the catalog's CRUD, not `nutrition`'s.
 *
 * TWO THINGS CHANGED FOR THE OPERATOR, both of them in the columns.
 *
 * The figures are PER 100 G, not per serving. grocery_product_catalog stores
 * per 100 because USDA and Open Food Facts both publish that way and because
 * per-serving figures against a free-text serving cannot be summed -- which is
 * the whole reason the catalog exists. The form says so on every field; typing
 * a per-serving number into a per-100 field is the one mistake that produces a
 * plausible wrong answer rather than an error.
 *
 * And saving VERIFIES the row. An admin editing a row is what verification
 * means here: the trigger in 20260906000000 stamps verified_at/verified_by from
 * the actual actor, and US-797 keeps unverified figures out of totals and the
 * ladder. So a row an operator has looked at starts counting, and that is the
 * "somewhere to put an operator's edit" this screen was waiting for.
 *
 * serving_size_g is not a field. It is derived from the serving text by the
 * trigger in 20260918000009, which refuses to guess at "2 cookies" or
 * "1 cup (240 ml)" -- so the screen shows what the database read rather than
 * asking an operator to do the parser's job.
 */
type NutritionItem = {
  id: string;
  name: string;
  default_category: string | null;
  serving_size_text: string | null;
  serving_size_g: number | null;
  ingredients: string | null;
  calories_kcal_100: number | null;
  protein_g_100: number | null;
  carbs_g_100: number | null;
  fat_g_100: number | null;
  allergens: string[] | null;
  verification: string;
};

/**
 * The catalog's default_category values, which are the lowercase set
 * BarcodeScannerDialog already maps onto (mapToAllowedCategory) and the set
 * FoodCategory uses. `nutrition.category` was capitalised and free-form.
 */
const categories = ["protein", "carb", "fruit", "vegetable", "dairy", "snack"];

/**
 * The one write failure an operator can act on, said plainly.
 *
 * gpc_guard_verification raises insufficient_privilege when a non-admin tries
 * to change `verification`, and this screen sets it on every save. Without
 * this the operator gets "Failed to update" and no idea that the problem is
 * their role rather than their data.
 */
function describeWriteFailure(error: { code?: string; message?: string }): string {
  if (error.code === "42501" || /verification state/.test(error.message ?? "")) {
    return "Only an admin can verify a catalog row. Your changes were not saved.";
  }
  return error.message || "The catalog write failed.";
}

/**
 * One literal, not a concatenation: supabase-js parses this string at the TYPE
 * level to work out the row shape, and it cannot read `"a, b" + "c"` -- the
 * query then types as GenericStringError[] and the error lands on setItems,
 * three lines away from the cause.
 */
const CATALOG_COLUMNS =
  "id, name, default_category, serving_size_text, serving_size_g, ingredients, calories_kcal_100, protein_g_100, carbs_g_100, fat_g_100, allergens, verification" as const;

export const NutritionManager = () => {
  const [items, setItems] = useState<NutritionItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<NutritionItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NutritionItem | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    category: "protein",
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
            (item.default_category ?? "").toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    } else {
      setFilteredItems(items);
    }
  }, [searchTerm, items]);

  const fetchNutritionItems = async () => {
    const { data, error } = await supabase
      .from("grocery_product_catalog")
      .select(CATALOG_COLUMNS)
      // The catalog is the shared table and grows without bound; the admin
      // list is a list, not an export.
      .order("name")
      .limit(500);

    if (error) {
      toast.error("Error", { description: "Failed to fetch catalog items" });
    } else {
      setItems(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const catalogData = {
      name: formData.name,
      default_category: formData.category,
      // serving_size_g is deliberately absent: the trigger derives it from
      // this text and returns NULL rather than guess at "2 cookies".
      serving_size_text: formData.serving_size || null,
      ingredients: formData.ingredients || null,
      calories_kcal_100: formData.calories ? parseFloat(formData.calories) : null,
      protein_g_100: formData.protein_g ? parseFloat(formData.protein_g) : null,
      carbs_g_100: formData.carbs_g ? parseFloat(formData.carbs_g) : null,
      fat_g_100: formData.fat_g ? parseFloat(formData.fat_g) : null,
      allergens: formData.allergens
        ? formData.allergens.split(",").map((a) => a.trim()).filter(Boolean)
        : null,
      // An admin saving a row is the verification. gpc_guard_verification
      // rejects this from anyone who is not one, and stamps verified_at and
      // verified_by from the actual actor rather than from anything sent here.
      verification: "verified",
    };

    if (editingItem) {
      const { error } = await supabase
        .from("grocery_product_catalog")
        .update(catalogData)
        .eq("id", editingItem.id);

      if (error) {
        toast.error("Error", { description: describeWriteFailure(error) });
      } else {
        toast.success("Saved", { description: `${formData.name} is verified and counts towards totals.` });
        fetchNutritionItems();
        handleCloseDialog();
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("grocery_product_catalog")
        // name_normalized is omitted on purpose: the trigger derives it with
        // the same normalizer the iOS matcher uses.
        .insert({ ...catalogData, kind: "generic", source: "admin", created_by_user_id: user?.id });

      if (error) {
        toast.error("Error", { description: describeWriteFailure(error) });
      } else {
        toast.success("Created", { description: `${formData.name} added to the catalog, verified.` });
        fetchNutritionItems();
        handleCloseDialog();
      }
    }
  };

  const requestDelete = (id: string) => {
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setShowDeleteConfirm(false);
    setPendingDeleteId(null);

    const { error } = await supabase.from("grocery_product_catalog").delete().eq("id", id);

    if (error) {
      toast.error("Error", { description: describeWriteFailure(error) });
    } else {
      toast.success("Deleted", { description: "Catalog item deleted." });
      fetchNutritionItems();
    }
  };

  const handleEdit = (item: NutritionItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      category: item.default_category ?? "protein",
      serving_size: item.serving_size_text || "",
      ingredients: item.ingredients || "",
      calories: item.calories_kcal_100?.toString() || "",
      protein_g: item.protein_g_100?.toString() || "",
      carbs_g: item.carbs_g_100?.toString() || "",
      fat_g: item.fat_g_100?.toString() || "",
      allergens: item.allergens?.join(", ") || "",
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingItem(null);
    setFormData({
      name: "",
      category: "protein",
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
      {/* US-798: foods several families typed independently, waiting for a
          human. Above the item list because it is the thing that needs a
          decision; the list below is reference. */}
      <PromotionCandidateQueue />

      <div className="flex gap-4 items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search catalog items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScannerOpen(true)} className="gap-2">
            <Scan className="h-4 w-4" />
            Scan Barcode
          </Button>
          <NutritionImportDialog onImportComplete={fetchNutritionItems} />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingItem(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingItem ? "Edit" : "Add"} Catalog Item</DialogTitle>
                <DialogDescription>
                  Figures are per 100 g, the way USDA and Open Food Facts publish them.
                  Saving marks the row verified, so it starts counting towards nutrition totals.
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
                      placeholder="e.g., 2 cookies (25g), 1 cup (240 ml)"
                      aria-describedby="serving_size_help"
                    />
                    <p id="serving_size_help" className="text-xs text-muted-foreground mt-1">
                      Include the weight in brackets if the packet gives one. A serving with
                      no readable weight still shows on screen, but per-serving figures
                      cannot be worked out from it.
                    </p>
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
                      <Label htmlFor="calories">Calories /100g</Label>
                      <Input
                        id="calories"
                        type="number"
                        step="0.1"
                        value={formData.calories}
                        onChange={(e) => setFormData({ ...formData, calories: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="protein_g">Protein g/100g</Label>
                      <Input
                        id="protein_g"
                        type="number"
                        step="0.1"
                        value={formData.protein_g}
                        onChange={(e) => setFormData({ ...formData, protein_g: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="carbs_g">Carbs g/100g</Label>
                      <Input
                        id="carbs_g"
                        type="number"
                        step="0.1"
                        value={formData.carbs_g}
                        onChange={(e) => setFormData({ ...formData, carbs_g: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fat_g">Fat g/100g</Label>
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
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Serving</TableHead>
              <TableHead>Cal /100g</TableHead>
              <TableHead>P/C/F per 100g</TableHead>
              <TableHead>Allergens</TableHead>
              <TableHead>Checked</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No catalog items found. Add your first item to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.default_category ?? "-"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {item.serving_size_text || "-"}
                    {/* What the parser read, so an operator can see that
                        "1 cup (240 ml)" produced nothing and fix the text. */}
                    {item.serving_size_text && item.serving_size_g === null && (
                      <span className="block text-xs">no readable weight</span>
                    )}
                  </TableCell>
                  <TableCell>{item.calories_kcal_100 ?? "-"}</TableCell>
                  <TableCell className="text-sm">
                    {/* Not `|| 0`: a row with no protein recorded is not a row
                        with no protein, and 0g reads as a measurement. */}
                    {item.protein_g_100 ?? "-"}g / {item.carbs_g_100 ?? "-"}g / {item.fat_g_100 ?? "-"}g
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
                  <TableCell>
                    {/* US-797: an unverified row is somebody's scan of a
                        label. It shows in search; its figures do not count. */}
                    <Badge variant={item.verification === "verified" ? "secondary" : "outline"}>
                      {item.verification}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        aria-label="Edit this catalog entry"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        aria-label="Delete this catalog entry"
                        variant="ghost"
                        size="sm"
                        onClick={() => requestDelete(item.id)}
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

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onFoodAdded={fetchNutritionItems}
        targetTable="catalog"
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              nutrition item from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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

// Predefined allergens matching Open Food Facts standards
const PREDEFINED_ALLERGENS = [
  "peanuts",
  "tree nuts",
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "soy",
  "wheat",
  "sesame",
];

export function ManageKidsDialog() {
  const { kids, addKid, updateKid, deleteKid } = useApp();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    age: "", 
    notes: "",
    allergens: [] as string[]
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    const kidData = {
      name: formData.name,
      age: formData.age ? parseInt(formData.age) : undefined,
      notes: formData.notes || undefined,
      allergens: formData.allergens.length > 0 ? formData.allergens : undefined,
    };

    if (editingId) {
      updateKid(editingId, kidData);
      toast.success("Child updated!");
    } else {
      addKid(kidData);
      toast.success("Child added!");
    }

    setFormData({ name: "", age: "", notes: "", allergens: [] });
    setEditingId(null);
  };

  const handleEdit = (kid: { id: string; name: string; age?: number; notes?: string; allergens?: string[] }) => {
    setEditingId(kid.id);
    setFormData({ 
      name: kid.name, 
      age: kid.age?.toString() || "",
      notes: kid.notes || "",
      allergens: kid.allergens || []
    });
  };

  const toggleAllergen = (allergen: string) => {
    setFormData({
      ...formData,
      allergens: formData.allergens.includes(allergen)
        ? formData.allergens.filter((a) => a !== allergen)
        : [...formData.allergens, allergen],
    });
  };

  const handleDelete = (id: string) => {
    if (kids.length === 1) {
      toast.error("You must have at least one child");
      return;
    }
    deleteKid(id);
    setDeleteId(null);
    toast.success("Child removed");
  };

  const resetForm = () => {
    setFormData({ name: "", age: "", notes: "", allergens: [] });
    setEditingId(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Users className="h-4 w-4" />
            Manage Children
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Manage Children</DialogTitle>
            <DialogDescription>
              Add, edit, or remove children to create personalized meal plans for each.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Child's Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age">Age (optional)</Label>
              <Input
                id="age"
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                placeholder="Enter age"
                min="0"
                max="18"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any special notes about dietary needs, preferences, etc."
                rows={2}
              />
            </div>
            <div className="space-y-3">
              <Label>Allergens</Label>
              <div className="grid grid-cols-2 gap-3">
                {PREDEFINED_ALLERGENS.map((allergen) => (
                  <div key={allergen} className="flex items-center space-x-2">
                    <Checkbox
                      id={`allergen-${allergen}`}
                      checked={formData.allergens.includes(allergen)}
                      onCheckedChange={() => toggleAllergen(allergen)}
                    />
                    <Label
                      htmlFor={`allergen-${allergen}`}
                      className="text-sm font-normal cursor-pointer capitalize"
                    >
                      {allergen}
                    </Label>
                  </div>
                ))}
              </div>
              {formData.allergens.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t">
                  {formData.allergens.map((allergen) => (
                    <Badge key={allergen} variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {allergen}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                {editingId ? "Update Child" : "Add Child"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </form>

          <div className="mt-6 space-y-2">
            <Label>Current Children ({kids.length})</Label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {kids.map((kid) => (
                <div
                  key={kid.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{kid.name}</p>
                    {kid.age && <p className="text-sm text-muted-foreground">Age {kid.age}</p>}
                    {kid.allergens && kid.allergens.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {kid.allergens.map((allergen) => (
                          <Badge key={allergen} variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-2 w-2" />
                            {allergen}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(kid)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(kid.id)}
                      disabled={kids.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Child Profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all meal plans and data for this child. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

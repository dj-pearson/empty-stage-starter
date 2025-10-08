import { useState, useImperativeHandle, forwardRef } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, Plus, Trash2, AlertTriangle, UserCircle, CalendarIcon, Heart, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";
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

// Common foods kids enjoy
const COMMON_FOODS = [
  "Apple", "Banana", "Grapes", "Strawberries", "Blueberries", "Watermelon",
  "Carrots", "Broccoli", "Cucumber", "Sweet Potato", "Corn", "Peas",
  "Chicken", "Turkey", "Fish", "Eggs", "Beef", "Pork",
  "Pasta", "Rice", "Bread", "Oatmeal", "Pancakes", "Waffles",
  "Cheese", "Yogurt", "Milk", "Ice Cream",
  "Pizza", "Nuggets", "Mac & Cheese", "Sandwiches", "Burgers", "Hot Dogs",
  "Crackers", "Pretzels", "Cookies", "Fruit Snacks"
];

export interface ManageKidsDialogRef {
  openForEdit: (kidId: string) => void;
}

const ManageKidsDialogComponent = forwardRef<ManageKidsDialogRef>((props, ref) => {
  const { kids, addKid, updateKid, deleteKid } = useApp();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    date_of_birth: undefined as Date | undefined,
    notes: "",
    allergens: [] as string[],
    profile_picture_url: "",
    favorite_foods: [] as string[]
  });
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  
  // For date picker navigation
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const calculateAge = (dob: Date) => {
    return differenceInYears(new Date(), dob);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    const kidData = {
      name: formData.name,
      date_of_birth: formData.date_of_birth ? format(formData.date_of_birth, 'yyyy-MM-dd') : undefined,
      age: formData.date_of_birth ? calculateAge(formData.date_of_birth) : undefined,
      notes: formData.notes || undefined,
      allergens: formData.allergens.length > 0 ? formData.allergens : undefined,
      profile_picture_url: formData.profile_picture_url || undefined,
      favorite_foods: formData.favorite_foods.length > 0 ? formData.favorite_foods : undefined,
    };

    if (editingId) {
      updateKid(editingId, kidData);
      toast.success("Child updated!");
      setOpen(false); // close dialog after editing
    } else {
      addKid(kidData);
      toast.success("Child added!");
      setFormData({ 
        name: "", 
        date_of_birth: undefined, 
        notes: "", 
        allergens: [], 
        profile_picture_url: "",
        favorite_foods: []
      });
    }
  };

  const handleEdit = (kid: { 
    id: string; 
    name: string; 
    age?: number; 
    date_of_birth?: string;
    notes?: string; 
    allergens?: string[]; 
    profile_picture_url?: string;
    favorite_foods?: string[];
  }) => {
    setEditingId(kid.id);
    setFormData({ 
      name: kid.name, 
      date_of_birth: kid.date_of_birth ? new Date(kid.date_of_birth) : undefined,
      notes: kid.notes || "",
      allergens: kid.allergens || [],
      profile_picture_url: kid.profile_picture_url || "",
      favorite_foods: kid.favorite_foods || []
    });
    
    // Scroll to the form when editing
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    try {
      setUploading(true);
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error("Not authenticated");

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.data.user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      setFormData({ ...formData, profile_picture_url: publicUrl });
      toast.success("Image uploaded successfully!");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const toggleAllergen = (allergen: string) => {
    setFormData({
      ...formData,
      allergens: formData.allergens.includes(allergen)
        ? formData.allergens.filter((a) => a !== allergen)
        : [...formData.allergens, allergen],
    });
  };

  const toggleFavoriteFood = (food: string) => {
    setFormData({
      ...formData,
      favorite_foods: formData.favorite_foods.includes(food)
        ? formData.favorite_foods.filter((f) => f !== food)
        : [...formData.favorite_foods, food],
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
    setFormData({ 
      name: "", 
      date_of_birth: undefined, 
      notes: "", 
      allergens: [], 
      profile_picture_url: "",
      favorite_foods: []
    });
    setEditingId(null);
  };

  useImperativeHandle(ref, () => ({
    openForEdit: (kidId: string) => {
      if (kidId) {
        const kid = kids.find(k => k.id === kidId);
        if (kid) {
          handleEdit(kid);
        }
      } else {
        resetForm();
      }
      setOpen(true);
    }
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Child" : "Add Child"}</DialogTitle>
          <DialogDescription>
            {editingId ? "Update child information" : "Add a new child to create personalized meal plans"}
          </DialogDescription>
        </DialogHeader>

          <div ref={formRef}>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-3">
              <Label>Profile Picture</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={formData.profile_picture_url} />
                  <AvatarFallback>
                    <UserCircle className="h-12 w-12 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploading}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Upload a profile picture (max 5MB)
                  </p>
                </div>
              </div>
            </div>
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
              <Label>Date of Birth</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date_of_birth && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date_of_birth ? (
                      <>
                        {format(formData.date_of_birth, "PPP")}
                        <span className="ml-2 text-xs text-muted-foreground">
                          (Age: {calculateAge(formData.date_of_birth)})
                        </span>
                      </>
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <div className="p-3 border-b space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs mb-1">Month</Label>
                        <Select
                          value={calendarMonth.getMonth().toString()}
                          onValueChange={(value) => {
                            const newDate = new Date(calendarMonth);
                            newDate.setMonth(parseInt(value));
                            setCalendarMonth(newDate);
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => (
                              <SelectItem key={i} value={i.toString()}>
                                {format(new Date(2000, i, 1), "MMMM")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs mb-1">Year</Label>
                        <Select
                          value={calendarMonth.getFullYear().toString()}
                          onValueChange={(value) => {
                            const newDate = new Date(calendarMonth);
                            newDate.setFullYear(parseInt(value));
                            setCalendarMonth(newDate);
                          }}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => {
                              const year = new Date().getFullYear() - i;
                              return (
                                <SelectItem key={year} value={year.toString()}>
                                  {year}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <Calendar
                    mode="single"
                    selected={formData.date_of_birth}
                    onSelect={(date) => setFormData({ ...formData, date_of_birth: date })}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
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
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-primary" />
                <Label>Favorite Foods</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Select foods your child enjoys to help personalize meal suggestions
              </p>
              <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto p-2 border rounded-md">
                {COMMON_FOODS.map((food) => (
                  <div key={food} className="flex items-center space-x-2">
                    <Checkbox
                      id={`food-${food}`}
                      checked={formData.favorite_foods.includes(food)}
                      onCheckedChange={() => toggleFavoriteFood(food)}
                    />
                    <Label
                      htmlFor={`food-${food}`}
                      className="text-xs font-normal cursor-pointer"
                    >
                      {food}
                    </Label>
                  </div>
                ))}
              </div>
              {formData.favorite_foods.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
                  {formData.favorite_foods.map((food) => (
                    <Badge key={food} variant="secondary" className="text-xs gap-1">
                      <Heart className="h-2 w-2" />
                      {food}
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
          </div>
        </DialogContent>
      </Dialog>
    );
  });
  
  ManageKidsDialogComponent.displayName = 'ManageKidsDialog';
  
  export const ManageKidsDialog = ManageKidsDialogComponent;

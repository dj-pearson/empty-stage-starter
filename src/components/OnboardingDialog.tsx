import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  UserCircle,
  CalendarIcon,
  Heart,
  AlertTriangle,
  Utensils,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInYears } from "date-fns";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

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

const COMMON_FOODS = [
  "Apple", "Banana", "Grapes", "Strawberries", "Blueberries", "Watermelon",
  "Carrots", "Broccoli", "Cucumber", "Sweet Potato", "Corn", "Peas",
  "Chicken", "Turkey", "Fish", "Eggs", "Beef", "Pork",
  "Pasta", "Rice", "Bread", "Oatmeal", "Pancakes", "Waffles",
  "Cheese", "Yogurt", "Milk", "Ice Cream",
  "Pizza", "Nuggets", "Mac & Cheese", "Sandwiches", "Burgers", "Hot Dogs",
];

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
  onOpenChange?: (open: boolean) => void;
}

export function OnboardingDialog({ open, onComplete, onOpenChange }: OnboardingDialogProps) {
  const { addKid, addFood } = useApp();
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const [childData, setChildData] = useState({
    name: "",
    date_of_birth: undefined as Date | undefined,
    notes: "",
    allergens: [] as string[],
    profile_picture_url: "",
    favorite_foods: [] as string[],
  });

  const calculateAge = (dob: Date) => {
    return differenceInYears(new Date(), dob);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
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

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.data.user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("profile-pictures").getPublicUrl(fileName);

      setChildData({ ...childData, profile_picture_url: publicUrl });
      toast.success("Image uploaded successfully!");
    } catch (error) {
      logger.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const toggleAllergen = (allergen: string) => {
    setChildData({
      ...childData,
      allergens: childData.allergens.includes(allergen)
        ? childData.allergens.filter((a) => a !== allergen)
        : [...childData.allergens, allergen],
    });
  };

  const toggleFavoriteFood = (food: string) => {
    setChildData({
      ...childData,
      favorite_foods: childData.favorite_foods.includes(food)
        ? childData.favorite_foods.filter((f) => f !== food)
        : [...childData.favorite_foods, food],
    });
  };

  const handleNext = () => {
    if (step === 1 && !childData.name.trim()) {
      toast.error("Please enter your child's name");
      return;
    }
    if (step === 4) {
      handleComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleComplete = () => {
    // Add child to app
    const kidData = {
      name: childData.name,
      date_of_birth: childData.date_of_birth
        ? format(childData.date_of_birth, "yyyy-MM-dd")
        : undefined,
      age: childData.date_of_birth ? calculateAge(childData.date_of_birth) : undefined,
      notes: childData.notes || undefined,
      allergens: childData.allergens.length > 0 ? childData.allergens : undefined,
      profile_picture_url: childData.profile_picture_url || undefined,
      favorite_foods: childData.favorite_foods.length > 0 ? childData.favorite_foods : undefined,
    };

    addKid(kidData);

    // Add some starter foods to pantry based on favorites
    if (childData.favorite_foods.length > 0) {
      childData.favorite_foods.forEach((foodName) => {
        const category = getCategoryForFood(foodName);
        addFood({
          name: foodName,
          category,
          is_safe: true,
          is_try_bite: false,
        });
      });
    }

    toast.success("Welcome to EatPal! Let's start planning meals!");
    onComplete();
  };

  const getCategoryForFood = (food: string) => {
    const fruits = ["Apple", "Banana", "Grapes", "Strawberries", "Blueberries", "Watermelon"];
    const vegetables = ["Carrots", "Broccoli", "Cucumber", "Sweet Potato", "Corn", "Peas"];
    const proteins = ["Chicken", "Turkey", "Fish", "Eggs", "Beef", "Pork"];
    const carbs = ["Pasta", "Rice", "Bread", "Oatmeal", "Pancakes", "Waffles", "Pizza", "Mac & Cheese", "Sandwiches", "Burgers", "Hot Dogs"];
    const dairy = ["Cheese", "Yogurt", "Milk", "Ice Cream"];

    if (fruits.includes(food)) return "fruit";
    if (vegetables.includes(food)) return "vegetable";
    if (proteins.includes(food)) return "protein";
    if (carbs.includes(food)) return "carb";
    if (dairy.includes(food)) return "dairy";
    return "snack";
  };

  const progress = (step / 4) * 100;

  const handleSkip = () => {
    // Mark onboarding as complete even if skipped
    onComplete();
    setShowSkipConfirm(false);
  };

  const handleDialogChange = (open: boolean) => {
    if (!open) {
      // User trying to close - show skip confirmation
      setShowSkipConfirm(true);
    } else if (onOpenChange) {
      onOpenChange(open);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <DialogTitle>Welcome to EatPal!</DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSkipConfirm(true)}
              className="text-xs"
            >
              Skip for now
            </Button>
          </div>
          <Progress value={progress} className="h-2" />
          <DialogDescription>
            Step {step} of 4 - Let's set up your meal planning journey
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-2 mb-6">
                <h3 className="text-xl font-semibold">Tell us about your child</h3>
                <p className="text-sm text-muted-foreground">
                  This helps us personalize meal suggestions and track allergens
                </p>
              </div>

              <div className="space-y-3">
                <Label>Profile Picture (optional)</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={childData.profile_picture_url} />
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
                    <p className="text-xs text-muted-foreground mt-1">Max 5MB</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Child's Name *</Label>
                <Input
                  id="name"
                  value={childData.name}
                  onChange={(e) => setChildData({ ...childData, name: e.target.value })}
                  placeholder="Enter name"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>Date of Birth (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !childData.date_of_birth && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {childData.date_of_birth ? (
                        <>
                          {format(childData.date_of_birth, "PPP")}
                          <span className="ml-2 text-xs text-muted-foreground">
                            (Age: {calculateAge(childData.date_of_birth)})
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
                      selected={childData.date_of_birth}
                      onSelect={(date) => setChildData({ ...childData, date_of_birth: date })}
                      disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                      month={calendarMonth}
                      onMonthChange={setCalendarMonth}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Step 2: Allergens */}
          {step === 2 && (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-2 mb-6">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold">Any allergies or sensitivities?</h3>
                <p className="text-sm text-muted-foreground">
                  We'll make sure to warn you about foods containing these allergens
                </p>
              </div>

              <div className="space-y-3">
                <Label>Select all that apply</Label>
                <div className="grid grid-cols-2 gap-3">
                  {PREDEFINED_ALLERGENS.map((allergen) => (
                    <div key={allergen} className="flex items-center space-x-2">
                      <Checkbox
                        id={`allergen-${allergen}`}
                        checked={childData.allergens.includes(allergen)}
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
                {childData.allergens.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4 p-4 bg-destructive/5 rounded-lg border border-destructive/20">
                    <p className="w-full text-xs font-medium text-destructive mb-2">
                      Selected allergens:
                    </p>
                    {childData.allergens.map((allergen) => (
                      <Badge key={allergen} variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {allergen}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Favorite Foods */}
          {step === 3 && (
            <div className="space-y-4 py-4">
              <div className="text-center space-y-2 mb-6">
                <div className="flex justify-center">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Heart className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold">What foods does {childData.name || "your child"} enjoy?</h3>
                <p className="text-sm text-muted-foreground">
                  Select their favorites - we'll add these to your pantry automatically
                </p>
              </div>

              <div className="space-y-3">
                <Label>Select favorite foods (optional)</Label>
                <div className="grid grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-md">
                  {COMMON_FOODS.map((food) => (
                    <div key={food} className="flex items-center space-x-2">
                      <Checkbox
                        id={`food-${food}`}
                        checked={childData.favorite_foods.includes(food)}
                        onCheckedChange={() => toggleFavoriteFood(food)}
                      />
                      <Label htmlFor={`food-${food}`} className="text-xs font-normal cursor-pointer">
                        {food}
                      </Label>
                    </div>
                  ))}
                </div>
                {childData.favorite_foods.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-3 border-t">
                    <p className="w-full text-xs font-medium text-primary mb-2">
                      Selected: {childData.favorite_foods.length} foods
                    </p>
                    {childData.favorite_foods.map((food) => (
                      <Badge key={food} variant="secondary" className="text-xs gap-1">
                        <Heart className="h-2 w-2" />
                        {food}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Ready */}
          {step === 4 && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-full bg-safe-food/10 flex items-center justify-center">
                    <Check className="h-8 w-8 text-safe-food" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold">You're all set!</h3>
                <p className="text-muted-foreground">
                  Here's what we'll help you with next:
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Utensils className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Build Your Pantry</h4>
                    <p className="text-sm text-muted-foreground">
                      {childData.favorite_foods.length > 0
                        ? `We've added ${childData.favorite_foods.length} foods to get you started`
                        : "Add safe foods and items to try"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-accent" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Plan Weekly Meals</h4>
                    <p className="text-sm text-muted-foreground">
                      Generate 7-day meal plans with safe foods and daily try bites
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <Utensils className="h-4 w-4 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">Auto Grocery Lists</h4>
                    <p className="text-sm text-muted-foreground">
                      We'll generate shopping lists from your meal plans
                    </p>
                  </div>
                </div>
              </div>

              {childData.notes && (
                <div className="p-3 rounded-lg bg-muted">
                  <Label className="text-xs mb-1">Your notes:</Label>
                  <p className="text-sm">{childData.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          {step === 1 && <div></div>}
          <Button onClick={handleNext} className="ml-auto">
            {step === 4 ? (
              <>
                Get Started
                <Check className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showSkipConfirm} onOpenChange={setShowSkipConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Skip onboarding?</AlertDialogTitle>
          <AlertDialogDescription>
            You can always complete this setup later from your dashboard.
            We recommend setting up at least one child profile to get started with meal planning.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continue Setup</AlertDialogCancel>
          <AlertDialogAction onClick={handleSkip}>
            Skip Onboarding
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

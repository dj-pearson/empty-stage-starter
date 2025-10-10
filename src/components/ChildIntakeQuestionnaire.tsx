import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, Check, UserCircle, AlertTriangle, Heart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ChildIntakeQuestionnaireProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kidId: string;
  kidName: string;
  onComplete: () => void;
}

const ALLERGENS = [
  "peanuts", "tree nuts", "milk", "eggs", "fish", "shellfish", "soy", "wheat", "sesame"
];

const DIETARY_RESTRICTIONS = [
  "vegetarian", "vegan", "halal", "kosher", "gluten-free", "dairy-free"
];

const HEALTH_GOALS = [
  { value: "maintain_balance", label: "Maintain healthy balance" },
  { value: "gain_weight", label: "Gain weight" },
  { value: "try_new_foods", label: "Try new foods" },
  { value: "reduce_sugar", label: "Reduce sugar intake" },
  { value: "improve_variety", label: "Improve food variety" },
  { value: "increase_protein", label: "Increase protein" },
];

const NUTRITION_CONCERNS = [
  "underweight", "overweight", "low_appetite", "sugar_intake", 
  "protein_intake", "constipation", "iron_deficiency", "picky_eating"
];

const TEXTURE_OPTIONS = [
  "crunchy", "soft", "smooth", "mixed", "slippery", "chewy", "crispy", "mushy"
];

const FLAVOR_OPTIONS = [
  "sweet", "salty", "mild", "savory", "tangy", "spicy", "bitter", "sour"
];

const HELPFUL_STRATEGIES = [
  "same_plate_as_others", "small_portions", "dipping_sauces", "familiar_shapes",
  "fun_presentation", "involve_in_cooking", "no_pressure", "positive_reinforcement"
];

const FOOD_CATEGORIES = {
  fruits: ["Apple", "Banana", "Grapes", "Strawberries", "Blueberries", "Watermelon", "Orange", "Pear"],
  vegetables: ["Carrots", "Broccoli", "Cucumber", "Sweet Potato", "Corn", "Peas", "Green Beans", "Tomato"],
  proteins: ["Chicken", "Turkey", "Fish", "Eggs", "Beef", "Pork", "Tofu", "Beans"],
  grains: ["Pasta", "Rice", "Bread", "Oatmeal", "Pancakes", "Waffles", "Cereal", "Crackers"],
  dairy: ["Cheese", "Yogurt", "Milk", "Ice Cream"],
  snacks: ["Pretzels", "Cookies", "Fruit Snacks", "Chips", "Popcorn"]
};

export function ChildIntakeQuestionnaire({ open, onOpenChange, kidId, kidName, onComplete }: ChildIntakeQuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    gender: "",
    height_cm: "",
    weight_kg: "",
    allergens: [] as string[],
    allergen_severity: {} as Record<string, string>,
    cross_contamination_sensitive: false,
    dietary_restrictions: [] as string[],
    health_goals: [] as string[],
    nutrition_concerns: [] as string[],
    eating_behavior: "",
    new_food_willingness: "",
    helpful_strategies: [] as string[],
    texture_preferences: [] as string[],
    texture_dislikes: [] as string[],
    flavor_preferences: [] as string[],
    favorite_foods: [] as string[],
    always_eats_foods: [] as string[],
    disliked_foods: [] as string[],
    behavioral_notes: "",
  });

  const steps = [
    { title: "Basic Info", description: "Physical measurements" },
    { title: "Allergies & Safety", description: "Health restrictions" },
    { title: "Preferences", description: "Likes & dislikes" },
    { title: "Eating Behavior", description: "Habits & goals" },
    { title: "Review", description: "Confirm details" },
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const toggleArrayItem = (array: string[], item: string, setter: (val: string[]) => void) => {
    if (array.includes(item)) {
      setter(array.filter(i => i !== item));
    } else {
      setter([...array, item]);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('kids')
        .update({
          ...formData,
          height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
          weight_kg: formData.weight_kg ? parseFloat(formData.weight_kg) : null,
          profile_completed: true,
          profile_last_reviewed: new Date().toISOString(),
        })
        .eq('id', kidId);

      if (error) throw error;

      toast.success("Profile completed successfully!");
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {kidName}'s Profile Questionnaire
          </DialogTitle>
          <DialogDescription>
            Help us create personalized meal plans tailored to {kidName}'s needs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            {steps.map((step, idx) => (
              <div key={idx} className={cn("text-center flex-1", currentStep === idx && "text-primary font-medium")}>
                <div>{step.title}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          {currentStep === 0 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Physical Information</CardTitle>
                  <CardDescription>Optional but helps with nutrition planning</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Gender (optional)</Label>
                      <RadioGroup value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="male" id="male" />
                          <Label htmlFor="male" className="font-normal cursor-pointer">Male</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="female" id="female" />
                          <Label htmlFor="female" className="font-normal cursor-pointer">Female</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="other" id="other" />
                          <Label htmlFor="other" className="font-normal cursor-pointer">Other</Label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div className="space-y-2">
                      <Label>Height (cm)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 120"
                        value={formData.height_cm}
                        onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Weight (kg)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 25"
                        value={formData.weight_kg}
                        onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Allergies & Restrictions
                  </CardTitle>
                  <CardDescription>Critical safety information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="mb-3 block">Known Allergens</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {ALLERGENS.map((allergen) => (
                        <div key={allergen} className="flex items-center space-x-2">
                          <Checkbox
                            id={`allergen-${allergen}`}
                            checked={formData.allergens.includes(allergen)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.allergens, allergen, (arr) => 
                                setFormData({ ...formData, allergens: arr })
                              )
                            }
                          />
                          <Label htmlFor={`allergen-${allergen}`} className="text-sm font-normal cursor-pointer capitalize">
                            {allergen}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {formData.allergens.length > 0 && (
                    <div className="space-y-3 p-4 bg-destructive/10 rounded-lg">
                      <Label>Severity Levels</Label>
                      {formData.allergens.map((allergen) => (
                        <div key={allergen} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{allergen}</span>
                          <RadioGroup
                            value={formData.allergen_severity[allergen] || ""}
                            onValueChange={(v) => 
                              setFormData({ 
                                ...formData, 
                                allergen_severity: { ...formData.allergen_severity, [allergen]: v }
                              })
                            }
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-1">
                              <RadioGroupItem value="mild" id={`${allergen}-mild`} />
                              <Label htmlFor={`${allergen}-mild`} className="text-xs font-normal cursor-pointer">Mild</Label>
                            </div>
                            <div className="flex items-center space-x-1">
                              <RadioGroupItem value="moderate" id={`${allergen}-moderate`} />
                              <Label htmlFor={`${allergen}-moderate`} className="text-xs font-normal cursor-pointer">Moderate</Label>
                            </div>
                            <div className="flex items-center space-x-1">
                              <RadioGroupItem value="severe" id={`${allergen}-severe`} />
                              <Label htmlFor={`${allergen}-severe`} className="text-xs font-normal cursor-pointer">Severe</Label>
                            </div>
                          </RadioGroup>
                        </div>
                      ))}
                      
                      <div className="flex items-center space-x-2 pt-2 border-t">
                        <Checkbox
                          id="cross-contamination"
                          checked={formData.cross_contamination_sensitive}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, cross_contamination_sensitive: checked as boolean })
                          }
                        />
                        <Label htmlFor="cross-contamination" className="text-sm font-normal cursor-pointer">
                          Sensitive to cross-contamination
                        </Label>
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="mb-3 block">Dietary Restrictions</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {DIETARY_RESTRICTIONS.map((restriction) => (
                        <div key={restriction} className="flex items-center space-x-2">
                          <Checkbox
                            id={`restriction-${restriction}`}
                            checked={formData.dietary_restrictions.includes(restriction)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.dietary_restrictions, restriction, (arr) => 
                                setFormData({ ...formData, dietary_restrictions: arr })
                              )
                            }
                          />
                          <Label htmlFor={`restriction-${restriction}`} className="text-sm font-normal cursor-pointer capitalize">
                            {restriction}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Food Preferences</CardTitle>
                  <CardDescription>What does {kidName} like and dislike?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="mb-3 block">Texture Preferences</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {TEXTURE_OPTIONS.map((texture) => (
                        <div key={texture} className="flex items-center space-x-2">
                          <Checkbox
                            id={`texture-pref-${texture}`}
                            checked={formData.texture_preferences.includes(texture)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.texture_preferences, texture, (arr) => 
                                setFormData({ ...formData, texture_preferences: arr })
                              )
                            }
                          />
                          <Label htmlFor={`texture-pref-${texture}`} className="text-xs font-normal cursor-pointer capitalize">
                            {texture}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Texture Dislikes</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {TEXTURE_OPTIONS.map((texture) => (
                        <div key={texture} className="flex items-center space-x-2">
                          <Checkbox
                            id={`texture-dis-${texture}`}
                            checked={formData.texture_dislikes.includes(texture)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.texture_dislikes, texture, (arr) => 
                                setFormData({ ...formData, texture_dislikes: arr })
                              )
                            }
                          />
                          <Label htmlFor={`texture-dis-${texture}`} className="text-xs font-normal cursor-pointer capitalize">
                            {texture}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Flavor Preferences</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {FLAVOR_OPTIONS.map((flavor) => (
                        <div key={flavor} className="flex items-center space-x-2">
                          <Checkbox
                            id={`flavor-${flavor}`}
                            checked={formData.flavor_preferences.includes(flavor)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.flavor_preferences, flavor, (arr) => 
                                setFormData({ ...formData, flavor_preferences: arr })
                              )
                            }
                          />
                          <Label htmlFor={`flavor-${flavor}`} className="text-xs font-normal cursor-pointer capitalize">
                            {flavor}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Foods {kidName} Always Eats</Label>
                    <Textarea
                      placeholder="List foods your child will eat regardless of the situation..."
                      value={formData.always_eats_foods.join(", ")}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        always_eats_foods: e.target.value.split(",").map(f => f.trim()).filter(Boolean)
                      })}
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label className="mb-3 block">Disliked Foods</Label>
                    <Textarea
                      placeholder="List foods your child refuses or strongly dislikes..."
                      value={formData.disliked_foods.join(", ")}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        disliked_foods: e.target.value.split(",").map(f => f.trim()).filter(Boolean)
                      })}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Eating Behavior & Goals</CardTitle>
                  <CardDescription>Understanding {kidName}'s eating habits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="mb-3 block">How would you describe their eating habits?</Label>
                    <RadioGroup value={formData.eating_behavior} onValueChange={(v) => setFormData({ ...formData, eating_behavior: v })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="very_picky" id="very_picky" />
                        <Label htmlFor="very_picky" className="font-normal cursor-pointer">Very picky (under 10 foods)</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="somewhat_selective" id="somewhat_selective" />
                        <Label htmlFor="somewhat_selective" className="font-normal cursor-pointer">Somewhat selective</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="eats_most_foods" id="eats_most_foods" />
                        <Label htmlFor="eats_most_foods" className="font-normal cursor-pointer">Eats most foods</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label className="mb-3 block">How often do they try new foods?</Label>
                    <RadioGroup value={formData.new_food_willingness} onValueChange={(v) => setFormData({ ...formData, new_food_willingness: v })}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="rarely" id="rarely" />
                        <Label htmlFor="rarely" className="font-normal cursor-pointer">Rarely</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="only_when_forced" id="only_when_forced" />
                        <Label htmlFor="only_when_forced" className="font-normal cursor-pointer">Only when encouraged</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="sometimes" id="sometimes" />
                        <Label htmlFor="sometimes" className="font-normal cursor-pointer">Sometimes</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="willing_to_explore" id="willing_to_explore" />
                        <Label htmlFor="willing_to_explore" className="font-normal cursor-pointer">Willing to explore</Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div>
                    <Label className="mb-3 block">Nutrition Concerns</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {NUTRITION_CONCERNS.map((concern) => (
                        <div key={concern} className="flex items-center space-x-2">
                          <Checkbox
                            id={`concern-${concern}`}
                            checked={formData.nutrition_concerns.includes(concern)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.nutrition_concerns, concern, (arr) => 
                                setFormData({ ...formData, nutrition_concerns: arr })
                              )
                            }
                          />
                          <Label htmlFor={`concern-${concern}`} className="text-sm font-normal cursor-pointer capitalize">
                            {concern.replace(/_/g, " ")}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Health & Nutrition Goals</Label>
                    <div className="space-y-2">
                      {HEALTH_GOALS.map((goal) => (
                        <div key={goal.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`goal-${goal.value}`}
                            checked={formData.health_goals.includes(goal.value)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.health_goals, goal.value, (arr) => 
                                setFormData({ ...formData, health_goals: arr })
                              )
                            }
                          />
                          <Label htmlFor={`goal-${goal.value}`} className="text-sm font-normal cursor-pointer">
                            {goal.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">What helps them try new foods?</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {HELPFUL_STRATEGIES.map((strategy) => (
                        <div key={strategy} className="flex items-center space-x-2">
                          <Checkbox
                            id={`strategy-${strategy}`}
                            checked={formData.helpful_strategies.includes(strategy)}
                            onCheckedChange={() => 
                              toggleArrayItem(formData.helpful_strategies, strategy, (arr) => 
                                setFormData({ ...formData, helpful_strategies: arr })
                              )
                            }
                          />
                          <Label htmlFor={`strategy-${strategy}`} className="text-xs font-normal cursor-pointer">
                            {strategy.replace(/_/g, " ")}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-3 block">Additional Behavioral Notes</Label>
                    <Textarea
                      placeholder="Any other information about feeding habits, therapy notes, cultural preferences..."
                      value={formData.behavioral_notes}
                      onChange={(e) => setFormData({ ...formData, behavioral_notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-primary" />
                    Review Profile
                  </CardTitle>
                  <CardDescription>Confirm {kidName}'s information before submitting</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formData.allergens.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Allergens</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {formData.allergens.map(allergen => (
                          <Badge key={allergen} variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {allergen}
                            {formData.allergen_severity[allergen] && ` (${formData.allergen_severity[allergen]})`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {formData.dietary_restrictions.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Dietary Restrictions</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {formData.dietary_restrictions.map(restriction => (
                          <Badge key={restriction} variant="secondary">{restriction}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {formData.health_goals.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Health Goals</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {formData.health_goals.map(goal => (
                          <Badge key={goal} variant="outline">{goal.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-sm text-muted-foreground">Eating Behavior</Label>
                    <p className="text-sm mt-1 capitalize">{formData.eating_behavior?.replace(/_/g, " ") || "Not specified"}</p>
                  </div>

                  {formData.texture_preferences.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Texture Preferences</Label>
                      <p className="text-sm mt-1 capitalize">{formData.texture_preferences.join(", ")}</p>
                    </div>
                  )}

                  {formData.flavor_preferences.length > 0 && (
                    <div>
                      <Label className="text-sm text-muted-foreground">Flavor Preferences</Label>
                      <p className="text-sm mt-1 capitalize">{formData.flavor_preferences.join(", ")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving}>
              <Check className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Complete Profile"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

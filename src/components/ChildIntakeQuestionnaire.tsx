import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, Sparkles, AlertTriangle } from "lucide-react";
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

const TEXTURE_OPTIONS = [
  "Soft/mushy", "Slimy", "Crunchy", "Chewy", "Lumpy", "Wet", "Foods touching each other"
];

export function ChildIntakeQuestionnaire({ open, onOpenChange, kidId, kidName, onComplete }: ChildIntakeQuestionnaireProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    gender: "",
    height_cm: null as number | null,
    weight_kg: null as number | null,
    allergens: [] as string[],
    allergen_severity: {} as Record<string, string>,
    cross_contamination_sensitive: false,
    dietary_restrictions: [] as string[],
    health_goals: [] as string[],
    nutrition_concerns: [] as string[],
    eating_behavior: "",
    new_food_willingness: "",
    behavioral_notes: "",
    texture_sensitivity_level: "",
    texture_dislikes: [] as string[],
    texture_preferences: [] as string[],
    preferred_preparations: [] as string[],
    favorite_foods: [] as string[],
    always_eats_foods: [] as string[],
    disliked_foods: [] as string[],
    pickiness_level: "",
  });

  const steps = [
    { title: "Basic Information", description: "Health & growth (30s)" },
    { title: "Allergies & Restrictions", description: "Safety first (45s)" },
    { title: "Eating Behavior", description: "Current habits (90s)" },
    { title: "Texture & Sensory", description: "Sensitivities (60s)" },
    { title: "Food Preferences", description: "What they eat (90s)" },
    { title: "Foods to Avoid", description: "Dislikes (optional)" },
    { title: "Review", description: "Confirm details" }
  ];

  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      // Auto-calculate pickiness level when leaving step 2
      if (currentStep === 2) {
        calculatePickinessLevel();
      }
      // Auto-calculate texture sensitivity when leaving step 3
      if (currentStep === 3) {
        calculateTextureSensitivity();
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const calculatePickinessLevel = () => {
    const behavior = formData.eating_behavior;
    const willingness = formData.new_food_willingness;
    
    let level = 'somewhat_picky';
    if (behavior === 'wide_variety' && willingness === 'willing') {
      level = 'adventurous';
    } else if (behavior === 'limited' || willingness === 'refuses') {
      level = 'extreme';
    } else if (behavior === 'very_limited' || willingness === 'very_hesitant') {
      level = 'very_picky';
    }
    
    setFormData({ ...formData, pickiness_level: level });
  };

  const calculateTextureSensitivity = () => {
    const dislikesCount = formData.texture_dislikes?.length || 0;
    
    let level = 'none';
    if (dislikesCount === 0) {
      level = 'none';
    } else if (dislikesCount <= 2) {
      level = 'mild';
    } else if (dislikesCount <= 4) {
      level = 'strong';
    } else {
      level = 'severe';
    }
    
    setFormData({ ...formData, texture_sensitivity_level: level });
  };

  const toggleArrayItem = (field: keyof typeof formData, item: string) => {
    const currentArray = formData[field] as string[];
    const newArray = currentArray.includes(item)
      ? currentArray.filter(i => i !== item)
      : [...currentArray, item];
    setFormData({ ...formData, [field]: newArray });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('kids')
        .update({
          gender: formData.gender || null,
          height_cm: formData.height_cm,
          weight_kg: formData.weight_kg,
          allergens: formData.allergens,
          allergen_severity: formData.allergen_severity,
          cross_contamination_sensitive: formData.cross_contamination_sensitive,
          dietary_restrictions: formData.dietary_restrictions,
          health_goals: formData.health_goals,
          nutrition_concerns: formData.nutrition_concerns,
          eating_behavior: formData.eating_behavior || null,
          new_food_willingness: formData.new_food_willingness || null,
          behavioral_notes: formData.behavioral_notes || null,
          texture_sensitivity_level: formData.texture_sensitivity_level || null,
          texture_dislikes: formData.texture_dislikes,
          texture_preferences: formData.texture_preferences,
          preferred_preparations: formData.preferred_preparations,
          favorite_foods: formData.favorite_foods,
          always_eats_foods: formData.always_eats_foods,
          disliked_foods: formData.disliked_foods,
          pickiness_level: formData.pickiness_level || null,
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
            5-minute evidence-based questionnaire for personalized meal planning
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

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* Section 1: Basic Information - Health & Growth */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div>
                <Label>Gender (Optional)</Label>
                <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Height (cm)</Label>
                  <Input 
                    type="number" 
                    placeholder="e.g., 120"
                    value={formData.height_cm || ''}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input 
                    type="number" 
                    placeholder="e.g., 25"
                    value={formData.weight_kg || ''}
                    onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Health Conditions or Growth Concerns</Label>
                <p className="text-sm text-muted-foreground mb-3">Select any that apply:</p>
                <div className="space-y-2">
                  {['Underweight', 'Overweight', 'Iron deficiency', 'Constipation', 'Diabetes', 'ADHD'].map((concern) => (
                    <div key={concern} className="flex items-center space-x-2">
                      <Checkbox 
                        id={concern}
                        checked={formData.nutrition_concerns.includes(concern)}
                        onCheckedChange={() => toggleArrayItem('nutrition_concerns', concern)}
                      />
                      <Label htmlFor={concern} className="font-normal cursor-pointer">{concern}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Health Goals (Optional)</Label>
                <div className="space-y-2">
                  {['Increase vegetable intake', 'More protein', 'Gain weight', 'Better nutrition', 'Reduce sugar'].map((goal) => (
                    <div key={goal} className="flex items-center space-x-2">
                      <Checkbox 
                        id={goal}
                        checked={formData.health_goals.includes(goal)}
                        onCheckedChange={() => toggleArrayItem('health_goals', goal)}
                      />
                      <Label htmlFor={goal} className="font-normal cursor-pointer">{goal}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section 2: Food Allergies & Dietary Restrictions */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Critical Safety Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label className="mb-3 block">Known Food Allergies</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {ALLERGENS.map((allergen) => (
                        <div key={allergen} className="flex items-center space-x-2">
                          <Checkbox
                            id={allergen}
                            checked={formData.allergens.includes(allergen)}
                            onCheckedChange={() => toggleArrayItem('allergens', allergen)}
                          />
                          <Label htmlFor={allergen} className="text-sm font-normal cursor-pointer capitalize">
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
                          <Select
                            value={formData.allergen_severity[allergen] || ""}
                            onValueChange={(v) => 
                              setFormData({ 
                                ...formData, 
                                allergen_severity: { ...formData.allergen_severity, [allergen]: v }
                              })
                            }
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mild">Mild</SelectItem>
                              <SelectItem value="moderate">Moderate</SelectItem>
                              <SelectItem value="severe">Severe</SelectItem>
                            </SelectContent>
                          </Select>
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
                            id={restriction}
                            checked={formData.dietary_restrictions.includes(restriction)}
                            onCheckedChange={() => toggleArrayItem('dietary_restrictions', restriction)}
                          />
                          <Label htmlFor={restriction} className="text-sm font-normal cursor-pointer capitalize">
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

          {/* Section 3: Eating Behavior & Pickiness Assessment */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block">How would you describe {kidName}'s current eating habits?</Label>
                <p className="text-sm text-muted-foreground mb-3">Select the option that best describes their variety:</p>
                <div className="space-y-2">
                  {[
                    { value: 'wide_variety', label: 'Eats a wide variety (30+ different foods regularly)' },
                    { value: 'moderate', label: 'Eats moderately (15-30 foods)' },
                    { value: 'limited', label: 'Limited variety (10-15 foods)' },
                    { value: 'very_limited', label: 'Very limited (fewer than 10 foods)' }
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={option.value}
                        name="eating_behavior"
                        value={option.value}
                        checked={formData.eating_behavior === option.value}
                        onChange={(e) => setFormData({ ...formData, eating_behavior: e.target.value })}
                        className="cursor-pointer"
                      />
                      <Label htmlFor={option.value} className="font-normal cursor-pointer">{option.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Eating Habits (Select all that apply)</Label>
                <div className="space-y-2">
                  {[
                    'Eats the same foods every day',
                    'Refuses to try new foods',
                    'Gets upset when new foods are presented',
                    'Only eats specific brands',
                    'Food must be prepared a certain way',
                    'Refuses mixed foods (foods touching)'
                  ].map((habit) => (
                    <div key={habit} className="flex items-center space-x-2">
                      <Checkbox 
                        id={habit}
                        checked={formData.behavioral_notes.includes(habit)}
                        onCheckedChange={(checked) => {
                          const current = formData.behavioral_notes;
                          const habits = current.split(',').map(h => h.trim()).filter(Boolean);
                          const newNotes = checked 
                            ? [...habits, habit].join(', ')
                            : habits.filter(h => h !== habit).join(', ');
                          setFormData({ ...formData, behavioral_notes: newNotes });
                        }}
                      />
                      <Label htmlFor={habit} className="font-normal cursor-pointer">{habit}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Willingness to try new foods</Label>
                <div className="space-y-2">
                  {[
                    { value: 'willing', label: 'Willing and curious about new foods' },
                    { value: 'hesitant', label: 'Hesitant but will sometimes try' },
                    { value: 'very_hesitant', label: 'Very hesitant, rarely tries new foods' },
                    { value: 'refuses', label: 'Refuses to try new foods entirely' }
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={option.value}
                        name="new_food_willingness"
                        value={option.value}
                        checked={formData.new_food_willingness === option.value}
                        onChange={(e) => setFormData({ ...formData, new_food_willingness: e.target.value })}
                        className="cursor-pointer"
                      />
                      <Label htmlFor={option.value} className="font-normal cursor-pointer">{option.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section 4: Texture & Sensory Preferences */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <Label className="mb-3 block">Does {kidName} have texture sensitivities?</Label>
                <p className="text-sm text-muted-foreground mb-3">How sensitive are they to food textures?</p>
                <div className="space-y-2">
                  {[
                    { value: 'none', label: 'No texture issues - eats all textures' },
                    { value: 'mild', label: 'Mild - dislikes 1-2 specific textures' },
                    { value: 'strong', label: 'Strong - avoids several textures' },
                    { value: 'severe', label: 'Severe - texture aversions significantly limit diet' }
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id={`texture_sens_${option.value}`}
                        name="texture_sensitivity_level"
                        value={option.value}
                        checked={formData.texture_sensitivity_level === option.value}
                        onChange={(e) => setFormData({ ...formData, texture_sensitivity_level: e.target.value })}
                        className="cursor-pointer"
                      />
                      <Label htmlFor={`texture_sens_${option.value}`} className="font-normal cursor-pointer">{option.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* CONDITIONAL: Only show if texture sensitivity is strong or severe */}
              {(formData.texture_sensitivity_level === 'strong' || formData.texture_sensitivity_level === 'severe') && (
                <div className="bg-muted/50 p-4 rounded-lg border">
                  <Label className="mb-3 block">Which textures does {kidName} avoid?</Label>
                  <div className="space-y-2">
                    {TEXTURE_OPTIONS.map((texture) => (
                      <div key={texture} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`avoid_${texture}`}
                          checked={formData.texture_dislikes.includes(texture)}
                          onCheckedChange={() => toggleArrayItem('texture_dislikes', texture)}
                        />
                        <Label htmlFor={`avoid_${texture}`} className="font-normal cursor-pointer">{texture}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="mb-3 block">Preferred Food Preparations (Optional)</Label>
                <p className="text-sm text-muted-foreground mb-3">How does {kidName} prefer their food served?</p>
                <div className="space-y-2">
                  {['Foods must be separate (not touching)', 'Only cold foods', 'Only hot/warm foods', 'With dipping sauces', 'Cut into specific shapes', 'Pureed or blended'].map((prep) => (
                    <div key={prep} className="flex items-center space-x-2">
                      <Checkbox 
                        id={prep}
                        checked={formData.preferred_preparations.includes(prep)}
                        onCheckedChange={() => toggleArrayItem('preferred_preparations', prep)}
                      />
                      <Label htmlFor={prep} className="font-normal cursor-pointer">{prep}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-3 block">Texture Preferences (Foods they DO like)</Label>
                <div className="space-y-2">
                  {['Crunchy', 'Soft', 'Smooth', 'Chewy', 'Crispy'].map((texture) => (
                    <div key={texture} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`prefer_${texture}`}
                        checked={formData.texture_preferences.includes(texture)}
                        onCheckedChange={() => toggleArrayItem('texture_preferences', texture)}
                      />
                      <Label htmlFor={`prefer_${texture}`} className="font-normal cursor-pointer">{texture}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Food Preferences by Category */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">Tell us what {kidName} regularly eats. This helps us suggest similar foods.</p>
              
              <div>
                <Label className="mb-2 block">Favorite Foods (all categories)</Label>
                <Input 
                  placeholder="e.g., apples, chicken, pasta, yogurt"
                  value={formData.favorite_foods.join(', ')}
                  onChange={(e) => setFormData({ ...formData, favorite_foods: e.target.value.split(',').map(f => f.trim()).filter(Boolean) })}
                />
              </div>

              <div>
                <Label className="mb-2 block">Foods they eat EVERY day (if any)</Label>
                <Input 
                  placeholder="e.g., chicken nuggets, mac and cheese"
                  value={formData.always_eats_foods.join(', ')}
                  onChange={(e) => setFormData({ ...formData, always_eats_foods: e.target.value.split(',').map(f => f.trim()).filter(Boolean) })}
                />
                <p className="text-sm text-muted-foreground mt-1">These are "safe foods" we'll build from</p>
              </div>
            </div>
          )}

          {/* Section 6: Foods to Avoid & Dislikes (Optional) */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div className="bg-muted/30 p-4 rounded-lg border">
                <p className="text-sm font-medium mb-2">✨ This section is optional</p>
                <p className="text-sm text-muted-foreground">You can skip this or add specific foods to avoid. This helps our AI make better suggestions.</p>
              </div>

              <div>
                <Label className="mb-2 block">Foods {kidName} strongly dislikes or refuses</Label>
                <Input 
                  placeholder="e.g., mushrooms, onions, tomatoes"
                  value={formData.disliked_foods.join(', ')}
                  onChange={(e) => setFormData({ ...formData, disliked_foods: e.target.value.split(',').map(f => f.trim()).filter(Boolean) })}
                />
                <p className="text-sm text-muted-foreground mt-1">Separate with commas</p>
              </div>
            </div>
          )}

          {/* Section 7: Review */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-primary" />
                    Profile Summary
                  </CardTitle>
                  <CardDescription>Review {kidName}'s information before completing</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formData.allergens.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2 text-destructive">⚠️ Allergens</h4>
                      <div className="flex flex-wrap gap-2">
                        {formData.allergens.map((allergen) => (
                          <Badge key={allergen} variant="destructive" className="capitalize">
                            {allergen} ({formData.allergen_severity[allergen] || 'unknown'})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {formData.eating_behavior && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Eating Habits</h4>
                      <p className="text-sm">{formData.eating_behavior.replace('_', ' ')}</p>
                      {formData.pickiness_level && (
                        <Badge variant="outline" className="mt-1">{formData.pickiness_level.replace('_', ' ')}</Badge>
                      )}
                    </div>
                  )}

                  {formData.favorite_foods.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Favorite Foods</h4>
                      <p className="text-sm">{formData.favorite_foods.join(', ')}</p>
                    </div>
                  )}

                  {formData.texture_sensitivity_level && (
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Texture Sensitivity</h4>
                      <Badge variant="outline">{formData.texture_sensitivity_level}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          <div className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {steps.length}
          </div>

          {currentStep < steps.length - 1 ? (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Complete Profile"}
              <Check className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ChefHat, Clock, Users, ArrowRight, Utensils } from 'lucide-react';
import {
  MealPlanInput,
  DietaryRestriction,
  Allergy,
  PickyEaterLevel,
  CookingSkillLevel,
  KitchenEquipment,
} from '@/types/mealPlanGenerator';
import { generateMealPlan } from '@/lib/mealPlanGenerator/mealPlanGenerator';
import { v4 as uuidv4 } from 'uuid';
import { SEOHead } from '@/components/SEOHead';
import { getPageSEO } from '@/lib/seo-config';

const DIETARY_RESTRICTIONS: { id: DietaryRestriction; label: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'gluten_free', label: 'Gluten-Free' },
  { id: 'dairy_free', label: 'Dairy-Free' },
  { id: 'nut_free', label: 'Nut-Free' },
  { id: 'egg_free', label: 'Egg-Free' },
  { id: 'soy_free', label: 'Soy-Free' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'low_carb', label: 'Low-Carb' },
  { id: 'keto', label: 'Keto' },
];

const ALLERGIES: { id: Allergy; label: string }[] = [
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'tree_nuts', label: 'Tree Nuts' },
  { id: 'milk', label: 'Milk' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'wheat', label: 'Wheat' },
  { id: 'soy', label: 'Soy' },
  { id: 'fish', label: 'Fish' },
  { id: 'shellfish', label: 'Shellfish' },
];

const KITCHEN_EQUIPMENT: { id: KitchenEquipment; label: string }[] = [
  { id: 'slow_cooker', label: 'Slow Cooker' },
  { id: 'instant_pot', label: 'Instant Pot' },
  { id: 'air_fryer', label: 'Air Fryer' },
  { id: 'food_processor', label: 'Food Processor' },
  { id: 'blender', label: 'Blender' },
  { id: 'stand_mixer', label: 'Stand Mixer' },
  { id: 'rice_cooker', label: 'Rice Cooker' },
  { id: 'grill', label: 'Grill' },
];

export default function MealPlanGenerator() {
  const navigate = useNavigate();
  const [sessionId] = useState(() => uuidv4());

  const [formData, setFormData] = useState<Partial<MealPlanInput>>({
    familySize: 4,
    adults: 2,
    children: 2,
    childrenAges: [6, 9],
    dietaryRestrictions: [],
    allergies: [],
    pickyEaterLevel: 'moderate',
    cookingTimeAvailable: 45,
    cookingSkillLevel: 'intermediate',
    kitchenEquipment: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.adults || formData.adults < 0) {
      newErrors.adults = 'Please enter the number of adults';
    }

    if (!formData.children || formData.children < 0) {
      newErrors.children = 'Please enter the number of children';
    }

    const familySize = (formData.adults || 0) + (formData.children || 0);
    if (familySize === 0) {
      newErrors.familySize = 'Family size must be at least 1';
    }

    if (!formData.pickyEaterLevel) {
      newErrors.pickyEaterLevel = 'Please select a picky eater level';
    }

    if (!formData.cookingTimeAvailable || formData.cookingTimeAvailable < 10) {
      newErrors.cookingTime = 'Please enter available cooking time (at least 10 minutes)';
    }

    if (!formData.cookingSkillLevel) {
      newErrors.skillLevel = 'Please select your cooking skill level';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsGenerating(true);

    try {
      const input: MealPlanInput = {
        familySize: (formData.adults || 0) + (formData.children || 0),
        adults: formData.adults || 0,
        children: formData.children || 0,
        childrenAges: formData.childrenAges || [],
        dietaryRestrictions: formData.dietaryRestrictions || [],
        allergies: formData.allergies || [],
        pickyEaterLevel: formData.pickyEaterLevel as PickyEaterLevel,
        cookingTimeAvailable: formData.cookingTimeAvailable || 45,
        cookingSkillLevel: formData.cookingSkillLevel as CookingSkillLevel,
        kitchenEquipment: formData.kitchenEquipment || [],
      };

      // Generate meal plan
      const mealPlan = generateMealPlan(input, sessionId);

      // Navigate to results
      navigate('/meal-plan/results', {
        state: {
          sessionId,
          input,
          mealPlan,
        },
      });
    } catch (error) {
      console.error('Error generating meal plan:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to generate meal plan. Please try again.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDietaryRestrictionToggle = (restriction: DietaryRestriction) => {
    const current = formData.dietaryRestrictions || [];
    const updated = current.includes(restriction)
      ? current.filter((r) => r !== restriction)
      : [...current, restriction];
    setFormData({ ...formData, dietaryRestrictions: updated });
  };

  const handleAllergyToggle = (allergy: Allergy) => {
    const current = formData.allergies || [];
    const updated = current.includes(allergy)
      ? current.filter((a) => a !== allergy)
      : [...current, allergy];
    setFormData({ ...formData, allergies: updated });
  };

  const handleEquipmentToggle = (equipment: KitchenEquipment) => {
    const current = formData.kitchenEquipment || [];
    const updated = current.includes(equipment)
      ? current.filter((e) => e !== equipment)
      : [...current, equipment];
    setFormData({ ...formData, kitchenEquipment: updated });
  };

  return (
    <>
      <SEOHead {...getPageSEO("mealPlan")!} />

      <main id="main-content" className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <ChefHat className="w-12 h-12 text-purple-600" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              5-Day Meal Plan Generator
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Get a personalized meal plan with recipes and grocery list tailored to your family's
              needs - including picky eaters!
            </p>
          </div>

          {/* Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <Card>
              <CardContent className="pt-6 text-center">
                <Utensils className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Picky Eater Friendly</h3>
                <p className="text-sm text-gray-600">Meals your kids will actually eat</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Time Saving</h3>
                <p className="text-sm text-gray-600">Meals that fit your schedule</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Users className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Family Sized</h3>
                <p className="text-sm text-gray-600">Scaled to your family</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Form */}
          <Card>
            <CardHeader>
              <CardTitle>Tell us about your family</CardTitle>
              <CardDescription>
                We'll create a personalized 5-day meal plan just for you
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Family Composition */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Family Composition</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="adults">Number of Adults</Label>
                      <Input
                        id="adults"
                        type="number"
                        min="0"
                        max="10"
                        value={formData.adults || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, adults: parseInt(e.target.value) || 0 })
                        }
                        className={errors.adults ? 'border-red-500' : ''}
                      />
                      {errors.adults && (
                        <p className="text-sm text-red-500">{errors.adults}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="children">Number of Children</Label>
                      <Input
                        id="children"
                        type="number"
                        min="0"
                        max="10"
                        value={formData.children || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, children: parseInt(e.target.value) || 0 })
                        }
                        className={errors.children ? 'border-red-500' : ''}
                      />
                      {errors.children && (
                        <p className="text-sm text-red-500">{errors.children}</p>
                      )}
                    </div>
                  </div>

                  {errors.familySize && (
                    <p className="text-sm text-red-500">{errors.familySize}</p>
                  )}
                </div>

                {/* Picky Eater Level */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Picky Eater Level</h3>
                  <p className="text-sm text-gray-600">
                    How adventurous are your eaters?
                  </p>

                  <Select
                    value={formData.pickyEaterLevel}
                    onValueChange={(value) =>
                      setFormData({ ...formData, pickyEaterLevel: value as PickyEaterLevel })
                    }
                  >
                    <SelectTrigger className={errors.pickyEaterLevel ? 'border-red-500' : ''}>
                      <SelectValue placeholder="Select picky eater level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not Picky - Will try anything!</SelectItem>
                      <SelectItem value="mild">Mildly Picky - Prefers familiar foods</SelectItem>
                      <SelectItem value="moderate">Moderately Picky - Limited food variety</SelectItem>
                      <SelectItem value="severe">Very Picky - Extremely selective</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.pickyEaterLevel && (
                    <p className="text-sm text-red-500">{errors.pickyEaterLevel}</p>
                  )}
                </div>

                {/* Cooking Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Cooking Details</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cookingTime">Available Cooking Time (minutes/day)</Label>
                      <Input
                        id="cookingTime"
                        type="number"
                        min="10"
                        max="180"
                        value={formData.cookingTimeAvailable || ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            cookingTimeAvailable: parseInt(e.target.value) || 45,
                          })
                        }
                        className={errors.cookingTime ? 'border-red-500' : ''}
                      />
                      {errors.cookingTime && (
                        <p className="text-sm text-red-500">{errors.cookingTime}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="skillLevel">Cooking Skill Level</Label>
                      <Select
                        value={formData.cookingSkillLevel}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            cookingSkillLevel: value as CookingSkillLevel,
                          })
                        }
                      >
                        <SelectTrigger className={errors.skillLevel ? 'border-red-500' : ''}>
                          <SelectValue placeholder="Select skill level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                      {errors.skillLevel && (
                        <p className="text-sm text-red-500">{errors.skillLevel}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Kitchen Equipment */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Kitchen Equipment (Optional)</h3>
                  <p className="text-sm text-gray-600">
                    Select any special equipment you have available
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {KITCHEN_EQUIPMENT.map((equipment) => (
                      <div key={equipment.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={equipment.id}
                          checked={(formData.kitchenEquipment || []).includes(equipment.id)}
                          onCheckedChange={() => handleEquipmentToggle(equipment.id)}
                        />
                        <Label htmlFor={equipment.id} className="text-sm cursor-pointer">
                          {equipment.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dietary Restrictions */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Dietary Restrictions (Optional)</h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {DIETARY_RESTRICTIONS.map((restriction) => (
                      <div key={restriction.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={restriction.id}
                          checked={(formData.dietaryRestrictions || []).includes(restriction.id)}
                          onCheckedChange={() => handleDietaryRestrictionToggle(restriction.id)}
                        />
                        <Label htmlFor={restriction.id} className="text-sm cursor-pointer">
                          {restriction.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Allergies */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Food Allergies (Optional)</h3>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {ALLERGIES.map((allergy) => (
                      <div key={allergy.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={allergy.id}
                          checked={(formData.allergies || []).includes(allergy.id)}
                          onCheckedChange={() => handleAllergyToggle(allergy.id)}
                        />
                        <Label htmlFor={allergy.id} className="text-sm cursor-pointer">
                          {allergy.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit Error */}
                {errors.submit && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{errors.submit}</p>
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    'Generating Your Meal Plan...'
                  ) : (
                    <>
                      Generate My 5-Day Meal Plan
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Trust Indicators */}
          <div className="mt-8 text-center text-sm text-gray-600">
            <p>
              100% free · No credit card required · Instant results
            </p>
          </div>
        </motion.div>
      </main>
    </>
  );
}

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
import { Calculator, DollarSign, Users, MapPin, ArrowRight } from 'lucide-react';
import { BudgetCalculatorInput, DietaryRestriction } from '@/types/budgetCalculator';
import { calculateBudget, generateBudgetMealSuggestions } from '@/lib/budgetCalculator/calculator';
import { v4 as uuidv4 } from 'uuid';
import { SEOHead } from '@/components/SEOHead';
import { getPageSEO } from '@/lib/seo-config';

const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

const DIETARY_RESTRICTIONS: { id: DietaryRestriction; label: string; description: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian', description: 'No meat or fish' },
  { id: 'vegan', label: 'Vegan', description: 'No animal products' },
  { id: 'gluten_free', label: 'Gluten-Free', description: 'No wheat, barley, or rye' },
  { id: 'dairy_free', label: 'Dairy-Free', description: 'No milk or dairy products' },
  { id: 'nut_free', label: 'Nut-Free', description: 'No peanuts or tree nuts' },
  { id: 'halal', label: 'Halal', description: 'Islamic dietary laws' },
  { id: 'kosher', label: 'Kosher', description: 'Jewish dietary laws' },
];

export default function BudgetCalculator() {
  const navigate = useNavigate();
  const [sessionId] = useState(() => uuidv4());

  const [formData, setFormData] = useState<Partial<BudgetCalculatorInput>>({
    familySize: 4,
    adults: 2,
    children: 2,
    state: '',
    zipCode: '',
    dietaryRestrictions: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

    if (!formData.state) {
      newErrors.state = 'Please select your state';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const input: BudgetCalculatorInput = {
        familySize: (formData.adults || 0) + (formData.children || 0),
        adults: formData.adults || 0,
        children: formData.children || 0,
        state: formData.state,
        zipCode: formData.zipCode,
        dietaryRestrictions: formData.dietaryRestrictions || [],
      };

      // Calculate budget
      const calculation = calculateBudget(input);

      // Generate meal suggestions
      const mealSuggestions = generateBudgetMealSuggestions(
        input.familySize,
        input.dietaryRestrictions
      );

      // Navigate to results with data
      navigate('/budget-calculator/results', {
        state: {
          sessionId,
          input,
          calculation,
          recommendedMeals: mealSuggestions,
        },
      });
    } catch (error) {
      console.error('Error calculating budget:', error);
      setErrors({ submit: 'An error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDietaryRestrictionToggle = (restriction: DietaryRestriction) => {
    const current = formData.dietaryRestrictions || [];
    const updated = current.includes(restriction)
      ? current.filter((r) => r !== restriction)
      : [...current, restriction];

    setFormData({ ...formData, dietaryRestrictions: updated });
  };

  return (
    <>
      <SEOHead {...getPageSEO("budgetCalculator")!} />

      <main id="main-content" className="min-h-screen bg-gradient-to-b from-green-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto"
        >
          {/* Header */}
          <div className="text-center mb-10">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-green-100 rounded-full">
                <Calculator className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Grocery Budget Calculator
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Calculate your family's realistic grocery budget based on official USDA food cost
              data. Get personalized recommendations and money-saving tips.
            </p>
          </div>

          {/* Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <Card>
              <CardContent className="pt-6 text-center">
                <DollarSign className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">USDA-Based Data</h3>
                <p className="text-sm text-gray-600">Official 2024 food cost data</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Personalized</h3>
                <p className="text-sm text-gray-600">Custom for your family size</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <MapPin className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <h3 className="font-semibold mb-1">Regional Pricing</h3>
                <p className="text-sm text-gray-600">Adjusted for your location</p>
              </CardContent>
            </Card>
          </div>

          {/* Main Form */}
          <Card>
            <CardHeader>
              <CardTitle>Tell us about your family</CardTitle>
              <CardDescription>
                We'll calculate a personalized grocery budget based on your family's needs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
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

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-900">
                      <strong>Total Family Size:</strong>{' '}
                      {(formData.adults || 0) + (formData.children || 0)} people
                    </p>
                  </div>
                </div>

                {/* Location */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Location</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="state">State *</Label>
                      <Select
                        value={formData.state}
                        onValueChange={(value) => setFormData({ ...formData, state: value })}
                      >
                        <SelectTrigger id="state" className={errors.state ? 'border-red-500' : ''} aria-label="Select your state">
                          <SelectValue placeholder="Select your state" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {US_STATES.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.state && <p className="text-sm text-red-500">{errors.state}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="zipCode">Zip Code (Optional)</Label>
                      <Input
                        id="zipCode"
                        type="text"
                        placeholder="12345"
                        maxLength={5}
                        value={formData.zipCode || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, zipCode: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Dietary Restrictions */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Dietary Restrictions (Optional)</h3>
                  <p className="text-sm text-gray-600">
                    Select any dietary restrictions to get more accurate cost estimates
                  </p>

                  <div className="space-y-3">
                    {DIETARY_RESTRICTIONS.map((restriction) => (
                      <div key={restriction.id} className="flex items-start space-x-3">
                        <Checkbox
                          id={restriction.id}
                          checked={(formData.dietaryRestrictions || []).includes(restriction.id)}
                          onCheckedChange={() => handleDietaryRestrictionToggle(restriction.id)}
                        />
                        <div className="flex-1">
                          <Label
                            htmlFor={restriction.id}
                            className="font-medium cursor-pointer"
                          >
                            {restriction.label}
                          </Label>
                          <p className="text-sm text-gray-500">{restriction.description}</p>
                        </div>
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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    'Calculating...'
                  ) : (
                    <>
                      Calculate My Budget
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
              Based on official USDA Food Plans data (2024) · Regional cost adjustments included
            </p>
          </div>
        </motion.div>
      </main>
    </>
  );
}

// @ts-nocheck
import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChefHat,
  Clock,
  Users,
  Download,
  Share2,
  ArrowLeft,
  CheckCircle2,
  ShoppingCart,
  Calendar,
  Lightbulb,
  DollarSign,
} from 'lucide-react';
import { MealPlanInput, MealPlanResult, GeneratedMeal } from '@/types/mealPlanGenerator';
import { formatCurrency } from '@/lib/budgetCalculator/calculator';
import { saveMealPlanGeneration } from '@/lib/mealPlanGenerator/supabaseIntegration';

interface LocationState {
  sessionId: string;
  input: MealPlanInput;
  mealPlan: MealPlanResult;
}

export default function MealPlanGeneratorResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;

  const [planId, setPlanId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);

  useEffect(() => {
    if (!state || !state.mealPlan) {
      navigate('/meal-plan');
      return;
    }

    // Celebration confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    // Save to database
    const savePlan = async () => {
      try {
        const id = await saveMealPlanGeneration(state.sessionId, state.input, state.mealPlan);
        setPlanId(id);
      } catch (error) {
        console.error('Error saving meal plan:', error);
      }
    };
    savePlan();
  }, [state, navigate]);

  if (!state || !state.mealPlan) {
    return null;
  }

  const { input, mealPlan } = state;

  const getDayName = (day: number): string => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days[day - 1] || `Day ${day}`;
  };

  return (
    <>
      <Helmet>
        <title>Your 5-Day Meal Plan | TryEatPal Meal Plan Generator</title>
        <meta
          name="description"
          content="Your personalized 5-day meal plan with recipes, grocery list, and family-friendly tips."
        />
      </Helmet>

      <div id="main-content" className="min-h-screen bg-gradient-to-b from-purple-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Back Button */}
          <Link to="/meal-plan">
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Start Over
            </Button>
          </Link>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-10"
          >
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-purple-100 rounded-full">
                <ChefHat className="w-12 h-12 text-purple-600" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Your 5-Day Meal Plan is Ready!
            </h1>
            <p className="text-xl text-gray-600">
              Personalized for your family of {input.familySize}
            </p>
          </motion.div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-2 border-purple-500">
                <CardHeader className="pb-3">
                  <CardDescription>Total Estimated Cost</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-600">
                    {formatCurrency(mealPlan.totalEstimatedCost)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">For 5 dinners</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Avg Cost Per Meal</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {formatCurrency(mealPlan.averageCostPerMeal)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Per dinner</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Avg Time Per Meal</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {Math.round(mealPlan.averageTimePerMeal)} min
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Prep + cook time</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Grocery Items</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {mealPlan.groceryList.items.length}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Unique ingredients</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Main Content Tabs */}
          <Tabs defaultValue="meals" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:w-[600px] lg:mx-auto">
              <TabsTrigger value="meals">
                <Calendar className="w-4 h-4 mr-2" />
                Meal Plan
              </TabsTrigger>
              <TabsTrigger value="grocery">
                <ShoppingCart className="w-4 h-4 mr-2" />
                Grocery List
              </TabsTrigger>
              <TabsTrigger value="tips">
                <Lightbulb className="w-4 h-4 mr-2" />
                Tips
              </TabsTrigger>
            </TabsList>

            {/* Meals Tab */}
            <TabsContent value="meals" className="space-y-6">
              {mealPlan.meals.map((meal, index) => (
                <motion.div
                  key={meal.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{getDayName(meal.day)}</Badge>
                            <Badge className="capitalize">{meal.difficulty}</Badge>
                            {meal.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <CardTitle className="text-2xl">{meal.name}</CardTitle>
                          <CardDescription className="mt-2">
                            {meal.description}
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">
                            {formatCurrency(meal.estimatedCost)}
                          </div>
                          <div className="text-sm text-gray-500">total cost</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>Prep: {meal.prepTime} min</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>Cook: {meal.cookTime} min</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          <span>{meal.servings} servings</span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-6">
                      {/* Why It Works */}
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <h4 className="font-semibold text-purple-900 mb-2">
                          🎯 Why This Works for Picky Eaters:
                        </h4>
                        <p className="text-sm text-purple-800">{meal.whyItWorks}</p>
                      </div>

                      {/* Ingredients */}
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <ShoppingCart className="w-4 h-4" />
                          Ingredients
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {meal.ingredients.map((ing, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 bg-gray-50 rounded"
                            >
                              <span className="text-sm">
                                {ing.amount} {ing.unit} {ing.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {formatCurrency(ing.estimatedCost || 0)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Instructions */}
                      <div>
                        <h4 className="font-semibold mb-3">Instructions</h4>
                        <ol className="space-y-3">
                          {meal.instructions.map((step, idx) => (
                            <li key={idx} className="flex gap-3">
                              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                                {idx + 1}
                              </span>
                              <span className="text-sm text-gray-700 pt-0.5">{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* Kid-Friendly Tips */}
                      {meal.kidFriendlyTips && meal.kidFriendlyTips.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-3">👶 Kid-Friendly Tips</h4>
                          <ul className="space-y-2">
                            {meal.kidFriendlyTips.map((tip, idx) => (
                              <li key={idx} className="flex gap-2 text-sm text-gray-700">
                                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Leftover Ideas */}
                      {meal.leftoverIdeas && meal.leftoverIdeas.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-3">♻️ Leftover Ideas</h4>
                          <ul className="space-y-2">
                            {meal.leftoverIdeas.map((idea, idx) => (
                              <li key={idx} className="flex gap-2 text-sm text-gray-700">
                                <span className="text-purple-600">•</span>
                                <span>{idea}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </TabsContent>

            {/* Grocery List Tab */}
            <TabsContent value="grocery" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Shopping List</CardTitle>
                  <CardDescription>
                    Organized by store aisle for easy shopping. Total cost:{' '}
                    {formatCurrency(mealPlan.groceryList.totalEstimatedCost)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {mealPlan.groceryList.organizedByStore.map((section) => (
                      <div key={section.aisle}>
                        <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5 text-purple-600" />
                          {section.aisle}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {section.items.map((item, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {item.amount} {item.unit} {item.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  Used in: Day {item.usedInMeals.join(', ')}
                                </div>
                              </div>
                              <div className="text-sm font-semibold text-gray-900">
                                {formatCurrency(item.estimatedCost)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tips Tab */}
            <TabsContent value="tips" className="space-y-6">
              {/* Prep Ahead Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-purple-600" />
                    Prep-Ahead Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {mealPlan.prepAheadTips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Time-Saving Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    Time-Saving Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {mealPlan.timeSavingTips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Budget Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    Budget Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {mealPlan.budgetTips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Picky Eater Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ChefHat className="w-5 h-5 text-orange-600" />
                    Picky Eater Tips
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {mealPlan.pickyEaterTips.map((tip, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-gray-700">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* CTA Section */}
          <Card className="bg-gradient-to-r from-purple-500 to-pink-500 text-white mt-10">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <h2 className="text-3xl font-bold">
                  Ready to Make Meal Planning Even Easier?
                </h2>
                <p className="text-lg opacity-90">
                  TryEatPal automates meal planning, generates grocery lists, and tracks what your
                  kids actually eat - all in one app.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Button size="lg" variant="secondary" onClick={() => setShowEmailModal(true)}>
                    <Download className="w-5 h-5 mr-2" />
                    Download Full Meal Plan PDF
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="bg-white text-purple-600 hover:bg-gray-100"
                    onClick={() => setShowEmailModal(true)}
                  >
                    Start Free Trial
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Share Section */}
          <div className="text-center mt-6">
            <p className="text-gray-600 mb-4">
              Found this helpful? Share with friends and family!
            </p>
            <Button variant="outline" onClick={() => setShowEmailModal(true)}>
              <Share2 className="w-4 h-4 mr-2" />
              Share Meal Plan
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

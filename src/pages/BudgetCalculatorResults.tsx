import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DollarSign,
  TrendingDown,
  ShoppingCart,
  Calendar,
  Download,
  Share2,
  ArrowLeft,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import {
  BudgetCalculatorInput,
  BudgetCalculation,
  BudgetResult,
  BudgetMealSuggestion,
} from '@/types/budgetCalculator';
import { formatCurrency, calculateSavingsPercentage } from '@/lib/budgetCalculator/calculator';
import { saveBudgetCalculation, trackBudgetPDFDownload } from '@/lib/budgetCalculator/supabaseIntegration';
import { downloadBudgetPDFReport } from '@/lib/budgetCalculator/pdfGenerator';
import { EmailCaptureModal } from '@/components/budget/EmailCaptureModal';
import { ShareButtons } from '@/components/budget/ShareButtons';
import { toast } from 'sonner';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface LocationState {
  sessionId: string;
  input: BudgetCalculatorInput;
  calculation: BudgetCalculation;
  recommendedMeals: BudgetMealSuggestion[];
}

export default function BudgetCalculatorResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState;

  const [calculationId, setCalculationId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  useEffect(() => {
    if (!state || !state.calculation) {
      navigate('/budget-calculator');
      return;
    }

    // Celebration confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    // Save to database
    const saveCalculation = async () => {
      try {
        const id = await saveBudgetCalculation(state.sessionId, state.input, state.calculation);
        setCalculationId(id);
      } catch (error) {
        console.error('Error saving calculation:', error);
      }
    };
    saveCalculation();
  }, [state, navigate]);

  if (!state || !state.calculation) {
    return null;
  }

  const { input, calculation, recommendedMeals } = state;

  const handleDownloadPDF = async () => {
    if (!emailCaptured) {
      setShowEmailModal(true);
      return;
    }

    setIsDownloadingPDF(true);
    try {
      await downloadBudgetPDFReport(input, calculation, recommendedMeals, {
        name: userName || undefined,
      });

      if (calculationId) {
        await trackBudgetPDFDownload(calculationId);
      }

      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleEmailCaptured = (email: string, name: string) => {
    setUserEmail(email);
    setUserName(name);
    setEmailCaptured(true);
  };

  // Prepare chart data
  const weeklyBreakdownData = [
    { name: 'Groceries', value: calculation.weeklyBreakdown.groceries, fill: '#10b981' },
    { name: 'Meal Prep', value: calculation.weeklyBreakdown.mealPrep, fill: '#3b82f6' },
    { name: 'Snacks', value: calculation.weeklyBreakdown.snacks, fill: '#f59e0b' },
    { name: 'Beverages', value: calculation.weeklyBreakdown.beverages, fill: '#8b5cf6' },
  ];

  const budgetComparisonData = [
    {
      name: 'Your Budget',
      monthly: calculation.recommendedMonthlyBudget,
      fill: '#10b981',
    },
    {
      name: 'Meal Kits',
      monthly: calculation.recommendedMonthlyBudget + calculation.vsMealKitsSavings,
      fill: '#ef4444',
    },
    {
      name: 'Dining Out',
      monthly: calculation.recommendedMonthlyBudget + calculation.vsDiningOutSavings,
      fill: '#f59e0b',
    },
  ];

  const planComparisonData = [
    { name: 'Thrifty', value: calculation.thriftyPlanBudget },
    { name: 'Low Cost', value: calculation.lowCostPlanBudget },
    { name: 'Moderate', value: calculation.moderatePlanBudget },
    { name: 'Liberal', value: calculation.liberalPlanBudget },
  ];

  return (
    <>
      <Helmet>
        <title>Your Grocery Budget Results | TryEatPal Budget Calculator</title>
        <meta
          name="description"
          content="Your personalized grocery budget based on USDA data with meal suggestions and money-saving tips."
        />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Back Button */}
          <Link to="/budget-calculator">
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
              <div className="p-4 bg-green-100 rounded-full">
                <DollarSign className="w-12 h-12 text-green-600" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Your Budget Results</h1>
            <p className="text-xl text-gray-600">
              Here's your personalized grocery budget for a family of {input.familySize}
            </p>
          </motion.div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-2 border-green-500">
                <CardHeader className="pb-3">
                  <CardDescription>Recommended Monthly Budget</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">
                    {formatCurrency(calculation.recommendedMonthlyBudget)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">USDA Moderate Plan</p>
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
                  <CardDescription>Cost Per Meal</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {formatCurrency(calculation.costPerMeal)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Per person</p>
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
                  <CardDescription>Daily Food Cost</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-gray-900">
                    {formatCurrency(calculation.costPerPersonPerDay)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Per person per day</p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card className="border-2 border-blue-500 bg-blue-50">
                <CardHeader className="pb-3">
                  <CardDescription>Annual Savings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">
                    {formatCurrency(calculation.annualSavings)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">vs. Meal Kits</p>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            {/* Weekly Budget Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Weekly Budget Breakdown</CardTitle>
                <CardDescription>
                  How to allocate your weekly budget of{' '}
                  {formatCurrency(calculation.recommendedMonthlyBudget / 4.33)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={weeklyBreakdownData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {weeklyBreakdownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Budget Comparison */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Comparison</CardTitle>
                <CardDescription>Your budget vs. alternatives (monthly)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={budgetComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(value) => `$${value}`} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="monthly" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span className="font-medium">vs. Meal Kits</span>
                    <span className="text-green-600 font-bold">
                      Save {formatCurrency(calculation.vsMealKitsSavings)}/mo
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <span className="font-medium">vs. Dining Out</span>
                    <span className="text-blue-600 font-bold">
                      Save {formatCurrency(calculation.vsDiningOutSavings)}/mo
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* USDA Plan Levels */}
          <Card className="mb-10">
            <CardHeader>
              <CardTitle>USDA Food Plan Options</CardTitle>
              <CardDescription>
                Compare different budget levels based on official USDA data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={planComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="value" fill="#8b5cf6" name="Monthly Cost" />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Your recommended plan: {calculation.usdaPlanLevel}</strong> - A balanced
                  approach that provides nutritious meals while keeping costs reasonable.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Budget-Friendly Meal Suggestions */}
          <Card className="mb-10">
            <CardHeader>
              <CardTitle>Budget-Friendly Meal Ideas</CardTitle>
              <CardDescription>
                Affordable meals that fit your budget and dietary needs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedMeals.slice(0, 6).map((meal, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <Card className="h-full hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{meal.name}</CardTitle>
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600">
                              {formatCurrency(meal.costPerServing)}
                            </div>
                            <div className="text-xs text-gray-500">per serving</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>{meal.prepTime} min prep</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Ingredients:</p>
                            <p className="text-sm text-gray-700">
                              {meal.ingredients.slice(0, 4).join(', ')}
                              {meal.ingredients.length > 4 && '...'}
                            </p>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-xs text-gray-500">
                              Total: {formatCurrency(meal.totalCost)} for {meal.servings} servings
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tips Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
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
                  {calculation.budgetTips.slice(0, 5).map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Waste Reduction Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-blue-600" />
                  Reduce Waste
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {calculation.wasteReductionTips.slice(0, 5).map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Meal Prep Tips */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-purple-600" />
                  Meal Prep Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {calculation.mealPrepTips.slice(0, 5).map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">{tip}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* CTA Section */}
          <Card className="bg-gradient-to-r from-green-500 to-blue-500 text-white mb-10">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <h2 className="text-3xl font-bold">
                  Ready to Put Your Budget Into Action?
                </h2>
                <p className="text-lg opacity-90">
                  TryEatPal helps you plan meals, manage your grocery budget, and reduce food waste
                  - all in one app.
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPDF}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    {isDownloadingPDF ? 'Downloading...' : 'Download Full Budget Plan'}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="bg-white text-green-600 hover:bg-gray-100"
                    onClick={() => setShowEmailModal(true)}
                  >
                    Start Free Trial
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Share Section */}
          <div className="text-center space-y-4">
            <p className="text-gray-600 mb-4">
              Found this helpful? Share with friends and family!
            </p>
            <ShareButtons
              calculation={calculation}
              familySize={input.familySize}
              calculationId={calculationId}
              name={userName}
            />
          </div>

          {/* Email Capture Modal */}
          {calculationId && (
            <EmailCaptureModal
              open={showEmailModal}
              onOpenChange={setShowEmailModal}
              calculationId={calculationId}
              monthlyBudget={calculation.recommendedMonthlyBudget}
              familySize={input.familySize}
              onEmailCaptured={handleEmailCaptured}
            />
          )}
        </div>
      </div>
    </>
  );
}

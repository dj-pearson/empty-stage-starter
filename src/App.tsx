import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AppProvider } from "@/contexts/AppContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SkipToContent } from "@/components/SkipToContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Lazy load all route components for better performance
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Home = lazy(() => import("./pages/Home"));
const Pantry = lazy(() => import("./pages/Pantry"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Planner = lazy(() => import("./pages/Planner"));
const AIPlanner = lazy(() => import("./pages/AIPlanner"));
const Grocery = lazy(() => import("./pages/Grocery"));
const Kids = lazy(() => import("./pages/Kids"));
const InsightsDashboard = lazy(() => import("./pages/InsightsDashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Progress = lazy(() => import("./pages/Progress"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const FoodTracker = lazy(() => import("./pages/FoodTracker"));
const AICoach = lazy(() => import("./pages/AICoach"));
const MealBuilder = lazy(() => import("./pages/MealBuilder"));
const FoodChaining = lazy(() => import("./pages/FoodChaining"));
const Pricing = lazy(() => import("./pages/Pricing"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Contact = lazy(() => import("./pages/Contact"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const SEODashboard = lazy(() => import("./pages/SEODashboard"));
const SearchTrafficDashboard = lazy(() => import("./pages/SearchTrafficDashboard"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PickyEaterQuiz = lazy(() => import("./pages/PickyEaterQuiz"));
const PickyEaterQuizResults = lazy(() => import("./pages/PickyEaterQuizResults"));
const BudgetCalculator = lazy(() => import("./pages/BudgetCalculator"));
const BudgetCalculatorResults = lazy(() => import("./pages/BudgetCalculatorResults"));
const MealPlanGenerator = lazy(() => import("./pages/MealPlanGenerator"));
const MealPlanGeneratorResults = lazy(() => import("./pages/MealPlanGeneratorResults"));
const ProfessionalSettings = lazy(() => import("./pages/dashboard/ProfessionalSettings"));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <TooltipProvider>
          <AppProvider>
            <Toaster />
            <Sonner />
            <PWAInstallPrompt />
            <ErrorBoundary>
              <BrowserRouter>
                <SkipToContent />
                <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/picky-eater-quiz" element={<PickyEaterQuiz />} />
            <Route path="/picky-eater-quiz/results" element={<PickyEaterQuizResults />} />
            <Route path="/budget-calculator" element={<BudgetCalculator />} />
            <Route path="/budget-calculator/results" element={<BudgetCalculatorResults />} />
            <Route path="/meal-plan" element={<MealPlanGenerator />} />
            <Route path="/meal-plan/results" element={<MealPlanGeneratorResults />} />
            {/* Admin routes - Protected with role check */}
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/admin-dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/seo-dashboard" element={<ProtectedRoute><SEODashboard /></ProtectedRoute>} />
            <Route path="/search-traffic" element={<ProtectedRoute><SearchTrafficDashboard /></ProtectedRoute>} />

            {/* Main Dashboard with nested routes - Protected */}
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<Home />} />
              <Route path="kids" element={<Kids />} />
              <Route path="pantry" element={<Pantry />} />
              <Route path="recipes" element={<Recipes />} />
              <Route path="planner" element={<Planner />} />
              <Route path="ai-planner" element={<AIPlanner />} />
              <Route path="insights" element={<InsightsDashboard />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="progress" element={<Progress />} />
              <Route path="grocery" element={<Grocery />} />
              <Route path="food-tracker" element={<FoodTracker />} />
              <Route path="ai-coach" element={<AICoach />} />
              <Route path="meal-builder" element={<MealBuilder />} />
              <Route path="food-chaining" element={<FoodChaining />} />
              <Route path="professional-settings" element={<ProfessionalSettings />} />
            </Route>

            {/* Convenience aliases - redirect to dashboard nested routes - Protected */}
            <Route path="/kids" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<Kids />} />
            </Route>
            <Route path="/pantry" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<Pantry />} />
            </Route>
            <Route path="/recipes" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<Recipes />} />
            </Route>
            <Route path="/planner" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<Planner />} />
            </Route>
            <Route path="/grocery" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<Grocery />} />
            </Route>
            <Route path="/food-tracker" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<FoodTracker />} />
            </Route>
            <Route path="/meal-builder" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<MealBuilder />} />
            </Route>
            <Route path="/insights" element={<ProtectedRoute><Dashboard /></ProtectedRoute>}>
              <Route index element={<InsightsDashboard />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </BrowserRouter>
            </ErrorBoundary>
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;

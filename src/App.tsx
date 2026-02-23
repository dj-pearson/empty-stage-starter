import { lazy, Suspense, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AppProvider } from "@/contexts/AppContext";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { SkipToContent } from "@/components/SkipToContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteAnnouncer } from "@/components/RouteAnnouncer";
import { LoadingFallback } from "@/components/LoadingFallback";

// Lazy load non-critical components to improve initial bundle size and LCP
const PWAInstallPrompt = lazy(() => import("@/components/PWAInstallPrompt").then(m => ({ default: m.PWAInstallPrompt })));
const CommandPalette = lazy(() => import("@/components/CommandPalette").then(m => ({ default: m.CommandPalette })));
const AccessibilityWidget = lazy(() => import("@/components/AccessibilityWidget").then(m => ({ default: m.AccessibilityWidget })));

// Lazy load all route components for better performance
const Landing = lazy(() => import("./pages/Landing"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
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
const Accessibility = lazy(() => import("./pages/Accessibility"));
const VPAT = lazy(() => import("./pages/VPAT"));
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
const Billing = lazy(() => import("./pages/dashboard/Billing"));
const AccountSettings = lazy(() => import("./pages/dashboard/AccountSettings"));
const AccessibilitySettingsPage = lazy(() => import("./pages/dashboard/AccessibilitySettings"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const ShareTarget = lazy(() => import("./pages/ShareTarget"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes - reduces refetches for better performance
      gcTime: 1000 * 60 * 30, // 30 minutes - keep data in cache longer
    },
  },
});

// Deferred loading wrapper for non-critical components
function DeferredComponents() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // Defer loading until after initial render and idle time
    const timeoutId = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => setShouldLoad(true), { timeout: 2000 });
      } else {
        setShouldLoad(true);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, []);

  if (!shouldLoad) return null;

  return (
    <Suspense fallback={null}>
      <PWAInstallPrompt />
      <CommandPalette />
      <AccessibilityWidget />
    </Suspense>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AccessibilityProvider>
          <TooltipProvider>
            <AppProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <SkipToContent />
                <RouteAnnouncer />
                <DeferredComponents />
                <Suspense fallback={<LoadingFallback message="Loading..." />}>
          <Routes>
            <Route path="/" element={<RouteErrorBoundary><Landing /></RouteErrorBoundary>} />
            <Route path="/auth" element={<RouteErrorBoundary><Auth /></RouteErrorBoundary>} />
            <Route path="/auth/callback" element={<RouteErrorBoundary><AuthCallback /></RouteErrorBoundary>} />
            <Route path="/auth/reset-password" element={<RouteErrorBoundary><ResetPassword /></RouteErrorBoundary>} />
            <Route path="/checkout/success" element={<RouteErrorBoundary><CheckoutSuccess /></RouteErrorBoundary>} />
            <Route path="/pricing" element={<RouteErrorBoundary><Pricing /></RouteErrorBoundary>} />
            <Route path="/privacy" element={<RouteErrorBoundary><PrivacyPolicy /></RouteErrorBoundary>} />
            <Route path="/terms" element={<RouteErrorBoundary><TermsOfService /></RouteErrorBoundary>} />
            <Route path="/accessibility" element={<RouteErrorBoundary><Accessibility /></RouteErrorBoundary>} />
            <Route path="/accessibility/vpat" element={<RouteErrorBoundary><VPAT /></RouteErrorBoundary>} />
            <Route path="/faq" element={<RouteErrorBoundary><FAQ /></RouteErrorBoundary>} />
            <Route path="/contact" element={<RouteErrorBoundary><Contact /></RouteErrorBoundary>} />
            <Route path="/blog" element={<RouteErrorBoundary><Blog /></RouteErrorBoundary>} />
            <Route path="/blog/:slug" element={<RouteErrorBoundary><BlogPost /></RouteErrorBoundary>} />
            <Route path="/oauth/callback" element={<RouteErrorBoundary><OAuthCallback /></RouteErrorBoundary>} />
            <Route path="/picky-eater-quiz" element={<RouteErrorBoundary><PickyEaterQuiz /></RouteErrorBoundary>} />
            <Route path="/picky-eater-quiz/results" element={<RouteErrorBoundary><PickyEaterQuizResults /></RouteErrorBoundary>} />
            <Route path="/budget-calculator" element={<RouteErrorBoundary><BudgetCalculator /></RouteErrorBoundary>} />
            <Route path="/budget-calculator/results" element={<RouteErrorBoundary><BudgetCalculatorResults /></RouteErrorBoundary>} />
            <Route path="/meal-plan" element={<RouteErrorBoundary><MealPlanGenerator /></RouteErrorBoundary>} />
            <Route path="/meal-plan/results" element={<RouteErrorBoundary><MealPlanGeneratorResults /></RouteErrorBoundary>} />
            <Route path="/api/docs" element={<RouteErrorBoundary><ApiDocs /></RouteErrorBoundary>} />
            <Route path="/share" element={<RouteErrorBoundary><ShareTarget /></RouteErrorBoundary>} />
            {/* Admin routes - Protected with role check */}
            <Route path="/admin" element={<ProtectedRoute><RouteErrorBoundary><Admin /></RouteErrorBoundary></ProtectedRoute>} />
            <Route path="/admin-dashboard" element={<ProtectedRoute><RouteErrorBoundary><AdminDashboard /></RouteErrorBoundary></ProtectedRoute>} />
            <Route path="/seo-dashboard" element={<ProtectedRoute><RouteErrorBoundary><SEODashboard /></RouteErrorBoundary></ProtectedRoute>} />
            <Route path="/search-traffic" element={<ProtectedRoute><RouteErrorBoundary><SearchTrafficDashboard /></RouteErrorBoundary></ProtectedRoute>} />

            {/* Main Dashboard with nested routes - Protected */}
            <Route path="/dashboard" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><Home /></RouteErrorBoundary>} />
              <Route path="kids" element={<RouteErrorBoundary><Kids /></RouteErrorBoundary>} />
              <Route path="pantry" element={<RouteErrorBoundary><Pantry /></RouteErrorBoundary>} />
              <Route path="recipes" element={<RouteErrorBoundary><Recipes /></RouteErrorBoundary>} />
              <Route path="planner" element={<RouteErrorBoundary><Planner /></RouteErrorBoundary>} />
              <Route path="ai-planner" element={<RouteErrorBoundary><AIPlanner /></RouteErrorBoundary>} />
              <Route path="insights" element={<RouteErrorBoundary><InsightsDashboard /></RouteErrorBoundary>} />
              <Route path="analytics" element={<RouteErrorBoundary><Analytics /></RouteErrorBoundary>} />
              <Route path="progress" element={<RouteErrorBoundary><Progress /></RouteErrorBoundary>} />
              <Route path="grocery" element={<RouteErrorBoundary><Grocery /></RouteErrorBoundary>} />
              <Route path="food-tracker" element={<RouteErrorBoundary><FoodTracker /></RouteErrorBoundary>} />
              <Route path="ai-coach" element={<RouteErrorBoundary><AICoach /></RouteErrorBoundary>} />
              <Route path="meal-builder" element={<RouteErrorBoundary><MealBuilder /></RouteErrorBoundary>} />
              <Route path="food-chaining" element={<RouteErrorBoundary><FoodChaining /></RouteErrorBoundary>} />
              <Route path="professional-settings" element={<RouteErrorBoundary><ProfessionalSettings /></RouteErrorBoundary>} />
              <Route path="billing" element={<RouteErrorBoundary><Billing /></RouteErrorBoundary>} />
              <Route path="settings" element={<RouteErrorBoundary><AccountSettings /></RouteErrorBoundary>} />
              <Route path="accessibility-settings" element={<RouteErrorBoundary><AccessibilitySettingsPage /></RouteErrorBoundary>} />
            </Route>

            {/* Convenience aliases - redirect to dashboard nested routes - Protected */}
            <Route path="/kids" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><Kids /></RouteErrorBoundary>} />
            </Route>
            <Route path="/pantry" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><Pantry /></RouteErrorBoundary>} />
            </Route>
            <Route path="/recipes" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><Recipes /></RouteErrorBoundary>} />
            </Route>
            <Route path="/planner" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><Planner /></RouteErrorBoundary>} />
            </Route>
            <Route path="/grocery" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><Grocery /></RouteErrorBoundary>} />
            </Route>
            <Route path="/food-tracker" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><FoodTracker /></RouteErrorBoundary>} />
            </Route>
            <Route path="/meal-builder" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><MealBuilder /></RouteErrorBoundary>} />
            </Route>
            <Route path="/insights" element={<ProtectedRoute><RouteErrorBoundary><Dashboard /></RouteErrorBoundary></ProtectedRoute>}>
              <Route index element={<RouteErrorBoundary><InsightsDashboard /></RouteErrorBoundary>} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
          </AccessibilityProvider>
    </ThemeProvider>
    </HelmetProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

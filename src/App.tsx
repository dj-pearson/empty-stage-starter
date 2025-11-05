import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Navigation } from "@/components/Navigation";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Home from "./pages/Home";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import Planner from "./pages/Planner";
import AIPlanner from "./pages/AIPlanner";
import Grocery from "./pages/Grocery";
import Kids from "./pages/Kids";
import InsightsDashboard from "./pages/InsightsDashboard";
import Analytics from "./pages/Analytics";
import Admin from "./pages/Admin";
import AdminDashboard from "./pages/AdminDashboard";
import FoodTracker from "./pages/FoodTracker";
import AICoach from "./pages/AICoach";
import MealBuilder from "./pages/MealBuilder";
import FoodChaining from "./pages/FoodChaining";
import Pricing from "./pages/Pricing";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import FAQ from "./pages/FAQ";
import Contact from "./pages/Contact";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import SEODashboard from "./pages/SEODashboard";
import OAuthCallback from "./pages/OAuthCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <AppProvider>
          <Toaster />
          <Sonner />
          <PWAInstallPrompt />
          <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/blog/:slug" element={<BlogPost />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin-dashboard" element={<AdminDashboard />} />
            <Route path="/seo-dashboard" element={<SEODashboard />} />

            {/* Main Dashboard with nested routes */}
            <Route path="/dashboard" element={<Dashboard />}>
              <Route index element={<Home />} />
              <Route path="kids" element={<Kids />} />
              <Route path="pantry" element={<Pantry />} />
              <Route path="recipes" element={<Recipes />} />
              <Route path="planner" element={<Planner />} />
              <Route path="ai-planner" element={<AIPlanner />} />
              <Route path="insights" element={<InsightsDashboard />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="grocery" element={<Grocery />} />
              <Route path="food-tracker" element={<FoodTracker />} />
              <Route path="ai-coach" element={<AICoach />} />
              <Route path="meal-builder" element={<MealBuilder />} />
              <Route path="food-chaining" element={<FoodChaining />} />
            </Route>

            {/* Convenience aliases - redirect to dashboard nested routes */}
            <Route path="/kids" element={<Dashboard />}>
              <Route index element={<Kids />} />
            </Route>
            <Route path="/pantry" element={<Dashboard />}>
              <Route index element={<Pantry />} />
            </Route>
            <Route path="/recipes" element={<Dashboard />}>
              <Route index element={<Recipes />} />
            </Route>
            <Route path="/planner" element={<Dashboard />}>
              <Route index element={<Planner />} />
            </Route>
            <Route path="/grocery" element={<Dashboard />}>
              <Route index element={<Grocery />} />
            </Route>
            <Route path="/food-tracker" element={<Dashboard />}>
              <Route index element={<FoodTracker />} />
            </Route>
            <Route path="/meal-builder" element={<Dashboard />}>
              <Route index element={<MealBuilder />} />
            </Route>
            <Route path="/insights" element={<Dashboard />}>
              <Route index element={<InsightsDashboard />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

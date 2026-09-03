import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { AppProvider } from '@/contexts/AppContext';
import { ROUTE_ALIAS_ENTRIES } from '@/lib/routeAliases';
import { AccessibilityProvider, useAccessibility } from '@/contexts/AccessibilityContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { SkipToContent } from '@/components/SkipToContent';
import { CookieConsentBanner } from '@/components/CookieConsentBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { RouteAnnouncer } from '@/components/RouteAnnouncer';
import { LoadingFallback } from '@/components/LoadingFallback';
import { UpgradePromptHost } from '@/components/UpgradePromptHost';

// Lazy load non-critical components to improve initial bundle size and LCP
const PWAInstallPrompt = lazy(() =>
  import('@/components/PWAInstallPrompt').then((m) => ({ default: m.PWAInstallPrompt }))
);
const CommandPalette = lazy(() =>
  import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);
const AccessibilityWidget = lazy(() =>
  import('@/components/AccessibilityWidget').then((m) => ({ default: m.AccessibilityWidget }))
);

// Lazy load all route components for better performance
const Landing = lazy(() => import('./pages/Landing'));
const Auth = lazy(() => import('./pages/Auth'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutSuccess'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Join = lazy(() => import('./pages/Join'));
const Home = lazy(() => import('./pages/Home'));
const Pantry = lazy(() => import('./pages/Pantry'));
const Recipes = lazy(() => import('./pages/Recipes'));
const Planner = lazy(() => import('./pages/Planner'));
const Grocery = lazy(() => import('./pages/Grocery'));
const Kids = lazy(() => import('./pages/Kids'));
const InsightsDashboard = lazy(() => import('./pages/InsightsDashboard'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Progress = lazy(() => import('./pages/Progress'));
const Admin = lazy(() => import('./pages/Admin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AgentCommandCenter = lazy(() => import('./pages/AgentCommandCenter'));
const FoodTracker = lazy(() => import('./pages/FoodTracker'));
const AICoach = lazy(() => import('./pages/AICoach'));
const MealBuilder = lazy(() => import('./pages/MealBuilder'));
const FoodChaining = lazy(() => import('./pages/FoodChaining'));
const Pricing = lazy(() => import('./pages/Pricing'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const Accessibility = lazy(() => import('./pages/Accessibility'));
const VPAT = lazy(() => import('./pages/VPAT'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Contact = lazy(() => import('./pages/Contact'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const Authors = lazy(() => import('./pages/Authors'));
const Compare = lazy(() => import('./pages/Compare'));
const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
// The meal-occasion cluster (/picky-eater/*). Targets the ~40 keywords at the
// 5,000/month tier that the site ranked for nowhere; see src/lib/meal-ideas-content.ts.
const MealIdeasPage = lazy(() => import('./pages/MealIdeasPage'));
const ArfidPage = lazy(() => import('./pages/ArfidPage'));
const SEODashboard = lazy(() => import('./pages/SEODashboard'));
const SearchTrafficDashboard = lazy(() => import('./pages/SearchTrafficDashboard'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const NotFound = lazy(() => import('./pages/NotFound'));
const PickyEaterQuiz = lazy(() => import('./pages/PickyEaterQuiz'));
const PickyEaterQuizResults = lazy(() => import('./pages/PickyEaterQuizResults'));
const BudgetCalculator = lazy(() => import('./pages/BudgetCalculator'));
const BudgetCalculatorResults = lazy(() => import('./pages/BudgetCalculatorResults'));
const MealPlanGenerator = lazy(() => import('./pages/MealPlanGenerator'));
const MealPlanGeneratorResults = lazy(() => import('./pages/MealPlanGeneratorResults'));
const SiblingMealFinder = lazy(() => import('./pages/SiblingMealFinder'));
const ProfessionalSettings = lazy(() => import('./pages/dashboard/ProfessionalSettings'));
const Billing = lazy(() => import('./pages/dashboard/Billing'));
const AccountSettings = lazy(() => import('./pages/dashboard/AccountSettings'));
const AccessibilitySettingsPage = lazy(() => import('./pages/dashboard/AccessibilitySettings'));
const ApiDocs = lazy(() => import('./pages/ApiDocs'));
const ShareTarget = lazy(() => import('./pages/ShareTarget'));

// pSEO programmatic pages
const PseoPage = lazy(() => import('./pages/pseo/PseoPage'));
const GuidesIndex = lazy(() => import('./pages/pseo/GuidesIndex'));
const PseoAdminPage = lazy(() => import('./pages/PseoAdmin'));

/**
 * Redirect a legacy un-namespaced pSEO URL to its /guides/ equivalent.
 *
 * `/food-chaining/chicken-nuggets` -> `/guides/food-chaining/chicken-nuggets`.
 * `replace` keeps the dead URL out of the history stack. The authoritative 301 lives in
 * public/_redirects so crawlers see a real redirect status rather than a JS hop.
 */
function LegacyGuideRedirect({ prefix }: { prefix: string }) {
  const rest = useParams()['*'] ?? '';
  const target = rest ? `/guides/${prefix}/${rest}` : `/guides/${prefix}`;
  return <Navigate to={target} replace />;
}

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

/**
 * Applies framer-motion's reduced-motion setting app-wide so JS/WAAPI-driven
 * animations honor the user's preference (WCAG 2.3.3 / 2.2.2). "always" when the
 * in-app toggle is on; otherwise defer to the OS-level prefers-reduced-motion.
 */
function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const { preferences } = useAccessibility();
  return (
    <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}>
      {children}
    </MotionConfig>
  );
}

const App = () => (
  <ErrorBoundary>
    <I18nextProvider i18n={i18n}>
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AccessibilityProvider>
            <ReducedMotionProvider>
            <TooltipProvider>
              <AppProvider>
                <Sonner />
                <BrowserRouter>
                  <SkipToContent />
                  <RouteAnnouncer />
                  <CookieConsentBanner />
                  <DeferredComponents />
                  <UpgradePromptHost />
                  <Suspense fallback={<LoadingFallback message="Loading..." />}>
                    <Routes>
                      <Route
                        path="/"
                        element={
                          <RouteErrorBoundary>
                            <Landing />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/auth"
                        element={
                          <RouteErrorBoundary>
                            <Auth />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/auth/callback"
                        element={
                          <RouteErrorBoundary>
                            <AuthCallback />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/auth/reset-password"
                        element={
                          <RouteErrorBoundary>
                            <ResetPassword />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/checkout/success"
                        element={
                          <RouteErrorBoundary>
                            <CheckoutSuccess />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/pricing"
                        element={
                          <RouteErrorBoundary>
                            <Pricing />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/privacy"
                        element={
                          <RouteErrorBoundary>
                            <PrivacyPolicy />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/terms"
                        element={
                          <RouteErrorBoundary>
                            <TermsOfService />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/accessibility"
                        element={
                          <RouteErrorBoundary>
                            <Accessibility />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/accessibility/vpat"
                        element={
                          <RouteErrorBoundary>
                            <VPAT />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/faq"
                        element={
                          <RouteErrorBoundary>
                            <FAQ />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/contact"
                        element={
                          <RouteErrorBoundary>
                            <Contact />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/blog"
                        element={
                          <RouteErrorBoundary>
                            <Blog />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/blog/:slug"
                        element={
                          <RouteErrorBoundary>
                            <BlogPost />
                          </RouteErrorBoundary>
                        }
                      />
                      {/* The author bios behind every blog byline. src/pages/Authors.tsx
                          declared https://tryeatpal.com/authors as its canonical but had no
                          route, so that URL served the SPA 404 and the credentials that back
                          our feeding-therapy content were unreachable to readers and crawlers
                          alike. Feeding/ARFID content is health advice; the reviewer bios are
                          the E-E-A-T evidence for it. */}
                      <Route
                        path="/authors"
                        element={
                          <RouteErrorBoundary>
                            <Authors />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/oauth/callback"
                        element={
                          <RouteErrorBoundary>
                            <OAuthCallback />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/picky-eater-quiz"
                        element={
                          <RouteErrorBoundary>
                            <PickyEaterQuiz />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/picky-eater-quiz/results"
                        element={
                          <RouteErrorBoundary>
                            <PickyEaterQuizResults />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/budget-calculator"
                        element={
                          <RouteErrorBoundary>
                            <BudgetCalculator />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/budget-calculator/results"
                        element={
                          <RouteErrorBoundary>
                            <BudgetCalculatorResults />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/meal-plan"
                        element={
                          <RouteErrorBoundary>
                            <MealPlanGenerator />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/meal-plan/results"
                        element={
                          <RouteErrorBoundary>
                            <MealPlanGeneratorResults />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/api/docs"
                        element={
                          <RouteErrorBoundary>
                            <ApiDocs />
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/share"
                        element={
                          <RouteErrorBoundary>
                            <ShareTarget />
                          </RouteErrorBoundary>
                        }
                      />
                      {/* Admin routes - Protected with role check */}
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute requireAdmin>
                            <RouteErrorBoundary>
                              <Admin />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin-dashboard"
                        element={
                          <ProtectedRoute requireAdmin>
                            <RouteErrorBoundary>
                              <AdminDashboard />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/agents"
                        element={
                          <ProtectedRoute requireAdmin>
                            <RouteErrorBoundary>
                              <Suspense fallback={<LoadingFallback />}>
                                <AgentCommandCenter />
                              </Suspense>
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/seo-dashboard"
                        element={
                          <ProtectedRoute requireAdmin>
                            <RouteErrorBoundary>
                              <SEODashboard />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/pseo-admin"
                        element={
                          <ProtectedRoute requireAdmin>
                            <RouteErrorBoundary>
                              <Suspense fallback={<LoadingFallback />}>
                                <PseoAdminPage />
                              </Suspense>
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/search-traffic"
                        element={
                          <ProtectedRoute requireAdmin>
                            <RouteErrorBoundary>
                              <SearchTrafficDashboard />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />

                      {/* Main Dashboard with nested routes - Protected */}
                      <Route
                        path="/join"
                        element={
                          <ProtectedRoute>
                            <RouteErrorBoundary>
                              <Join />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/dashboard"
                        element={
                          <ProtectedRoute>
                            <RouteErrorBoundary>
                              <Dashboard />
                            </RouteErrorBoundary>
                          </ProtectedRoute>
                        }
                      >
                        <Route
                          index
                          element={
                            <RouteErrorBoundary>
                              <Home />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="kids"
                          element={
                            <RouteErrorBoundary>
                              <Kids />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="pantry"
                          element={
                            <RouteErrorBoundary>
                              <Pantry />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="recipes"
                          element={
                            <RouteErrorBoundary>
                              <Recipes />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="planner"
                          element={
                            <RouteErrorBoundary>
                              <Planner />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="insights"
                          element={
                            <RouteErrorBoundary>
                              <InsightsDashboard />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="analytics"
                          element={
                            <RouteErrorBoundary>
                              <Analytics />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="progress"
                          element={
                            <RouteErrorBoundary>
                              <Progress />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="grocery"
                          element={
                            <RouteErrorBoundary>
                              <Grocery />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="food-tracker"
                          element={
                            <RouteErrorBoundary>
                              <FoodTracker />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="ai-coach"
                          element={
                            <RouteErrorBoundary>
                              <AICoach />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="meal-builder"
                          element={
                            <RouteErrorBoundary>
                              <MealBuilder />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="food-chaining"
                          element={
                            <RouteErrorBoundary>
                              <FoodChaining />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="sibling-meal-finder"
                          element={
                            <RouteErrorBoundary>
                              <SiblingMealFinder />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="professional-settings"
                          element={
                            <RouteErrorBoundary>
                              <ProfessionalSettings />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="billing"
                          element={
                            <RouteErrorBoundary>
                              <Billing />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="settings"
                          element={
                            <RouteErrorBoundary>
                              <AccountSettings />
                            </RouteErrorBoundary>
                          }
                        />
                        <Route
                          path="accessibility-settings"
                          element={
                            <RouteErrorBoundary>
                              <AccessibilitySettingsPage />
                            </RouteErrorBoundary>
                          }
                        />
                      </Route>

                      {/*
                        Convenience aliases (US-766).

                        Every one of these used to mount a SECOND copy of the
                        Dashboard shell plus its page, so /pantry and
                        /dashboard/pantry were two React trees with separate
                        state -- a filter set on one did not exist on the
                        other. US-719 found that for /planner and fixed only
                        that one; these are the remaining eight.

                        No ProtectedRoute here on purpose: the canonical route
                        is already guarded, so an unauthenticated visitor
                        redirects and then bounces to /auth from there. Wrapping
                        the redirect too would just run the check twice.

                        The list lives in src/lib/routeAliases.ts so the routes,
                        the test and the prerender/sitemap exclusion cannot
                        drift apart.
                      */}
                      {ROUTE_ALIAS_ENTRIES.map(([from, to]) => (
                        <Route key={from} path={from} element={<Navigate to={to} replace />} />
                      ))}
                      {/*
                        pSEO programmatic pages.

                        `pseo_pages.slug` is a FULL multi-segment path
                        ('food-chaining/chicken-nuggets', 'challenges/arfid/dinner') and
                        src/lib/pseo/generator.ts writes canonical_url and breadcrumbs as
                        `/guides/<slug>`. A single splat mounted at /guides therefore serves
                        every page type at every depth, and the URL a page declares as its
                        canonical is the URL that actually resolves.

                        This replaces four routes that between them served nothing:
                        `/food-chaining/:safeFood` and `/guides/:guideSlug` matched a fixed
                        segment count so the 3-segment challenge/age pages had no route at
                        all, none of them supplied the `:slug` param PseoPage read, and
                        `/:dimension1/:dimension2` was a catch-all that swallowed every
                        unmatched two-segment URL on the site.
                      */}
                      {/* Exact /guides is the library hub — every generated guide's first
                          breadcrumb points here, and it is the only public entry point into
                          the cluster. React Router ranks this static path above the splat
                          below, so the splat only ever sees /guides/<something>. */}
                      <Route
                        path="/guides"
                        element={
                          <RouteErrorBoundary>
                            <Suspense fallback={<LoadingFallback />}>
                              <GuidesIndex />
                            </Suspense>
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/guides/*"
                        element={
                          <RouteErrorBoundary>
                            <Suspense fallback={<LoadingFallback />}>
                              <PseoPage />
                            </Suspense>
                          </RouteErrorBoundary>
                        }
                      />
                      {/*
                        Legacy un-namespaced pSEO URLs. public/_redirects issues a real 301
                        for these at the CDN; this client-side Navigate only covers in-app
                        navigation and direct hits that bypass the redirect rule.
                      */}
                      <Route path="/food-chaining/*" element={<LegacyGuideRedirect prefix="food-chaining" />} />
                      <Route path="/challenges/*" element={<LegacyGuideRedirect prefix="challenges" />} />
                      <Route path="/age/*" element={<LegacyGuideRedirect prefix="age" />} />
                      <Route path="/meals/*" element={<LegacyGuideRedirect prefix="meals" />} />
                      <Route path="/dietary/*" element={<LegacyGuideRedirect prefix="dietary" />} />
                      <Route path="/food-challenge/*" element={<LegacyGuideRedirect prefix="food-challenge" />} />
                      {/* US-646: the /compare cluster. /compare is the index and the
                          internal-link hub; /compare/:slug renders one comparison from
                          src/lib/comparison-content.ts and falls through to NotFound for a
                          slug that has no content, so a guessed URL cannot become a thin
                          indexable page. */}
                      <Route
                        path="/compare"
                        element={
                          <RouteErrorBoundary>
                            <Suspense fallback={<LoadingFallback />}>
                              <Compare />
                            </Suspense>
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/compare/:slug"
                        element={
                          <RouteErrorBoundary>
                            <Suspense fallback={<LoadingFallback />}>
                              <ComparisonPage />
                            </Suspense>
                          </RouteErrorBoundary>
                        }
                      />
                      <Route
                        path="/picky-eater/:slug"
                        element={
                          <RouteErrorBoundary>
                            <Suspense fallback={<LoadingFallback />}>
                              <MealIdeasPage />
                            </Suspense>
                          </RouteErrorBoundary>
                        }
                      />
                      {/* US-649: the ARFID cluster. "arfid eating", "arfid food
                          disorder" and "avoidant restrictive food intake disorder arfid"
                          are each in the 50,000/month tier at Low competition and the
                          site ranked for none of them. */}
                      <Route
                        path="/arfid/:slug"
                        element={
                          <RouteErrorBoundary>
                            <Suspense fallback={<LoadingFallback />}>
                              <ArfidPage />
                            </Suspense>
                          </RouteErrorBoundary>
                        }
                      />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route
                        path="*"
                        element={
                          <RouteErrorBoundary>
                            <NotFound />
                          </RouteErrorBoundary>
                        }
                      />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </AppProvider>
            </TooltipProvider>
            </ReducedMotionProvider>
          </AccessibilityProvider>
        </ThemeProvider>
      </HelmetProvider>
    </QueryClientProvider>
    </I18nextProvider>
  </ErrorBoundary>
);

export default App;

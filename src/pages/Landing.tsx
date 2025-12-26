import React, { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Utensils,
  Brain,
  Calendar,
  TrendingUp,
  Heart,
  Sparkles,
  Users,
  ShoppingCart,
  Menu,
  Moon,
  Sun,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { OrganizationSchema, SoftwareAppSchema, FAQSchema, ReviewSchema } from "@/components/schema";
import type { Review } from "@/components/schema";
import { getPageSEO } from "@/lib/seo-config";
import { Footer } from "@/components/Footer";

// Lazy load heavy components that use GSAP to reduce initial bundle size
const EnhancedHero = lazy(() => import("@/components/EnhancedHero").then(m => ({ default: m.EnhancedHero })));
const FeatureCard3D = lazy(() => import("@/components/Card3DTilt").then(m => ({ default: m.FeatureCard3D })));
const ParallaxBackground = lazy(() => import("@/components/ParallaxBackground").then(m => ({ default: m.ParallaxBackground })));
const ExitIntentPopup = lazy(() => import("@/components/ExitIntentPopup").then(m => ({ default: m.ExitIntentPopup })));

// Import branded skeleton for hero loading state
import { HeroSkeleton } from "@/components/HeroSkeleton";

// Dynamically import GSAP only when needed (deferred loading)
let gsapModule: typeof import("gsap") | null = null;
let ScrollTriggerModule: typeof import("gsap/ScrollTrigger").ScrollTrigger | null = null;

const loadGSAP = async () => {
  if (!gsapModule) {
    const [gsapImport, scrollTriggerImport] = await Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger")
    ]);
    gsapModule = gsapImport;
    ScrollTriggerModule = scrollTriggerImport.ScrollTrigger;
    gsapModule.gsap.registerPlugin(ScrollTriggerModule);
  }
  return { gsap: gsapModule.gsap, ScrollTrigger: ScrollTriggerModule };
};

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Track scroll position for sticky header CTA
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Get SEO configuration for homepage
  const seoConfig = getPageSEO("home");

  // Initialize GSAP animations after component mounts (deferred)
  useEffect(() => {
    let mounted = true;

    const initAnimations = async () => {
      const { gsap, ScrollTrigger } = await loadGSAP();
      if (!mounted || !containerRef.current) return;

      // Animate sections on scroll
      const sections = gsap.utils.toArray<HTMLElement>(".animate-section");

      sections.forEach((section) => {
        gsap.fromTo(section,
          { y: 50, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: section,
              start: "top 80%",
              toggleActions: "play none none reverse"
            }
          }
        );
      });

      // Staggered animations for grids
      const grids = gsap.utils.toArray<HTMLElement>(".animate-grid");

      grids.forEach((grid) => {
        const items = grid.querySelectorAll(".animate-item");

        gsap.fromTo(items,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.1,
            ease: "power2.out",
            scrollTrigger: {
              trigger: grid,
              start: "top 85%",
            }
          }
        );
      });
    };

    // Delay animation initialization to not block initial render
    const timer = setTimeout(initAnimations, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const features = [
    {
      icon: Utensils,
      title: "Smart Food Library",
      description:
        "Build a safe foods library for your picky eater. Track allergens, sensory preferences, and nutrition for each child's meals.",
    },
    {
      icon: Calendar,
      title: "Weekly Kids Meal Plans",
      description:
        "Auto-generate 7-day personalized meal plans for picky eaters with balanced nutrition and daily try bites to expand food acceptance.",
    },
    {
      icon: Brain,
      title: "AI-Powered Food Suggestions",
      description:
        "Get intelligent food recommendations based on your child's eating patterns, preferences, and nutritional needs for selective eaters.",
    },
    {
      icon: ShoppingCart,
      title: "Auto Grocery Lists",
      description:
        "Generate organized shopping lists from your kids meal plans automatically. Track inventory and never run out of safe foods.",
    },
    {
      icon: Users,
      title: "Multi-Child Meal Planning",
      description:
        "Manage personalized meal plans for multiple picky eaters in one place. Perfect for families with different food preferences.",
    },
    {
      icon: TrendingUp,
      title: "Progress & Nutrition Tracking",
      description:
        "Monitor food acceptance, track nutrition intake, and celebrate wins as your picky eater tries new foods.",
    },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  // Review data for star ratings in search results
  const userReviews: Review[] = [
    {
      author: "Sarah M.",
      datePublished: "2024-11-15",
      reviewBody: "My 4-year-old went from eating chicken nuggets every night to trying 12 new foods in 2 months. The progress tracking showed me it was actually working!",
      ratingValue: 5
    },
    {
      author: "Mike T.",
      datePublished: "2024-12-01",
      reviewBody: "I used to spend 2 hours every Sunday planning meals. Now it takes 10 minutes. The auto-grocery list is a game-changer.",
      ratingValue: 5
    },
    {
      author: "Jennifer L.",
      datePublished: "2024-11-22",
      reviewBody: "My son has ARFID and this is the first tool that actually helped us make measurable progress. The food chaining suggestions are brilliant.",
      ratingValue: 5
    }
  ];

  // FAQ data for schema markup and display
  const faqs = [
    {
      question: "What is food chaining?",
      answer: "Food chaining is an evidence-based feeding therapy technique that introduces new foods by building 'chains' from foods a child already accepts. Instead of forcing completely new foods, we make gradual changes in taste, texture, or appearance. For example, chicken nuggets → chicken strips → grilled chicken tenders. EatPal is the only platform that automates food chaining with AI-powered suggestions."
    },
    {
      question: "How is EatPal different from other meal planning apps?",
      answer: "Most apps assume kids will eat anything. EatPal is built specifically for picky eaters—it uses food chaining science to gradually introduce new foods while respecting your child's safe foods. Our AI predicts which new foods your child is most likely to accept based on their current preferences and eating patterns."
    },
    {
      question: "What if my child only eats 5 foods?",
      answer: "That's exactly who we built this for. Start with those 5 safe foods, and we'll suggest one similar food to try each day using food chaining methodology. Research shows children need 15-20 exposures to a new food before accepting it—EatPal tracks every exposure automatically. Small steps = big progress."
    },
    {
      question: "Does EatPal work for ARFID (Avoidant/Restrictive Food Intake Disorder)?",
      answer: "Yes! EatPal is designed for families managing ARFID, autism spectrum feeding challenges, and extreme selective eating. Our food chaining approach aligns with evidence-based ARFID treatment protocols. Many feeding therapists recommend EatPal to their clients. The platform tracks sensory preferences, safe foods, and progress over time."
    },
    {
      question: "What ages does this work for?",
      answer: "EatPal is most effective for ages 2-12, but we have parents successfully using it for teenagers and even adults with selective eating. The food chaining methodology works at any age—it's about respecting current food preferences while gradually expanding variety through small, predictable changes."
    },
    {
      question: "Do I need to be tech-savvy?",
      answer: "Nope! If you can text, you can use EatPal. Most parents build their first meal plan in under 5 minutes. The interface is designed for busy parents, not engineers. Everything syncs automatically across your phone, tablet, and computer."
    }
  ];

  return (
    <>
      {/* SEO Head with comprehensive GEO optimization */}
      {seoConfig && (
        <SEOHead
          title={seoConfig.title}
          description={seoConfig.description}
          keywords={seoConfig.keywords}
          canonicalUrl={seoConfig.canonicalUrl}
          aiPurpose={seoConfig.aiPurpose}
          aiAudience={seoConfig.aiAudience}
          aiKeyFeatures={seoConfig.aiKeyFeatures}
          aiUseCases={seoConfig.aiUseCases}
          structuredData={seoConfig.structuredData}
        />
      )}

      {/* Organization Schema for brand identity */}
      <OrganizationSchema />

      {/* Software Application Schema */}
      <SoftwareAppSchema />

      {/* FAQ Schema for AI search optimization */}
      <FAQSchema faqs={faqs} />

      {/* Review Schema for star ratings in search results */}
      <ReviewSchema
        itemName="EatPal - Meal Planning for Picky Eaters"
        itemDescription="AI-powered meal planning platform for families with picky eaters, ARFID, and selective eating challenges"
        itemImage="https://tryeatpal.com/Cover.webp"
        aggregateRating={{
          ratingValue: 4.8,
          reviewCount: 2847,
          bestRating: 5,
          worstRating: 1
        }}
        reviews={userReviews}
        itemUrl="https://tryeatpal.com"
      />

      <div ref={containerRef} className="min-h-screen bg-background overflow-x-hidden">
        {/* Header */}
        <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm transition-all duration-300">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <picture className="block dark:hidden">
                <source srcSet="/Logo-Green.webp" type="image/webp" />
                <img
                  src="/Logo-Green.png"
                  alt="EatPal"
                  className="h-8"
                  width="120"
                  height="32"
                />
              </picture>
              <picture className="hidden dark:block">
                <source srcSet="/Logo-White.webp" type="image/webp" />
                <img
                  src="/Logo-White.png"
                  alt="EatPal"
                  className="h-8"
                  width="120"
                  height="32"
                />
              </picture>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex gap-6 items-center">
              <a
                href="#features"
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                How It Works
              </a>
              <Link
                to="/pricing"
                className="text-foreground hover:text-primary transition-colors font-medium"
              >
                Pricing
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              <Link to="/auth?tab=signin">
                <Button variant="ghost" className="font-medium" aria-label="Sign in to your EatPal account">
                  Sign In
                </Button>
              </Link>
              {/* Primary CTA - appears prominently after scroll */}
              <Link to="/auth?tab=signup">
                <Button
                  aria-label="Get started with EatPal for free"
                  className={`font-semibold shadow-md transition-all duration-300 ${
                    scrolled
                      ? 'bg-primary text-white scale-105'
                      : 'bg-primary/90 text-white'
                  }`}
                >
                  Get Started Free
                </Button>
              </Link>
            </nav>

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" className="touch-target">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[360px] flex flex-col">
                <SheetHeader className="pb-4 border-b">
                  <SheetTitle className="flex items-center gap-2">
                    <picture className="block dark:hidden">
                      <source srcSet="/Logo-Green.webp" type="image/webp" />
                      <img
                        src="/Logo-Green.png"
                        alt="EatPal"
                        className="h-7"
                        width="105"
                        height="28"
                      />
                    </picture>
                    <picture className="hidden dark:block">
                      <source srcSet="/Logo-White.webp" type="image/webp" />
                      <img
                        src="/Logo-White.png"
                        alt="EatPal"
                        className="h-7"
                        width="105"
                        height="28"
                      />
                    </picture>
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-2 mt-6 flex-1">
                  <a
                    href="#features"
                    className="text-foreground text-base font-medium py-4 px-4 rounded-lg hover:bg-muted active:scale-[0.98] transition-all"
                    onClick={closeMobileMenu}
                  >
                    Features
                  </a>
                  <a
                    href="#how-it-works"
                    className="text-foreground text-base font-medium py-4 px-4 rounded-lg hover:bg-muted active:scale-[0.98] transition-all"
                    onClick={closeMobileMenu}
                  >
                    How It Works
                  </a>
                  <Link
                    to="/pricing"
                    className="text-foreground text-base font-medium py-4 px-4 rounded-lg hover:bg-muted active:scale-[0.98] transition-all"
                    onClick={closeMobileMenu}
                  >
                    Pricing
                  </Link>
                  <div className="border-t pt-4 mt-auto space-y-3 pb-safe">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full justify-start gap-3"
                      onClick={() => {
                        setTheme(theme === "dark" ? "light" : "dark");
                        closeMobileMenu();
                      }}
                    >
                      {theme === "dark" ? (
                        <>
                          <Sun className="h-5 w-5" />
                          <span>Light Mode</span>
                        </>
                      ) : (
                        <>
                          <Moon className="h-5 w-5" />
                          <span>Dark Mode</span>
                        </>
                      )}
                    </Button>
                    <Link to="/auth?tab=signup" onClick={closeMobileMenu}>
                      <Button size="lg" className="w-full bg-primary text-white shadow-md" aria-label="Get started with EatPal for free">
                        Get Started Free
                      </Button>
                    </Link>
                    <Link to="/auth?tab=signin" onClick={closeMobileMenu}>
                      <Button size="lg" variant="outline" className="w-full" aria-label="Sign in to your EatPal account">
                        Sign In
                      </Button>
                    </Link>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Enhanced Hero Section with Trust Signals */}
        <div className="relative">
          <Suspense fallback={<div className="absolute inset-0" />}>
            <ParallaxBackground />
          </Suspense>
          <Suspense fallback={<HeroSkeleton />}>
            <EnhancedHero />
          </Suspense>
        </div>

        {/* Pain Points Section - If Mealtime Feels Like a Battle */}
        <section className="py-24 px-4 bg-gradient-to-b from-background to-secondary/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-trust-warmOrange/10 via-transparent to-transparent pointer-events-none" />
          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="animate-section text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                If Mealtime Feels Like a Battle, You're Not Alone
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Thousands of parents face these same challenges every single day
              </p>
            </div>

            <div className="animate-grid grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
              {[
                {
                  icon: "🍽️",
                  title: "Same 5 Foods Every Week",
                  description: "Stuck in a rotation rut, afraid to try new recipes that might get refused"
                },
                {
                  icon: "🛒",
                  title: "Grocery Shopping Is Chaos",
                  description: "No list, forgotten items, impulse buys for foods they won't eat anyway"
                },
                {
                  icon: "📊",
                  title: "No Idea If It's Working",
                  description: "Are they making progress or just getting pickier? You're flying blind."
                },
                {
                  icon: "⏰",
                  title: "Planning Takes Hours",
                  description: "Sunday meal prep eats your entire afternoon just to avoid weeknight panic"
                },
                {
                  icon: "😰",
                  title: "The Guilt & Worry",
                  description: "Are they getting enough nutrients? Am I failing as a parent?"
                },
                {
                  icon: "🔄",
                  title: "Dinner Battles Every Night",
                  description: "The negotiations, tears, and 'just one bite' arguments are exhausting"
                }
              ].map((pain, index) => (
                <div key={index} className="animate-item h-full">
                  <Card className="h-full hover:shadow-lg transition-all hover:-translate-y-1 duration-300 border-primary/10">
                    <CardHeader>
                      <div className="text-5xl mb-4 animate-bounce-dynamic" style={{ animationDelay: `${index * 0.2}s` }}>{pain.icon}</div>
                      <CardTitle className="text-xl text-foreground">{pain.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{pain.description}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Solution Section - Meet EatPal */}
        <section id="how-it-works" className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10 relative">
          <Suspense fallback={null}>
            <ParallaxBackground className="opacity-50" />
          </Suspense>
          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="animate-section text-center mb-16">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary px-4 py-1 text-sm">The Solution</Badge>
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Meet EatPal: Your Meal Planning Co-Pilot for Picky Eaters
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Built on food chaining science and loved by over 2,000 parents who've reclaimed peaceful mealtimes
              </p>
            </div>

            {/* 3 Steps - How It Works */}
            <div className="animate-grid grid md:grid-cols-3 gap-8 mt-12">
              {[
                {
                  step: "1",
                  icon: "📚",
                  title: "Build Your Child's Food Library",
                  description: "Add the 10-20 foods they already eat (their 'safe foods'). Mark foods to try—we'll suggest one per day.",
                },
                {
                  step: "2",
                  icon: "🤖",
                  title: "Generate Smart Meal Plans",
                  description: "AI creates a week of meals using foods your child will eat. One 'try bite' food daily to gently expand their diet.",
                },
                {
                  step: "3",
                  icon: "📈",
                  title: "Shop & Track Progress",
                  description: "Auto-generated grocery list (no forgotten items). Log what they ate, tasted, or refused. See data-driven insights.",
                }
              ].map((step, index) => (
                <div key={index} className="animate-item h-full">
                  <Card className="h-full bg-background/80 backdrop-blur-sm border-2 hover:border-primary/30 transition-all hover:shadow-xl">
                    <CardHeader>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shadow-inner">
                          <span className="text-2xl font-bold text-primary">{step.step}</span>
                        </div>
                        <div className="text-4xl">{step.icon}</div>
                      </div>
                      <CardTitle className="text-xl text-foreground">{step.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{step.description}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits-Focused Features Section */}
        <section id="features" className="py-24 px-4 bg-gradient-to-br from-secondary/5 to-background relative overflow-hidden">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-trust-softPink/5 to-transparent pointer-events-none" />
          <div className="container mx-auto max-w-6xl relative z-10">
            <div className="animate-section text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Everything You Need to Turn Mealtime Stress into Mealtime Success
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Built specifically for parents of picky eaters—not another generic meal planner
              </p>
            </div>

            <div className="animate-grid grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  icon: Brain,
                  title: "AI Meal Suggestions",
                  description: "Turn 'I don't know what to make' into a full week of ideas in seconds. Smart suggestions based on what your child actually eats."
                },
                {
                  icon: TrendingUp,
                  title: "Food Chaining Algorithm",
                  description: "Science-backed suggestions for introducing new foods based on what they already like (texture, flavor, color matching)."
                },
                {
                  icon: ShoppingCart,
                  title: "Auto-Grocery Lists",
                  description: "Never forget an ingredient again—lists organized by aisle. Shopping takes 30% less time."
                },
                {
                  icon: Calendar,
                  title: "Progress Tracking",
                  description: "See acceptance rates, favorite foods, and nutritional balance over time. Know what's working."
                },
                {
                  icon: Sparkles,
                  title: "Works Everywhere",
                  description: "Plan on your laptop, shop with your phone—syncs automatically across all devices."
                },
                {
                  icon: Heart,
                  title: "Flexible Plans",
                  description: "Swap meals, adjust portions, add notes—it adapts to your family. No rigid meal plans."
                }
              ].map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div key={index} className="animate-item h-full">
                    <Card className="h-full hover:shadow-lg transition-shadow border-primary/5 hover:border-primary/20">
                      <CardHeader>
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-xl text-foreground">{feature.title}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground">{feature.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Social Proof / Testimonials Section */}
        <section className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10">
          <div className="container mx-auto max-w-6xl">
            <div className="animate-section text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Trusted by Parents Just Like You
              </h2>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                Real families, real progress, real peace of mind at mealtimes
              </p>
            </div>

            <div className="animate-grid grid md:grid-cols-3 gap-8">
              {[
                {
                  quote: "My 4-year-old went from eating chicken nuggets every night to trying 12 new foods in 2 months. The progress tracking showed me it was actually working!",
                  name: "Sarah M.",
                  detail: "Mom of 2"
                },
                {
                  quote: "I used to spend 2 hours every Sunday planning meals. Now it takes 10 minutes. The auto-grocery list is a game-changer.",
                  name: "Mike T.",
                  detail: "Dad of 3"
                },
                {
                  quote: "My son has ARFID and this is the first tool that actually helped us make measurable progress. The food chaining suggestions are brilliant.",
                  name: "Jennifer L.",
                  detail: "Mom of 1"
                }
              ].map((testimonial, index) => (
                <div key={index} className="animate-item h-full">
                  <Card className="h-full bg-background/60 backdrop-blur-md border-none shadow-md">
                    <CardContent className="pt-6">
                      <div className="text-4xl text-primary mb-4 font-serif">"</div>
                      <p className="text-muted-foreground mb-6 leading-relaxed italic">
                        {testimonial.quote}
                      </p>
                      <div className="border-t border-primary/10 pt-4">
                        <p className="font-semibold text-primary">{testimonial.name}</p>
                        <p className="text-sm text-muted-foreground">{testimonial.detail}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>

            <div className="animate-section text-center mt-12">
              <div className="inline-flex items-center gap-8 flex-wrap justify-center bg-white/50 backdrop-blur-sm p-6 rounded-2xl shadow-sm">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">⭐⭐⭐⭐⭐</div>
                  <p className="text-sm text-muted-foreground mt-2">4.8/5 stars</p>
                </div>
                <div className="text-center border-l border-primary/20 pl-8">
                  <div className="text-3xl font-bold text-primary">2,000+</div>
                  <p className="text-sm text-muted-foreground mt-2">families</p>
                </div>
                <div className="text-center border-l border-primary/20 pl-8">
                  <div className="text-3xl font-bold text-primary">50,000+</div>
                  <p className="text-sm text-muted-foreground mt-2">meals planned</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section with enhanced content for SEO */}
        <section className="py-24 px-4 bg-gradient-to-br from-secondary/5 to-background">
          <div className="container mx-auto max-w-4xl">
            <div className="animate-section text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Frequently Asked Questions About Food Chaining & EatPal
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Everything you need to know about using food chaining therapy for picky eaters
              </p>
            </div>

            <div className="animate-grid space-y-6">
              {faqs.map((faq, index) => (
                <div key={index} className="animate-item">
                  <Card className="hover:border-primary/30 transition-colors">
                    <CardHeader>
                      <CardTitle className="text-xl text-primary/90">{faq.question}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section with Animations */}
        <section id="complete-solution" className="py-24 px-4 relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
          <div className="container mx-auto relative z-10">
            <div className="animate-section text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-primary">
                Complete Kids Meal Planning Solution
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                Powerful features designed to make meal planning effortless for
                families with picky eaters, selective eating, and children's
                nutrition challenges
              </p>
            </div>
            <div className="animate-grid grid md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
              <Suspense fallback={
                <div className="contents" role="status" aria-busy="true" aria-label="Loading features">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="bg-card rounded-xl p-6 border shadow-sm animate-pulse h-full"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <div className="w-12 h-12 rounded-full bg-muted mb-4" />
                      <div className="h-6 bg-muted rounded w-3/4 mb-3" />
                      <div className="space-y-2">
                        <div className="h-4 bg-muted rounded w-full" />
                        <div className="h-4 bg-muted rounded w-5/6" />
                      </div>
                    </div>
                  ))}
                  <span className="sr-only">Loading feature cards, please wait...</span>
                </div>
              }>
                {features.map((feature) => (
                  <div key={feature.title} className="animate-item h-full">
                    <FeatureCard3D
                      icon={feature.icon === Utensils ? '🍽️' :
                        feature.icon === Calendar ? '📅' :
                          feature.icon === Brain ? '🧠' :
                            feature.icon === ShoppingCart ? '🛒' :
                              feature.icon === Users ? '👨‍👩‍👧‍👦' : '📈'}
                      title={feature.title}
                      description={feature.description}
                    />
                  </div>
                ))}
              </Suspense>
            </div>
          </div>
        </section>

        {/* Pricing Preview Section */}
        <section id="pricing" className="py-24 px-4 bg-gradient-to-br from-background to-secondary/10">
          <div className="container mx-auto max-w-5xl">
            <div className="animate-section text-center mb-12">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary px-4 py-1 text-sm">
                Simple Pricing
              </Badge>
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-primary">
                Start Free, Upgrade Anytime
              </h2>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                No credit card required. Cancel anytime.
              </p>
            </div>

            <div className="animate-grid grid md:grid-cols-3 gap-6">
              {/* Free Plan */}
              <Card className="relative hover:shadow-lg transition-all hover:-translate-y-1 duration-300">
                <CardHeader className="text-center pb-2">
                  <p className="text-sm font-medium text-muted-foreground mb-2">FREE</p>
                  <CardTitle className="text-4xl font-bold">$0</CardTitle>
                  <p className="text-sm text-muted-foreground">Forever free</p>
                </CardHeader>
                <CardContent className="pt-4">
                  <ul className="space-y-3 mb-6">
                    {['1 child profile', 'Basic meal planning', '10 safe foods', 'Weekly grocery list'].map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth?tab=signup">
                    <Button variant="outline" className="w-full" aria-label="Get started with the free plan">
                      Get Started
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Pro Plan - Most Popular */}
              <Card className="relative border-2 border-primary shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 duration-300">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-white px-4">Most Popular</Badge>
                </div>
                <CardHeader className="text-center pb-2 pt-6">
                  <p className="text-sm font-medium text-primary mb-2">PRO</p>
                  <CardTitle className="text-4xl font-bold">$9.99</CardTitle>
                  <p className="text-sm text-muted-foreground">per month</p>
                </CardHeader>
                <CardContent className="pt-4">
                  <ul className="space-y-3 mb-6">
                    {['3 child profiles', 'AI meal planning', 'Unlimited foods', 'Food chaining tools', 'Progress analytics'].map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth?tab=signup">
                    <Button className="w-full" aria-label="Start free trial of the Pro plan">
                      Start Free Trial
                    </Button>
                  </Link>
                </CardContent>
              </Card>

              {/* Family Plan */}
              <Card className="relative hover:shadow-lg transition-all hover:-translate-y-1 duration-300">
                <CardHeader className="text-center pb-2">
                  <p className="text-sm font-medium text-muted-foreground mb-2">FAMILY</p>
                  <CardTitle className="text-4xl font-bold">$19.99</CardTitle>
                  <p className="text-sm text-muted-foreground">per month</p>
                </CardHeader>
                <CardContent className="pt-4">
                  <ul className="space-y-3 mb-6">
                    {['Unlimited profiles', 'All Pro features', 'AI nutrition coach', 'Priority support', 'Family sharing'].map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link to="/auth?tab=signup">
                    <Button variant="outline" className="w-full" aria-label="Start free trial of the Family plan">
                      Start Free Trial
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </div>

            <div className="text-center mt-8">
              <Link to="/pricing" className="text-primary hover:underline font-medium inline-flex items-center gap-1" aria-label="View full pricing feature comparison">
                View full feature comparison <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* Final CTA Section - Get Started */}
        <section id="get-started" className="py-24 px-4 bg-gradient-to-br from-primary to-primary/80 relative overflow-hidden">
          {/* Background decoration */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />

          <div className="container mx-auto max-w-4xl relative z-10">
            <div className="animate-section text-center">
              <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-white">
                Ready to End Mealtime Battles?
              </h2>
              <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto leading-relaxed">
                Join 2,000+ parents who've transformed chaotic dinners into peaceful family moments
              </p>

              {/* Benefits list */}
              <div className="flex flex-wrap justify-center gap-4 mb-10">
                {[
                  "Personalized meal plans",
                  "Auto grocery lists",
                  "Food chaining science",
                  "Progress tracking",
                ].map((benefit, index) => (
                  <div key={index} className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full">
                    <CheckCircle className="h-4 w-4 text-white" />
                    <span className="text-sm text-white font-medium">{benefit}</span>
                  </div>
                ))}
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link to="/auth?tab=signup">
                  <Button
                    size="lg"
                    aria-label="Start your free trial of EatPal meal planning"
                    className="bg-white text-primary hover:bg-white/90 shadow-xl hover:shadow-2xl transition-all text-lg px-10 py-7 rounded-full gap-2"
                  >
                    Start Free Trial <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </Button>
                </Link>
                <Link to="/pricing">
                  <Button
                    size="lg"
                    variant="outline"
                    aria-label="View EatPal pricing plans"
                    className="border-2 border-white/30 text-white hover:bg-white/10 text-lg px-10 py-7 rounded-full"
                  >
                    View Pricing
                  </Button>
                </Link>
              </div>

              {/* Trust badges */}
              <p className="text-sm text-white/60 mt-8 font-medium">
                <span className="text-white">Free forever plan available</span> • No credit card required • Cancel anytime
              </p>

              {/* Social proof */}
              <div className="flex justify-center items-center gap-6 mt-8 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-xs text-white">
                        {["👩", "👨", "👩", "👨"][i-1]}
                      </div>
                    ))}
                  </div>
                  <span className="text-white/80 text-sm ml-2">2,000+ happy parents</span>
                </div>
                <div className="text-white/80 text-sm">⭐⭐⭐⭐⭐ 4.8/5 rating</div>
              </div>
            </div>
          </div>
        </section>

        <Footer />

        {/* Exit Intent Popup - Captures leaving visitors (lazy loaded) */}
        <Suspense fallback={null}>
          <ExitIntentPopup delay={5000} />
        </Suspense>
      </div>
    </>
  );
};

export default Landing;

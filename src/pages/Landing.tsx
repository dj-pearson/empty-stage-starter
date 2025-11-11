import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  Check,
  ArrowRight,
  Utensils,
  Brain,
  Calendar,
  TrendingUp,
  Heart,
  Sparkles,
  Users,
  ShoppingCart,
  Menu,
  X,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { WaitlistForm } from "@/components/WaitlistForm";
import { EnhancedHero } from "@/components/EnhancedHero";
import { ProcessSteps } from "@/components/ProcessSteps";
import { AnimatedSection, AnimatedItem } from "@/components/AnimatedSection";
import { CardNav } from "@/components/CardNav";
import { ProductShowcase3D } from "@/components/ProductShowcase3D";
import { FeatureCard3D } from "@/components/Card3DTilt";

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img
              src="/Logo-Green.png"
              alt="EatPal"
              className="h-8 block dark:hidden"
            />
            <img
              src="/Logo-White.png"
              alt="EatPal"
              className="h-8 hidden dark:block"
            />
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
            <Link to="/auth">
              <Button variant="ghost" className="font-medium">
                Sign In
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
                  <img
                    src="/Logo-Green.png"
                    alt="EatPal"
                    className="h-7 block dark:hidden"
                  />
                  <img
                    src="/Logo-White.png"
                    alt="EatPal"
                    className="h-7 hidden dark:block"
                  />
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
                  <Link to="/auth" onClick={closeMobileMenu}>
                    <Button size="lg" className="w-full">
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
      <EnhancedHero />

      {/* Strategic Pillars Overview Section */}
      <section className="py-24 px-4 bg-gradient-to-b from-background to-secondary/5">
        <div className="container mx-auto max-w-6xl">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 text-base px-6 py-2">The Platform That Gets Smarter Every Day</Badge>
            <h2 className="text-4xl md:text-6xl font-heading font-bold mb-6 text-primary">
              Not Just an App. An Operating System for Feeding Therapy.
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              EatPal is the industry-standard platform combining predictive AI, professional tools,
              behavioral insights, and community support to create the most powerful feeding therapy ecosystem in the world.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Pillar 1: AI Predictive Engine */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <AnimatedSection>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary">Pillar 1: AI Predictive Engine</Badge>
              <h3 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Make Food Introduction Success Predictable
              </h3>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Our AI doesn't just suggest foods—it predicts which foods your child is most likely to accept,
                when to introduce them, and how to bridge from safe foods to new foods. Every meal logged makes
                predictions better for all users.
              </p>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">70%+ Success Rate Predictions</h4>
                    <p className="text-muted-foreground">AI analyzes your child's acceptance patterns to recommend foods with the highest probability of success</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Data Network Effects</h4>
                    <p className="text-muted-foreground">Every family's data improves recommendations for everyone—creating an unbeatable competitive moat</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Texture & Flavor Bridging</h4>
                    <p className="text-muted-foreground">Smart algorithms identify the optimal pathway from current safe foods to target foods</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
            <AnimatedSection className="relative">
              <div className="bg-background rounded-2xl shadow-2xl p-8 border-2 border-primary/20">
                <h4 className="text-2xl font-bold mb-4 text-primary">🧠 AI in Action</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">Today's Best Try-Bite</span>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">72% Success</Badge>
                    </div>
                    <p className="text-2xl font-bold mb-2">Sweet Potato Fries</p>
                    <p className="text-sm text-muted-foreground">
                      💡 Bridges from their love of regular fries + orange foods
                    </p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="text-sm font-semibold mb-2">Based on Similar Children:</p>
                    <p className="text-muted-foreground text-sm">
                      Children who accepted carrots and French fries had an 83% acceptance rate for sweet potato fries within 5-7 exposures
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Pillar 2: Professional Platform */}
      <section className="py-24 px-4 bg-gradient-to-br from-secondary/5 to-background">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <AnimatedSection className="order-2 md:order-1 relative">
              <div className="bg-background rounded-2xl shadow-2xl p-8 border-2 border-secondary/20">
                <h4 className="text-2xl font-bold mb-4 text-primary">👩‍⚕️ Therapist Dashboard</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">Active Clients</span>
                      <span className="text-2xl font-bold text-primary">24</span>
                    </div>
                    <div className="h-2 bg-secondary/20 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-3/4"></div>
                    </div>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="text-sm font-semibold mb-2">This Week's Progress:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>✅ 18 session notes documented</li>
                      <li>✅ 6 insurance claims submitted</li>
                      <li>✅ 12 progress reports generated</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <p className="text-sm font-semibold text-green-800 dark:text-green-100">💰 Revenue: $4,200 this month</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
            <AnimatedSection className="order-1 md:order-2">
              <Badge className="mb-4 bg-secondary/10 text-secondary border-secondary">Pillar 2: Professional Platform</Badge>
              <h3 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                The Salesforce of Feeding Therapy
              </h3>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                Feeding therapists, dietitians, and OTs get a complete practice management platform: client management,
                session documentation, insurance billing, progress tracking, and telehealth—all in one place.
              </p>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Insurance Integration</h4>
                    <p className="text-muted-foreground">Generate superbills, verify benefits, submit claims, and track reimbursements—making therapy accessible and affordable</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Therapist Lock-In</h4>
                    <p className="text-muted-foreground">Once therapists adopt EatPal, they bring 20-50 client families—creating powerful network effects</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">HIPAA-Compliant Platform</h4>
                    <p className="text-muted-foreground">Enterprise-grade security with BAA, encrypted data, and audit logs for professional peace of mind</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Pillar 3: Data Insights Marketplace */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <AnimatedSection>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary">Pillar 3: Data Insights Marketplace</Badge>
              <h3 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Powering Research & Product Innovation
              </h3>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                EatPal's anonymized behavioral dataset is the world's largest repository of feeding therapy outcomes.
                We license insights to universities, food manufacturers, insurance companies, and public health organizations.
              </p>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">100,000+ Food Acceptance Attempts</h4>
                    <p className="text-muted-foreground">Anonymized data on which foods succeed, when, and why—invaluable for researchers and manufacturers</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">First-Mover Advantage</h4>
                    <p className="text-muted-foreground">No competitor has this depth of behavioral data—creating a defensible revenue stream</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Full Privacy Compliance</h4>
                    <p className="text-muted-foreground">HIPAA de-identification, GDPR compliance, and IRB-approved research frameworks</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
            <AnimatedSection className="relative">
              <div className="bg-background rounded-2xl shadow-2xl p-8 border-2 border-primary/20">
                <h4 className="text-2xl font-bold mb-4 text-primary">📊 Research Partners</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="font-semibold mb-2">Universities & Medical Centers</p>
                    <p className="text-sm text-muted-foreground">
                      Licensing datasets for feeding disorder research, intervention effectiveness studies, and nutrition science
                    </p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="font-semibold mb-2">Food Manufacturers</p>
                    <p className="text-sm text-muted-foreground">
                      Understanding texture preferences, flavor acceptance patterns, and product development insights
                    </p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <p className="font-semibold mb-2">Insurance & Healthcare Systems</p>
                    <p className="text-sm text-muted-foreground">
                      Prevention ROI analysis, intervention cost-effectiveness, and predictive risk modeling
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Pillar 4: Community Ecosystem */}
      <section className="py-24 px-4 bg-gradient-to-br from-secondary/5 to-background">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <AnimatedSection className="order-2 md:order-1 relative">
              <div className="bg-background rounded-2xl shadow-2xl p-8 border-2 border-secondary/20">
                <h4 className="text-2xl font-bold mb-4 text-primary">🌟 Community Marketplace</h4>
                <div className="space-y-4">
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">Meal Plan Templates</span>
                      <Badge>500+ Available</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Parents and therapists share proven meal plans for ARFID, autism, allergies, and sensory issues
                    </p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">Therapist Directory</span>
                      <Badge>200+ Professionals</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Find feeding therapists, dietitians, and OTs who specialize in picky eating and selective eating disorders
                    </p>
                  </div>
                  <div className="p-4 bg-secondary/10 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">Success Stories</span>
                      <Badge>1,000+ Journeys</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Real families sharing their progress, strategies, and breakthroughs
                    </p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
            <AnimatedSection className="order-1 md:order-2">
              <Badge className="mb-4 bg-secondary/10 text-secondary border-secondary">Pillar 4: Community Ecosystem</Badge>
              <h3 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
                Two-Sided Marketplace for Content & Services
              </h3>
              <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                EatPal is more than software—it's a thriving community where parents share strategies, therapists offer services,
                and everyone benefits from collective knowledge and experience.
              </p>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">User-Generated Content</h4>
                    <p className="text-muted-foreground">Meal plans, recipes, success stories, and strategies created by real families facing the same challenges</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Network Effects at Scale</h4>
                    <p className="text-muted-foreground">More users = more content = more value for everyone. The platform becomes indispensable.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center">
                    <Check className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg mb-1">Quality Curation & Brand Authority</h4>
                    <p className="text-muted-foreground">Expert moderation and vetting ensure only evidence-based, high-quality content reaches families</p>
                  </div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      {/* Features Section with Animations */}
      <section id="features" className="py-24 px-4">
        <div className="container mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-primary">
              Complete Kids Meal Planning Solution
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to make meal planning effortless for
              families with picky eaters, selective eating, and children's
              nutrition challenges
            </p>
          </AnimatedSection>
          <AnimatedSection staggerChildren className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 items-stretch">
            {features.map((feature) => (
              <AnimatedItem key={feature.title}>
                <FeatureCard3D
                  icon={feature.icon === Utensils ? '🍽️' :
                        feature.icon === Calendar ? '📅' :
                        feature.icon === Brain ? '🧠' :
                        feature.icon === ShoppingCart ? '🛒' :
                        feature.icon === Users ? '👨‍👩‍👧‍👦' : '📈'}
                  title={feature.title}
                  description={feature.description}
                />
              </AnimatedItem>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Enhanced Process Steps Section */}
      <ProcessSteps />

      {/* Interactive Card Navigation */}
      <CardNav />

      {/* 3D Product Showcase */}
      <ProductShowcase3D />

      {/* SEO Content Section - Rich text for search engines */}
      <section className="py-24 px-4 bg-background">
        <div className="container mx-auto max-w-5xl">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-3xl font-heading font-bold mb-6 text-primary">
              Why EatPal is the Industry-Defining Platform for Feeding Therapy
            </h2>
            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div>
                <h3 className="text-xl font-semibold mb-3 text-primary">
                  AI-Powered Predictive Intelligence
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  EatPal's AI Predictive Engine doesn't just suggest random foods—it predicts which foods your child is most likely to accept
                  based on acceptance patterns, texture progression, and behavioral data from thousands of families. Our machine learning models
                  achieve 70%+ accuracy in predicting food acceptance, making meal planning scientific rather than guesswork.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Every meal logged makes EatPal smarter for all users through data network effects. This creates an unassailable competitive moat—no
                  competitor can match our predictive accuracy without years of behavioral data from real families managing ARFID, autism-related
                  feeding issues, and selective eating disorders.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3 text-primary">
                  Professional-Grade Therapy Platform
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  EatPal is the Salesforce of feeding therapy. Feeding therapists, pediatric dietitians, and occupational therapists get complete
                  practice management tools: multi-client dashboards, SOAP note documentation, insurance billing and superbill generation, progress
                  tracking, telehealth integration, and HIPAA-compliant data storage. Therapists who adopt EatPal bring 20-50 client families to the platform.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Our insurance integration makes feeding therapy reimbursable through major payers, dramatically expanding access to professional
                  feeding therapy services for families struggling with picky eating, ARFID, and pediatric feeding disorders.
                </p>
              </div>
            </div>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              Powering Research & Product Innovation Worldwide
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              EatPal's anonymized behavioral dataset represents the world's largest repository of feeding therapy outcomes with 100,000+ documented
              food introduction attempts. We license this invaluable data to universities researching feeding disorders, food manufacturers developing
              sensory-friendly products, insurance companies calculating intervention ROI, and public health organizations studying childhood nutrition.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-12">
              This data insights marketplace creates a defensible B2B revenue stream that no competitor can replicate without years of data collection.
              Our first-mover advantage in aggregating feeding therapy outcomes, combined with rigorous HIPAA de-identification and GDPR compliance,
              positions EatPal as the authoritative source for feeding disorder research and product development insights.
            </p>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              Thriving Community Ecosystem & Marketplace
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              EatPal is more than software—it's a two-sided marketplace where parents share proven meal plan templates, success stories, and evidence-based
              strategies, while feeding therapists offer consultations, meal plan reviews, and therapy services. Our community marketplace features 500+
              user-generated meal plans, 200+ professional therapists in our directory, and 1,000+ documented family success stories.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-12">
              Network effects make EatPal indispensable: more users create more content, which attracts more therapists, which brings more families.
              Expert curation and quality vetting ensure only evidence-based, clinically-sound content reaches families managing picky eating, ARFID,
              autism spectrum feeding challenges, and sensory processing disorders.
            </p>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              Perfect for Parents Managing:
            </h3>
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              <Card className="p-6">
                <h4 className="font-semibold text-lg mb-2 text-primary">
                  ARFID & Feeding Disorders
                </h4>
                <p className="text-sm text-muted-foreground">
                  Specialized tools for Avoidant/Restrictive Food Intake Disorder with AI-powered food bridging, therapist collaboration,
                  and progress tracking validated by pediatric feeding specialists.
                </p>
              </Card>
              <Card className="p-6">
                <h4 className="font-semibold text-lg mb-2 text-primary">
                  Autism & Sensory Issues
                </h4>
                <p className="text-sm text-muted-foreground">
                  Track sensory preferences, texture hierarchies, and safe foods for autistic children. Connect with therapists experienced
                  in neurodivergent feeding challenges.
                </p>
              </Card>
              <Card className="p-6">
                <h4 className="font-semibold text-lg mb-2 text-primary">
                  Professional Therapy Clients
                </h4>
                <p className="text-sm text-muted-foreground">
                  Collaborate with your feeding therapist, dietitian, or OT through shared meal plans, real-time progress dashboards, and
                  secure messaging—all HIPAA-compliant.
                </p>
              </Card>
            </div>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              The Operating System for Feeding Therapy
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              EatPal isn't just another meal planning app for picky eaters—it's the comprehensive platform that combines predictive AI, professional tools,
              research-grade data insights, and community marketplace effects to create the most powerful feeding therapy ecosystem in the world. Our platform
              serves parents managing typical picky eating, toddler food refusal, ARFID, autism spectrum feeding challenges, and complex pediatric feeding disorders.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Join thousands of families and hundreds of feeding therapy professionals who trust EatPal as their complete solution for managing selective eating,
              tracking nutrition for limited diets, collaborating with healthcare providers, and achieving measurable progress in food acceptance and dietary variety.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary to-secondary">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary-foreground">
            Now Live!
          </h2>
          <p className="text-xl text-primary-foreground/90 mb-10 leading-relaxed">
            Start your free account today and transform how you plan meals for 
            your picky eater!
          </p>
          <Link to="/auth">
            <Button
              size="lg"
              variant="secondary"
              className="gap-2 text-lg px-8 py-6 shadow-xl"
            >
              Sign In (Existing Users) <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <p className="text-sm text-primary-foreground/70 mt-4">
            New registrations opening soon
          </p>
        </div>
      </section>

      {/* Get Started Section */}
      <section id="get-started" className="py-24 px-4 bg-gradient-to-b from-background to-secondary/10">
        <div className="container mx-auto max-w-2xl">
          <WaitlistForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-4 bg-secondary/5">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="/Logo-Green.png"
                  alt="EatPal"
                  className="h-8 block dark:hidden"
                />
                <img
                  src="/Logo-White.png"
                  alt="EatPal"
                  className="h-8 hidden dark:block"
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Making meal planning simple and stress-free for families with
                picky eaters.
              </p>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">
                Product
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <a
                    href="#features"
                    className="hover:text-primary transition-colors"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="hover:text-primary transition-colors"
                  >
                    How It Works
                  </a>
                </li>
                <li>
                  <Link
                    to="/pricing"
                    className="hover:text-primary transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    to="/blog"
                    className="hover:text-primary transition-colors"
                  >
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    to="/auth"
                    className="hover:text-primary transition-colors"
                  >
                    Get Started
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">
                Company
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/contact"
                    className="hover:text-primary transition-colors"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    to="/privacy"
                    className="hover:text-primary transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    to="/terms"
                    className="hover:text-primary transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">
                Support
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li>
                  <Link
                    to="/faq"
                    className="hover:text-primary transition-colors"
                  >
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact"
                    className="hover:text-primary transition-colors"
                  >
                    Help Center
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:Support@TryEatPal.com"
                    className="hover:text-primary transition-colors"
                  >
                    Support@TryEatPal.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>
              © 2025 EatPal. All rights reserved. Built with ❤️ for parents of
              picky eaters.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

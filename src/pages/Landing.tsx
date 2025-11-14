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
import { SEOHead } from "@/components/SEOHead";
import { OrganizationSchema, SoftwareAppSchema, FAQSchema } from "@/components/schema";
import { getPageSEO } from "@/lib/seo-config";

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Get SEO configuration for homepage
  const seoConfig = getPageSEO("home");

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
            <Link to="/auth?tab=signin">
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
                  <Link to="/auth?tab=signin" onClick={closeMobileMenu}>
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

      {/* Pain Points Section - If Mealtime Feels Like a Battle */}
      <section className="py-24 px-4 bg-gradient-to-b from-background to-secondary/5">
        <div className="container mx-auto max-w-6xl">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
              If Mealtime Feels Like a Battle, You're Not Alone
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Thousands of parents face these same challenges every single day
            </p>
          </AnimatedSection>

          <AnimatedSection staggerChildren className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
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
              <AnimatedItem key={index}>
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="text-5xl mb-4">{pain.icon}</div>
                    <CardTitle className="text-xl">{pain.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{pain.description}</p>
                  </CardContent>
                </Card>
              </AnimatedItem>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Solution Section - Meet EatPal */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10">
        <div className="container mx-auto max-w-6xl">
          <AnimatedSection className="text-center mb-16">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary">The Solution</Badge>
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
              Meet EatPal: Your Meal Planning Co-Pilot for Picky Eaters
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Built on food chaining science and loved by over 2,000 parents who've reclaimed peaceful mealtimes
            </p>
          </AnimatedSection>

          {/* 3 Steps - How It Works */}
          <AnimatedSection staggerChildren className="grid md:grid-cols-3 gap-8 mt-12">
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
              <AnimatedItem key={index}>
                <Card className="h-full bg-background border-2 hover:border-primary/30 transition-colors">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-2xl font-bold text-primary">{step.step}</span>
                      </div>
                      <div className="text-4xl">{step.icon}</div>
                    </div>
                    <CardTitle className="text-xl">{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{step.description}</p>
                  </CardContent>
                </Card>
              </AnimatedItem>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Benefits-Focused Features Section */}
      <section id="features" className="py-24 px-4 bg-gradient-to-br from-secondary/5 to-background">
        <div className="container mx-auto max-w-6xl">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
              Everything You Need to Turn Mealtime Stress into Mealtime Success
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Built specifically for parents of picky eaters—not another generic meal planner
            </p>
          </AnimatedSection>

          <AnimatedSection staggerChildren className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                <AnimatedItem key={index}>
                  <Card className="h-full hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{feature.description}</p>
                    </CardContent>
                  </Card>
                </AnimatedItem>
              );
            })}
          </AnimatedSection>
        </div>
      </section>

      {/* Social Proof / Testimonials Section */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10">
        <div className="container mx-auto max-w-6xl">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
              Trusted by Parents Just Like You
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Real families, real progress, real peace of mind at mealtimes
            </p>
          </AnimatedSection>

          <AnimatedSection staggerChildren className="grid md:grid-cols-3 gap-8">
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
              <AnimatedItem key={index}>
                <Card className="h-full">
                  <CardContent className="pt-6">
                    <div className="text-4xl text-primary mb-4">"</div>
                    <p className="text-muted-foreground mb-6 leading-relaxed">
                      {testimonial.quote}
                    </p>
                    <div className="border-t pt-4">
                      <p className="font-semibold text-primary">{testimonial.name}</p>
                      <p className="text-sm text-muted-foreground">{testimonial.detail}</p>
                    </div>
                  </CardContent>
                </Card>
              </AnimatedItem>
            ))}
          </AnimatedSection>

          <AnimatedSection delay={0.3} className="text-center mt-12">
            <div className="inline-flex items-center gap-8 flex-wrap justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">⭐⭐⭐⭐⭐</div>
                <p className="text-sm text-muted-foreground mt-2">4.8/5 stars</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">2,000+</div>
                <p className="text-sm text-muted-foreground mt-2">families</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">50,000+</div>
                <p className="text-sm text-muted-foreground mt-2">meals planned</p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* FAQ Section with enhanced content for SEO */}
      <section className="py-24 px-4 bg-gradient-to-br from-secondary/5 to-background">
        <div className="container mx-auto max-w-4xl">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-primary">
              Frequently Asked Questions About Food Chaining & EatPal
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to know about using food chaining therapy for picky eaters
            </p>
          </AnimatedSection>

          <AnimatedSection staggerChildren className="space-y-6">
            {faqs.map((faq, index) => (
              <AnimatedItem key={index}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">{faq.question}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </CardContent>
                </Card>
              </AnimatedItem>
            ))}
          </AnimatedSection>
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
    </>
  );
};

export default Landing;

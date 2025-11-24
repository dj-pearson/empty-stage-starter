import { useState, useRef } from "react";
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
} from "lucide-react";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { EnhancedHero } from "@/components/EnhancedHero";
import { FeatureCard3D } from "@/components/Card3DTilt";
import { ParallaxBackground } from "@/components/ParallaxBackground";
import { SEOHead } from "@/components/SEOHead";
import { OrganizationSchema, SoftwareAppSchema, FAQSchema } from "@/components/schema";
import { getPageSEO } from "@/lib/seo-config";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Get SEO configuration for homepage
  const seoConfig = getPageSEO("home");

  useGSAP(() => {
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
            start: "top 80%", // Start animation when top of section hits 80% of viewport
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

  }, { scope: containerRef });

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
                />
              </picture>
              <picture className="hidden dark:block">
                <source srcSet="/Logo-White.webp" type="image/webp" />
                <img
                  src="/Logo-White.png"
                  alt="EatPal"
                  className="h-8"
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
                    <picture className="block dark:hidden">
                      <source srcSet="/Logo-Green.webp" type="image/webp" />
                      <img
                        src="/Logo-Green.png"
                        alt="EatPal"
                        className="h-7"
                      />
                    </picture>
                    <picture className="hidden dark:block">
                      <source srcSet="/Logo-White.webp" type="image/webp" />
                      <img
                        src="/Logo-White.png"
                        alt="EatPal"
                        className="h-7"
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
        <div className="relative">
          <ParallaxBackground />
          <EnhancedHero />
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
        <section className="py-24 px-4 bg-gradient-to-br from-primary/5 to-secondary/10 relative">
          <ParallaxBackground className="opacity-50" />
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
        <section id="features" className="py-24 px-4 relative">
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
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default Landing;

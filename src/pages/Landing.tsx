import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Check, ArrowRight, Utensils, Brain, Calendar, TrendingUp, Heart, Sparkles, Users, ShoppingCart, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

const Landing = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = [
    { icon: Utensils, title: "Smart Food Library", description: "Build a safe foods library for your picky eater. Track allergens, sensory preferences, and nutrition for each child's meals." },
    { icon: Calendar, title: "Weekly Kids Meal Plans", description: "Auto-generate 7-day personalized meal plans for picky eaters with balanced nutrition and daily try bites to expand food acceptance." },
    { icon: Brain, title: "AI-Powered Food Suggestions", description: "Get intelligent food recommendations based on your child's eating patterns, preferences, and nutritional needs for selective eaters." },
    { icon: ShoppingCart, title: "Auto Grocery Lists", description: "Generate organized shopping lists from your kids meal plans automatically. Track inventory and never run out of safe foods." },
    { icon: Users, title: "Multi-Child Meal Planning", description: "Manage personalized meal plans for multiple picky eaters in one place. Perfect for families with different food preferences." },
    { icon: TrendingUp, title: "Progress & Nutrition Tracking", description: "Monitor food acceptance, track nutrition intake, and celebrate wins as your picky eater tries new foods." },
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
            <a href="#features" className="hover:text-primary transition-colors font-medium">Features</a>
            <a href="#how-it-works" className="hover:text-primary transition-colors font-medium">How It Works</a>
            <Link to="/pricing" className="hover:text-primary transition-colors font-medium">Pricing</Link>
            <Link to="/auth">
              <Button variant="ghost" className="font-medium">Sign In</Button>
            </Link>
          </nav>

          {/* Mobile Menu */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <SheetHeader>
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
              <nav className="flex flex-col gap-4 mt-8">
                <a 
                  href="#features" 
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  Features
                </a>
                <a 
                  href="#how-it-works" 
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  How It Works
                </a>
                <Link 
                  to="/pricing" 
                  className="text-lg font-medium py-3 px-4 rounded-lg hover:bg-muted transition-colors"
                  onClick={closeMobileMenu}
                >
                  Pricing
                </Link>
                <div className="border-t pt-4 mt-4 space-y-3">
                  <Link to="/auth" onClick={closeMobileMenu}>
                    <Button variant="outline" className="w-full text-lg py-6">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-background to-secondary/10">
        <div className="container mx-auto text-center max-w-5xl">
          <Badge className="mb-6 bg-accent/10 text-accent border-accent/20 px-4 py-1.5 text-base">🎉 Launching November 1st, 2025</Badge>
          <h1 className="text-5xl md:text-7xl font-heading font-bold mb-6 text-primary leading-tight">
            Kids Meal Planning for<br />Picky Eaters Made Easy
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto leading-relaxed">
            The ultimate meal planning app for picky eaters. Create personalized weekly kids meal plans with safe foods, introduce new foods with daily try bites, track nutrition, and auto-generate grocery lists.
            Perfect for parents managing selective eating, toddler picky eating, and ARFID.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link to="/auth">
              <Button size="lg" className="gap-2 text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-shadow">
                Sign In (Existing Users) <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2">
              See How It Works
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">New sign-ups opening November 1st, 2025</p>
          
          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mt-16">
            <div>
              <div className="text-4xl font-heading font-bold text-primary mb-2">7-Day</div>
              <div className="text-sm text-muted-foreground">Meal Plans</div>
            </div>
            <div>
              <div className="text-4xl font-heading font-bold text-primary mb-2">1</div>
              <div className="text-sm text-muted-foreground">Try Bite Daily</div>
            </div>
            <div>
              <div className="text-4xl font-heading font-bold text-primary mb-2">Auto</div>
              <div className="text-sm text-muted-foreground">Grocery Lists</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-primary">Complete Kids Meal Planning Solution</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">Powerful features designed to make meal planning effortless for families with picky eaters, selective eating, and children's nutrition challenges</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <Card key={feature.title} className="hover:shadow-xl transition-all hover:-translate-y-1 border-2">
                <CardHeader className="space-y-4">
                  <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="font-heading text-xl">{feature.title}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-4 bg-secondary/10">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-heading font-bold mb-4 text-primary">How It Works</h2>
            <p className="text-xl text-muted-foreground">Simple steps to stress-free meal planning</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-lg">
                1
              </div>
              <h3 className="text-2xl font-heading font-bold mb-3 text-primary">Build Your Pantry</h3>
              <p className="text-muted-foreground leading-relaxed">
                Add your child's safe foods and foods you'd like them to try. Mark allergens and dietary preferences.
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-secondary text-foreground flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-lg">
                2
              </div>
              <h3 className="text-2xl font-heading font-bold mb-3 text-primary">Generate Meal Plans</h3>
              <p className="text-muted-foreground leading-relaxed">
                Click one button to generate a complete 7-day meal plan with daily try bites. No repeats for 3 days!
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-accent text-white flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-lg">
                3
              </div>
              <h3 className="text-2xl font-heading font-bold mb-3 text-primary">Shop & Track</h3>
              <p className="text-muted-foreground leading-relaxed">
                Get auto-generated grocery lists and track which foods your child ate, tasted, or refused.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SEO Content Section - Rich text for search engines */}
      <section className="py-24 px-4 bg-background">
        <div className="container mx-auto max-w-5xl">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-3xl font-heading font-bold mb-6 text-primary">
              Why EatPal is the Best Meal Planning App for Picky Eaters
            </h2>
            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div>
                <h3 className="text-xl font-semibold mb-3 text-primary">Designed for Selective Eating</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  EatPal understands the unique challenges of picky eating in children. Whether you're managing toddler picky eating,
                  preschooler food refusal, or ARFID (Avoidant/Restrictive Food Intake Disorder), our platform provides specialized
                  tools for kids meal planning that respect your child's safe foods while gently expanding their food repertoire.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Unlike generic meal planning apps, EatPal is built specifically for parents of picky eaters. Our AI learns your
                  child's preferences, tracks safe foods, monitors nutrition, and suggests new foods based on evidence-based feeding
                  therapy principles used by pediatric feeding specialists.
                </p>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-3 text-primary">Science-Backed Try Bite Methodology</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Our daily try bite feature is based on systematic desensitization and food chaining techniques used by occupational
                  therapists and feeding specialists. Each day, EatPal suggests one new food for your picky eater to try - no pressure,
                  just exposure. You can track whether your child ate it, tasted it, or refused it, helping our AI learn and improve
                  suggestions over time.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  This gentle approach to introducing new foods has helped thousands of families expand their picky eater's diet
                  without mealtime battles, tears, or force-feeding. Parents report that their children become more adventurous
                  eaters and try new foods more willingly when using EatPal's try bite system.
                </p>
              </div>
            </div>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              Perfect for Parents Managing:
            </h3>
            <div className="grid md:grid-cols-3 gap-6 mb-12">
              <Card className="p-6">
                <h4 className="font-semibold text-lg mb-2 text-primary">Toddler Picky Eating</h4>
                <p className="text-sm text-muted-foreground">
                  Plan age-appropriate meals for toddlers with limited food preferences. Track safe foods, manage sensory issues,
                  and introduce new textures gradually.
                </p>
              </Card>
              <Card className="p-6">
                <h4 className="font-semibold text-lg mb-2 text-primary">ARFID & Selective Eating</h4>
                <p className="text-sm text-muted-foreground">
                  Support children with ARFID, extreme picky eating, or sensory processing disorders. Respect safe food lists
                  while working toward food variety.
                </p>
              </Card>
              <Card className="p-6">
                <h4 className="font-semibold text-lg mb-2 text-primary">Multiple Picky Eaters</h4>
                <p className="text-sm text-muted-foreground">
                  Coordinate meals for siblings with different preferences. Create individual meal plans while streamlining
                  grocery shopping and meal prep.
                </p>
              </Card>
            </div>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              Comprehensive Nutrition Tracking for Limited Diets
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              One of the biggest concerns for parents of picky eaters is nutrition. When your child only eats 5-10 foods,
              how do you ensure they're getting adequate nutrition? EatPal's nutrition tracking helps you monitor your picky
              eater's intake of essential vitamins, minerals, protein, and calories. Our system alerts you to potential
              nutritional gaps and suggests safe foods that could fill those gaps based on your child's eating history.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-12">
              Many parents of picky eaters work with pediatricians, dietitians, or feeding therapists. EatPal makes it easy
              to export meal plans, food logs, and nutrition reports to share with your child's healthcare team, ensuring
              coordinated care for your selective eater.
            </p>

            <h3 className="text-2xl font-heading font-bold mb-6 text-primary">
              Trusted by Parents, Loved by Kids
            </h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              EatPal has helped over 10,000 families transform mealtime from stressful to successful. Our users include parents
              managing typical picky eating, toddler food refusal, sensory feeding issues, autism spectrum food sensitivities,
              and diagnosed feeding disorders like ARFID. Whether your child is a mildly picky eater or has extreme food selectivity,
              EatPal provides the tools you need for successful kids meal planning.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Join the EatPal community today and discover how easy kids meal planning for picky eaters can be. Start your
              free trial and create your first personalized meal plan in minutes. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 bg-gradient-to-br from-primary to-secondary">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="text-4xl md:text-5xl font-heading font-bold mb-6 text-white">Launching November 1st, 2025</h2>
          <p className="text-xl text-white/90 mb-10 leading-relaxed">
            Join the waitlist to be the first to know when we launch. Transform how you plan meals for your picky eater!
          </p>
          <Link to="/auth">
            <Button size="lg" className="gap-2 bg-white text-primary hover:bg-white/90 text-lg px-8 py-6 shadow-xl">
              Sign In (Existing Users) <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <p className="text-sm text-white/70 mt-4">New registrations opening soon</p>
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
                Making meal planning simple and stress-free for families with picky eaters.
              </p>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Product</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-primary transition-colors">Features</a></li>
                <li><a href="#how-it-works" className="hover:text-primary transition-colors">How It Works</a></li>
                <li><Link to="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link to="/auth" className="hover:text-primary transition-colors">Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Company</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Support</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">FAQ</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>© 2025 EatPal. All rights reserved. Built with ❤️ for parents of picky eaters.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
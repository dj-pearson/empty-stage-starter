import { useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Clock,
  Heart,
  Sparkles,
  Smile,
  CheckCircle,
  TrendingUp,
  BookOpen,
  ClipboardList,
  BarChart,
  Trophy,
  Zap,
  Store,
  CheckSquare,
  Truck,
  PieChart,
  AlertCircle,
  User,
  FileText,
  ArrowRight,
} from "lucide-react";
import { SEOHead } from "@/components/SEOHead";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { RelatedPages } from "@/components/seo/RelatedPages";
import {
  featurePages,
  getPageSEOProps,
  generateFAQStructuredData,
  generateBreadcrumbData,
  type FeaturePageData,
} from "@/lib/programmatic-seo";

// Icon mapping for dynamic icon rendering
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Clock,
  Heart,
  Sparkles,
  Smile,
  CheckCircle,
  TrendingUp,
  BookOpen,
  ClipboardList,
  BarChart,
  Trophy,
  Zap,
  Store,
  CheckSquare,
  Truck,
  PieChart,
  AlertCircle,
  User,
  FileText,
};

const FeaturePage = () => {
  const { slug } = useParams<{ slug: string }>();

  const pageData = useMemo(() => {
    if (!slug) return null;
    return featurePages[slug] || null;
  }, [slug]);

  // Redirect to 404 if page doesn't exist
  if (!pageData) {
    return <Navigate to="/404" replace />;
  }

  const seoProps = getPageSEOProps(pageData, "feature");
  const baseUrl = "https://tryeatpal.com";

  // Generate structured data
  const structuredData = [
    generateBreadcrumbData([
      { name: "Home", url: baseUrl },
      { name: "Features", url: `${baseUrl}/features` },
      { name: pageData.headline, url: `${baseUrl}/features/${pageData.slug}` },
    ]),
    generateFAQStructuredData(pageData.faqs),
    {
      "@type": "WebPage",
      "@id": `${baseUrl}/features/${pageData.slug}#webpage`,
      url: `${baseUrl}/features/${pageData.slug}`,
      name: pageData.title,
      description: pageData.description,
      isPartOf: { "@id": `${baseUrl}/#website` },
    },
  ];

  // Build related pages data
  const relatedPagesData = pageData.relatedPages
    .map((slug) => {
      const related = featurePages[slug];
      if (!related) return null;
      return {
        title: related.headline,
        description: related.subheadline,
        href: `/features/${slug}`,
      };
    })
    .filter(Boolean) as Array<{ title: string; description: string; href: string }>;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead {...seoProps} structuredData={structuredData} />

      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2">
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
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost">Pricing</Button>
            </Link>
            <Link to="/auth">
              <Button>{pageData.cta.primary}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div className="container mx-auto px-4 py-4">
        <Breadcrumbs
          items={[
            { name: "Features", href: "/features" },
            { name: pageData.headline, href: `/features/${pageData.slug}` },
          ]}
        />
      </div>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold mb-6 text-primary">
            {pageData.headline}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed">
            {pageData.subheadline}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/auth">
              <Button size="lg" className="w-full sm:w-auto gap-2">
                {pageData.cta.primary}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/#how-it-works">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                {pageData.cta.secondary}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-secondary/10 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-heading font-bold text-center mb-12 text-primary">
            Why Choose EatPal for {pageData.headline}
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pageData.benefits.map((benefit, index) => {
              const IconComponent = iconMap[benefit.icon] || Sparkles;
              return (
                <Card key={index} className="text-center">
                  <CardHeader>
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                      <IconComponent className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{benefit.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-heading font-bold text-center mb-12 text-primary">
            Key Features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {pageData.features.map((feature, index) => (
              <div key={index} className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                    {index + 1}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-secondary/10 py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-heading font-bold text-center mb-12 text-primary">
            Frequently Asked Questions
          </h2>
          <div className="max-w-3xl mx-auto">
            <Accordion type="single" collapsible className="w-full">
              {pageData.faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left font-semibold">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Related Pages */}
      <section className="container mx-auto px-4">
        <RelatedPages
          title="Explore More Features"
          pages={relatedPagesData}
        />
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-heading font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of families making mealtime easier.
          </p>
          <Link to="/auth">
            <Button size="lg" variant="secondary" className="gap-2">
              {pageData.cta.primary}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-4 bg-secondary/5">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
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
              </Link>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Making meal planning simple and stress-free for families with picky eaters.
              </p>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Features</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/features/kids-meal-planning" className="hover:text-primary transition-colors">Kids Meal Planning</Link></li>
                <li><Link to="/features/picky-eater-solutions" className="hover:text-primary transition-colors">Picky Eater Solutions</Link></li>
                <li><Link to="/features/try-bites" className="hover:text-primary transition-colors">Try Bites Tracking</Link></li>
                <li><Link to="/features/nutrition-tracking" className="hover:text-primary transition-colors">Nutrition Tracking</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Solutions</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/solutions/toddler-meal-planning" className="hover:text-primary transition-colors">Toddler Meal Planning</Link></li>
                <li><Link to="/solutions/arfid-meal-planning" className="hover:text-primary transition-colors">ARFID Support</Link></li>
                <li><Link to="/solutions/selective-eating" className="hover:text-primary transition-colors">Selective Eating</Link></li>
                <li><Link to="/solutions/multi-child-meal-planning" className="hover:text-primary transition-colors">Multi-Child Planning</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-heading font-semibold mb-4 text-primary">Company</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li><Link to="/pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
                <li><Link to="/blog" className="hover:text-primary transition-colors">Blog</Link></li>
                <li><Link to="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
                <li><Link to="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
            <p>© 2025 EatPal. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default FeaturePage;

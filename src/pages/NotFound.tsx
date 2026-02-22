import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowRight, Search, BookOpen, HelpCircle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  const suggestedPages = [
    {
      icon: Home,
      label: "Dashboard",
      description: "Go to your meal planning dashboard",
      href: "/dashboard",
    },
    {
      icon: Search,
      label: "Picky Eater Quiz",
      description: "Discover your child's eating personality",
      href: "/picky-eater-quiz",
    },
    {
      icon: BookOpen,
      label: "Blog",
      description: "Tips and guides for picky eaters",
      href: "/blog",
    },
    {
      icon: HelpCircle,
      label: "FAQ",
      description: "Answers to common questions",
      href: "/faq",
    },
  ];

  return (
    <>
      <Helmet>
        <title>Page Not Found - EatPal</title>
        <meta name="description" content="The page you're looking for could not be found." />
      </Helmet>

      <main id="main-content" role="main" aria-label="Page not found" className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-secondary/10">
        <div className="container mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="text-8xl mb-6">🍽️</div>
          <h1 className="mb-2 text-6xl font-heading font-bold text-primary">404</h1>
          <p className="mb-2 text-2xl text-foreground font-semibold">This page isn't on the menu</p>
          <p className="mb-10 text-muted-foreground">
            We couldn't find <code className="px-1.5 py-0.5 bg-muted rounded text-sm">{location.pathname}</code>. It may have been moved or doesn't exist.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Link to="/">
              <Button size="lg" className="gap-2">
                <Home className="h-4 w-4" aria-hidden="true" />
                Go Home
              </Button>
            </Link>
            <Link to="/auth?tab=signup">
              <Button size="lg" variant="outline" className="gap-2">
                Get Started Free <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-4">Or try one of these:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {suggestedPages.map((page) => {
                const Icon = page.icon;
                return (
                  <Link key={page.href} to={page.href}>
                    <Card className="h-full hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
                      <CardContent className="p-4 text-center">
                        <Icon className="h-5 w-5 text-primary mx-auto mb-2" aria-hidden="true" />
                        <p className="text-sm font-medium text-foreground">{page.label}</p>
                        <p className="text-xs text-muted-foreground mt-1">{page.description}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default NotFound;

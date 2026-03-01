import { useState, useEffect } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Home, DollarSign, HelpCircle, BookOpen, Mail, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const [search, setSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    logger.error("404 Error: User attempted to access non-existent route:", location.pathname);

    // Analytics tracking for 404 hits
    if (typeof window !== "undefined" && (window as Record<string, unknown>).gtag) {
      (window as Record<string, (...args: unknown[]) => void>).gtag("event", "page_not_found", {
        page_path: location.pathname,
        page_referrer: document.referrer,
      });
    }
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/blog?q=${encodeURIComponent(search)}`);
    }
  };

  const popularPages = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/pricing", icon: DollarSign, label: "Pricing" },
    { to: "/faq", icon: HelpCircle, label: "FAQ" },
    { to: "/blog", icon: BookOpen, label: "Blog" },
    { to: "/contact", icon: Mail, label: "Contact Support" },
  ];

  return (
    <>
      <Helmet>
        <title>Page Not Found - EatPal</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl font-bold text-primary">404</div>
          <h1 className="text-2xl font-bold">Page not found</h1>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Search our site..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="icon" aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          </form>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Popular pages</p>
            <div className="flex flex-wrap justify-center gap-2">
              {popularPages.map((p) => (
                <Button key={p.to} variant="outline" size="sm" asChild>
                  <Link to={p.to}>
                    <p.icon className="h-4 w-4 mr-1" />
                    {p.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>

          <Button variant="ghost" asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to home
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}

import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <>
      <Helmet>
        <title>Page Not Found - EatPal</title>
        <meta name="description" content="The page you're looking for could not be found." />
      </Helmet>

      <main id="main-content" role="main" aria-label="Page not found" className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center px-4">
          <h1 className="mb-4 text-6xl font-bold text-primary">404</h1>
          <p className="mb-2 text-xl text-foreground font-semibold">Page not found</p>
          <p className="mb-8 text-muted-foreground">
            The page <code className="px-1.5 py-0.5 bg-muted rounded text-sm">{location.pathname}</code> doesn't exist.
          </p>
          <Link to="/">
            <Button size="lg">
              <Home className="h-4 w-4 mr-2" aria-hidden="true" />
              Return to Home
            </Button>
          </Link>
        </div>
      </main>
    </>
  );
};

export default NotFound;

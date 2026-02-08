import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Home, RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";
import { logError } from "@/lib/sentry";

interface RouteErrorBoundaryProps {
  children: React.ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Route-level error boundary that isolates crashes to individual pages.
 *
 * Unlike the global ErrorBoundary, this:
 * - Wraps individual routes so one page crash doesn't break the whole app
 * - Provides navigation options (go back, go home) instead of full-page error
 * - Reports route path context to Sentry for debugging
 * - Shows dev-only error details in development mode
 */
class RouteErrorBoundaryInner extends React.Component<
  RouteErrorBoundaryProps & { routePath: string; onGoBack: () => void; onGoHome: () => void },
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps & { routePath: string; onGoBack: () => void; onGoHome: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error(`Route error at ${this.props.routePath}:`, error, {
      componentStack: errorInfo.componentStack,
    });

    logError(error, {
      routePath: this.props.routePath,
      componentStack: errorInfo.componentStack,
      boundary: "RouteErrorBoundary",
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] p-6">
          <Card className="max-w-lg w-full border-destructive/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                This page encountered an error
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Something went wrong loading this page. The rest of the app is still
                working — you can go back or navigate to another page.
              </p>

              {this.state.error && import.meta.env.DEV && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground font-medium">
                    Error details (dev only)
                  </summary>
                  <pre className="mt-2 p-3 bg-muted rounded overflow-auto max-h-48 whitespace-pre-wrap">
                    {this.state.error.message}
                    {this.state.error.stack && `\n\n${this.state.error.stack}`}
                  </pre>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={this.handleReset} variant="default" className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={this.props.onGoBack} variant="outline" className="flex-1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Go Back
                </Button>
                <Button onClick={this.props.onGoHome} variant="outline" className="flex-1">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Wrapper that provides router hooks to the class-based error boundary.
 * React error boundaries must be class components, but we need router context.
 */
export function RouteErrorBoundary({ children }: RouteErrorBoundaryProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate("/");
  };

  return (
    <RouteErrorBoundaryInner
      routePath={location.pathname}
      onGoBack={handleGoBack}
      onGoHome={handleGoHome}
    >
      {children}
    </RouteErrorBoundaryInner>
  );
}

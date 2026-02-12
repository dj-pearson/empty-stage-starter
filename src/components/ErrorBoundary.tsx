import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";
import { logError } from "@/lib/sentry";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** When true, renders a full-page error UI suitable for wrapping the entire app */
  fullPage?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    logger.error('Error caught by boundary:', error, { componentStack: errorInfo.componentStack });

    // Report to Sentry with component stack trace
    logError(error, {
      componentStack: errorInfo.componentStack,
      boundary: this.props.fullPage ? "GlobalErrorBoundary" : "ErrorBoundary",
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      if (this.props.fullPage) {
        return (
          <GlobalErrorFallback
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            resetError={this.handleReset}
          />
        );
      }

      return (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Something went wrong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We encountered an error while loading this component.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer hover:text-foreground">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <Button onClick={this.handleReset} variant="outline" className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

/**
 * Full-page error fallback for the top-level error boundary.
 * Shows a user-friendly error page with recovery options.
 * In development, shows the full stack trace for debugging.
 */
function GlobalErrorFallback({
  error,
  errorInfo,
  resetError,
}: {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  resetError: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                An unexpected error occurred. Please try again.
              </p>
            </div>
          </div>

          {import.meta.env.DEV && error && (
            <div className="bg-muted p-3 rounded text-xs font-mono overflow-auto max-h-64">
              <p className="text-destructive font-semibold mb-1">Error:</p>
              <p className="whitespace-pre-wrap">{error.message}</p>
              {error.stack && (
                <>
                  <p className="text-destructive font-semibold mt-2 mb-1">Stack:</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{error.stack}</p>
                </>
              )}
              {errorInfo?.componentStack && (
                <>
                  <p className="text-destructive font-semibold mt-2 mb-1">Component Stack:</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {errorInfo.componentStack}
                  </p>
                </>
              )}
            </div>
          )}

          {!import.meta.env.DEV && (
            <p className="text-sm text-muted-foreground">
              Our team has been notified and is working on a fix. You can try refreshing
              the page or return to the home page.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={resetError}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="flex-1 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Functional component version for simple use cases
export function ErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Error
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred"}
        </p>
        <Button onClick={resetError} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

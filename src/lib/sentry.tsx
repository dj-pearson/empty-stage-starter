import * as Sentry from "@sentry/react";
import { logger } from "@/lib/logger";

export function initializeSentry() {
  // Only initialize in production or if explicitly enabled
  if (import.meta.env.MODE === 'production' || import.meta.env.VITE_SENTRY_ENABLED === 'true') {
    // Skip if no DSN is configured
    if (!import.meta.env.VITE_SENTRY_DSN) {
      console.warn('Sentry DSN not configured, skipping initialization');
      return;
    }

    try {
      // Start with minimal integrations - replay is loaded lazily on error
      const integrations: Sentry.Integration[] = [
        Sentry.browserTracingIntegration(),
      ];

      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        environment: import.meta.env.MODE,

      // Performance Monitoring - replay loaded lazily via lazyLoadIntegration
      integrations,

      // Performance Monitoring sample rates
      tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,

      // Session Replay is lazy loaded - these are applied when replay loads
      // replaysSessionSampleRate: 0.1 (10% of sessions)
      // replaysOnErrorSampleRate: 1.0 (100% of sessions with errors)

      // Ignore certain errors
      ignoreErrors: [
        // Browser extensions
        'top.GLOBALS',
        'chrome-extension://',
        'moz-extension://',
        // Network errors
        'NetworkError',
        'Failed to fetch',
        // React hydration warnings
        'Hydration failed',
      ],

      // Filter sensitive data
      beforeSend(event, hint) {
        // Remove sensitive data from event
        if (event.request?.cookies) {
          delete event.request.cookies;
        }

        if (event.request?.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['Cookie'];
        }

        // Remove PII from breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
            if (breadcrumb.data) {
              // Remove email, phone, etc.
              const sanitized = { ...breadcrumb.data };
              delete sanitized.email;
              delete sanitized.phone;
              delete sanitized.password;
              return { ...breadcrumb, data: sanitized };
            }
            return breadcrumb;
          });
        }

        return event;
      },

      // Set user context (non-PII only)
      beforeSendTransaction(transaction) {
        // Add custom tags
        transaction.tags = {
          ...transaction.tags,
          app_version: import.meta.env.VITE_APP_VERSION || '0.0.0',
        };
        return transaction;
      },
    });
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  }
}

// Lazy load replay integration only when needed (on error)
// This saves ~770KB from the initial bundle by not importing replay at startup
let replayLoaded = false;
export async function lazyLoadReplay() {
  if (replayLoaded) return;
  if (import.meta.env.MODE !== 'production' && import.meta.env.VITE_SENTRY_ENABLED !== 'true') return;

  try {
    replayLoaded = true;
    const client = Sentry.getClient();
    if (!client) return;

    // Dynamically import the replay module - this creates a separate chunk
    const { replayIntegration } = await import('@sentry/react');

    const replay = replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    });

    client.addIntegration(replay);
    console.log('[Sentry] Replay integration loaded');
  } catch (error) {
    console.warn('[Sentry] Failed to load replay:', error);
  }
}

// Error boundary fallback component
export function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-destructive"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
              <p className="text-sm text-muted-foreground">
                We've been notified and are working on a fix
              </p>
            </div>
          </div>

          {import.meta.env.MODE === 'development' && (
            <div className="bg-muted p-3 rounded text-xs font-mono overflow-auto max-h-40">
              <p className="text-destructive font-semibold mb-1">Error:</p>
              <p className="whitespace-pre-wrap">{error.message}</p>
              {error.stack && (
                <>
                  <p className="text-destructive font-semibold mt-2 mb-1">Stack:</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{error.stack}</p>
                </>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={resetError}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = '/'}
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

// Custom error logging utility
export function logError(error: Error, context?: Record<string, any>) {
  logger.error('Error:', error);

  if (import.meta.env.MODE === 'production' || import.meta.env.VITE_SENTRY_ENABLED === 'true') {
    Sentry.captureException(error, {
      tags: {
        custom_error: true,
      },
      extra: context,
    });
  }
}

// Log API errors with context
export function logApiError(endpoint: string, error: any, requestData?: any) {
  const errorContext = {
    endpoint,
    requestData,
    status: error?.status,
    statusText: error?.statusText,
  };

  logger.error('API Error:', errorContext);

  if (import.meta.env.MODE === 'production' || import.meta.env.VITE_SENTRY_ENABLED === 'true') {
    Sentry.captureException(error, {
      tags: {
        type: 'api_error',
        endpoint,
      },
      extra: errorContext,
    });
  }
}

// Track custom events
export function trackEvent(eventName: string, data?: Record<string, any>) {
  if (import.meta.env.MODE === 'production' || import.meta.env.VITE_SENTRY_ENABLED === 'true') {
    Sentry.addBreadcrumb({
      category: 'custom_event',
      message: eventName,
      level: 'info',
      data,
    });
  }
}

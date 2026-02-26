import { Helmet } from 'react-helmet-async';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

function EndpointEntry({ method, path, auth, description }: { method: string; path: string; auth: string; description: string }) {
  const methodColor = method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
    : method === 'POST' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
    : 'bg-gray-100 text-gray-700';

  return (
    <div className="flex items-start gap-3 p-3 bg-background rounded-md">
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor}`}>{method}</span>
      <div className="flex-1">
        <code className="text-sm font-mono font-semibold">{path}</code>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">Auth: {auth}</span>
    </div>
  );
}

export default function ApiDocs() {
  return (
    <>
      <Helmet>
        <title>API Documentation - EatPal</title>
        <meta name="description" content="Interactive API documentation for EatPal Edge Functions. Explore endpoints, request/response schemas, and try out API calls." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div id="main-content" className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">EatPal API Documentation</h1>
            <p className="text-muted-foreground text-lg">
              Interactive documentation for all EatPal Edge Functions. Explore endpoints, test requests, and view detailed schemas.
            </p>
          </div>

          <div className="bg-card rounded-lg shadow-sm overflow-hidden">
            <SwaggerUI
              url="/openapi.json"
              docExpansion="list"
              defaultModelsExpandDepth={1}
              displayRequestDuration={true}
              filter={true}
              tryItOutEnabled={true}
              persistAuthorization={true}
            />
          </div>

          <div className="mt-8 p-6 bg-muted rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Authentication</h2>
            <p className="mb-4">
              Most endpoints require authentication using a Supabase JWT token. To authenticate:
            </p>
            <ol className="list-decimal list-inside space-y-2 mb-4">
              <li>Sign in to your EatPal account</li>
              <li>Obtain your session access token from <code className="bg-background px-2 py-1 rounded">supabase.auth.getSession()</code></li>
              <li>Click the "Authorize" button above</li>
              <li>Enter your token in the format: <code className="bg-background px-2 py-1 rounded">Bearer YOUR_TOKEN</code></li>
            </ol>
            <p className="text-sm text-muted-foreground">
              Note: The <code className="bg-background px-2 py-1 rounded">/track-engagement</code> endpoint uses the anonymous key instead of a user JWT.
            </p>
          </div>

          <div className="mt-6 p-6 bg-muted rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Rate Limits</h2>
            <p className="mb-2">
              All API endpoints are subject to the following rate limits:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>100 requests per minute per authenticated user</li>
              <li>1,000 requests per hour per authenticated user</li>
              <li>10,000 requests per day per household</li>
            </ul>
          </div>

          {/* Endpoint Reference by Feature Area */}
          <div className="mt-8 space-y-6">
            <h2 className="text-2xl font-bold">Edge Function Reference</h2>

            {/* Foods & Nutrition */}
            <div className="p-6 bg-muted rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Foods & Nutrition</h3>
              <div className="space-y-3">
                <EndpointEntry method="POST" path="/calculate-food-similarity" auth="JWT" description="Compute similarity scores between foods by category, allergens, safety, and name overlap." />
                <EndpointEntry method="POST" path="/suggest-foods" auth="JWT" description="Get safe food suggestions for a child based on allergens, preferences, and history." />
                <EndpointEntry method="POST" path="/parse-recipe" auth="None" description="Extract recipe data from a URL via JSON-LD structured data with HTML fallback." />
              </div>
            </div>

            {/* Meal Planning */}
            <div className="p-6 bg-muted rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Meal Planning</h3>
              <div className="space-y-3">
                <EndpointEntry method="POST" path="/suggest-recipe" auth="JWT" description="Rank recipes by ingredient availability and filter by allergens." />
                <EndpointEntry method="POST" path="/ai-meal-plan" auth="JWT" description="Generate weekly meal plans using algorithmic distribution. AI-powered when OPENAI_API_KEY is configured." />
              </div>
            </div>

            {/* Billing & Subscriptions */}
            <div className="p-6 bg-muted rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Billing & Subscriptions</h3>
              <div className="space-y-3">
                <EndpointEntry method="POST" path="/create-checkout" auth="JWT" description="Create a Stripe checkout session for subscription purchases. Returns a checkout URL." />
                <EndpointEntry method="POST" path="/stripe-webhook" auth="Stripe Signature" description="Process Stripe webhook events (checkout completed, subscription updated/deleted, payment failed)." />
              </div>
            </div>

            {/* Content & Marketing */}
            <div className="p-6 bg-muted rounded-lg">
              <h3 className="text-xl font-semibold mb-3">Content & Marketing</h3>
              <div className="space-y-3">
                <EndpointEntry method="POST" path="/generate-blog-content" auth="None" description="Generate blog content via OpenAI (gpt-4o-mini) or structured template fallback." />
                <EndpointEntry method="POST" path="/generate-social-content" auth="None" description="Generate platform-specific social media posts for Twitter, Instagram, and Facebook." />
                <EndpointEntry method="POST" path="/update-blog-image" auth="None" description="Fetch an image URL and upload to Supabase Storage with size variants." />
              </div>
            </div>

            {/* System */}
            <div className="p-6 bg-muted rounded-lg">
              <h3 className="text-xl font-semibold mb-3">System</h3>
              <div className="space-y-3">
                <EndpointEntry method="GET" path="/health-check" auth="None" description="Check API health, database connectivity, and version info." />
              </div>
            </div>
          </div>

          <div className="mt-6 p-6 bg-muted rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Support</h2>
            <p>
              For API support or to report issues, please contact us at{' '}
              <a href="mailto:support@eatpal.com" className="text-primary hover:underline">
                support@eatpal.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

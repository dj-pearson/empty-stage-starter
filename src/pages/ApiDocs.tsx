import { Helmet } from 'react-helmet-async';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function ApiDocs() {
  return (
    <>
      <Helmet>
        <title>API Documentation - EatPal</title>
        <meta name="description" content="Interactive API documentation for EatPal Edge Functions. Explore endpoints, request/response schemas, and try out API calls." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="min-h-screen bg-background">
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

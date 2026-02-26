import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { ChevronDown, ChevronRight } from 'lucide-react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

interface EndpointDetailProps {
  method: string;
  path: string;
  auth: string;
  description: string;
  requestBody?: string;
  responseBody?: string;
  errorCodes?: Array<{ code: number; description: string }>;
}

function EndpointDetail({
  method,
  path,
  auth,
  description,
  requestBody,
  responseBody,
  errorCodes,
}: EndpointDetailProps) {
  const [isOpen, setIsOpen] = useState(false);
  const methodColor =
    method === 'GET'
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      : method === 'POST'
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
        : 'bg-gray-100 text-gray-700';

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-3 w-full p-3 bg-background hover:bg-muted/50 transition-colors text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${methodColor}`}>{method}</span>
        <code className="text-sm font-mono font-semibold">{path}</code>
        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">Auth: {auth}</span>
      </button>
      {isOpen && (
        <div className="p-4 border-t border-border bg-muted/30 space-y-4">
          <p className="text-sm text-muted-foreground">{description}</p>
          {requestBody && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Request Body</h4>
              <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
                <code>{requestBody}</code>
              </pre>
            </div>
          )}
          {responseBody && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Response</h4>
              <pre className="text-xs bg-background p-3 rounded overflow-x-auto">
                <code>{responseBody}</code>
              </pre>
            </div>
          )}
          {errorCodes && errorCodes.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Error Codes</h4>
              <ul className="text-xs space-y-1">
                {errorCodes.map((err) => (
                  <li key={err.code}>
                    <span className="font-mono font-semibold">{err.code}</span>{' '}
                    <span className="text-muted-foreground">- {err.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  return (
    <>
      <Helmet>
        <title>API Documentation - EatPal</title>
        <meta
          name="description"
          content="Interactive API documentation for EatPal Edge Functions. Explore endpoints, request/response schemas, and try out API calls."
        />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div id="main-content" className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">EatPal API Documentation</h1>
            <p className="text-muted-foreground text-lg">
              Complete reference for all EatPal Edge Functions with request/response schemas and examples.
            </p>
          </div>

          {/* Swagger UI */}
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

          {/* Authentication */}
          <div className="mt-8 p-6 bg-muted rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Authentication</h2>
            <p className="mb-4">
              Endpoints marked <strong>JWT</strong> require a Supabase session token in the Authorization header:
            </p>
            <pre className="text-xs bg-background p-3 rounded mb-4 overflow-x-auto">
              <code>{`Authorization: Bearer <your-supabase-jwt-token>`}</code>
            </pre>
            <ol className="list-decimal list-inside space-y-2 mb-4 text-sm">
              <li>
                Sign in via <code className="bg-background px-1.5 py-0.5 rounded">supabase.auth.signInWithPassword()</code>
              </li>
              <li>
                Retrieve token: <code className="bg-background px-1.5 py-0.5 rounded">{'const { data: { session } } = await supabase.auth.getSession()'}</code>
              </li>
              <li>
                Pass <code className="bg-background px-1.5 py-0.5 rounded">session.access_token</code> in the Authorization header
              </li>
            </ol>
            <p className="text-sm text-muted-foreground">
              Endpoints marked <strong>None</strong> are publicly accessible. The <strong>Stripe Signature</strong> endpoint uses HMAC-SHA256 webhook verification.
            </p>
          </div>

          {/* Rate Limits */}
          <div className="mt-6 p-6 bg-muted rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Rate Limits</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-background p-3 rounded text-center">
                <div className="text-2xl font-bold">100</div>
                <div className="text-xs text-muted-foreground">requests / minute</div>
              </div>
              <div className="bg-background p-3 rounded text-center">
                <div className="text-2xl font-bold">1,000</div>
                <div className="text-xs text-muted-foreground">requests / hour</div>
              </div>
              <div className="bg-background p-3 rounded text-center">
                <div className="text-2xl font-bold">10,000</div>
                <div className="text-xs text-muted-foreground">requests / day</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Login attempts: 5 per email per 15-minute window. Exceeding limits returns <code className="bg-background px-1.5 py-0.5 rounded">429 Too Many Requests</code>.
            </p>
          </div>

          {/* Endpoint Reference */}
          <div className="mt-8 space-y-8">
            <h2 className="text-2xl font-bold">Edge Function Reference</h2>

            {/* Foods & Nutrition */}
            <section>
              <h3 className="text-xl font-semibold mb-3">Foods &amp; Nutrition</h3>
              <div className="space-y-2">
                <EndpointDetail
                  method="POST"
                  path="/calculate-food-similarity"
                  auth="JWT"
                  description="Compute similarity scores between a given food and all other foods in the user's database. Scores are weighted: category (40%), allergens (20%), safety status (20%), name overlap (20%)."
                  requestBody={`{
  "food_id": "uuid-of-source-food"
}`}
                  responseBody={`{
  "source_food": { "id": "...", "name": "Apple", "category": "fruit" },
  "similar_foods": [
    {
      "id": "...",
      "name": "Pear",
      "category": "fruit",
      "similarity_score": 0.85
    }
  ]
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing food_id in request body' },
                    { code: 401, description: 'Invalid or missing JWT token' },
                    { code: 404, description: 'Food not found for the authenticated user' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/suggest-foods"
                  auth="JWT"
                  description="Get safe food suggestions for a child based on their allergens, preferences, and food history. Prioritizes foods that are novel (not yet tried) and match preferences."
                  requestBody={`{
  "kid_id": "uuid-of-child",
  "preferences": ["crunchy", "sweet"],
  "allergens": ["peanuts", "tree_nuts"]
}`}
                  responseBody={`{
  "suggestions": [
    {
      "id": "...",
      "name": "Strawberry",
      "category": "fruit",
      "score": 0.92,
      "reason": "Novel fruit, matches sweet preference"
    }
  ]
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing kid_id in request body' },
                    { code: 401, description: 'Invalid or missing JWT token' },
                    { code: 404, description: 'Kid not found' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/parse-recipe"
                  auth="None"
                  description="Extract recipe data from a URL. Tries JSON-LD Recipe schema first, falls back to Open Graph meta tags."
                  requestBody={`{
  "url": "https://example.com/recipes/chicken-soup"
}`}
                  responseBody={`{
  "name": "Chicken Noodle Soup",
  "ingredients": ["2 chicken breasts", "4 cups broth", "2 cups noodles"],
  "instructions": ["Boil chicken in broth...", "Add noodles..."],
  "servings": 4,
  "nutrition": {
    "calories": 320,
    "protein": 28,
    "carbs": 35,
    "fat": 8
  },
  "image_url": "https://example.com/soup.jpg"
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing or invalid URL' },
                    { code: 422, description: 'Could not extract recipe data from URL' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/parse-grocery-image"
                  auth="None"
                  description="Parse a grocery receipt or list image and extract food items. Uses OCR to identify items."
                  requestBody={`{
  "image_url": "https://example.com/receipt.jpg"
}`}
                  responseBody={`{
  "items": [
    { "name": "Whole Milk", "quantity": 1, "category": "dairy" },
    { "name": "Bananas", "quantity": 6, "category": "fruit" }
  ]
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing image_url' },
                    { code: 422, description: 'Could not parse image' },
                  ]}
                />
              </div>
            </section>

            {/* Meal Planning */}
            <section>
              <h3 className="text-xl font-semibold mb-3">Meal Planning</h3>
              <div className="space-y-2">
                <EndpointDetail
                  method="POST"
                  path="/suggest-recipe"
                  auth="JWT"
                  description="Rank recipes by ingredient availability and filter by allergens across specified children. Returns match percentage and lists missing ingredients."
                  requestBody={`{
  "available_foods": ["uuid-food-1", "uuid-food-2"],
  "kid_ids": ["uuid-kid-1"],
  "dietary_restrictions": ["vegetarian"]
}`}
                  responseBody={`{
  "recipes": [
    {
      "id": "...",
      "name": "Veggie Pasta",
      "match_percentage": 85,
      "missing_food_ids": ["uuid-food-3"]
    }
  ]
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing required fields' },
                    { code: 401, description: 'Invalid or missing JWT token' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/ai-meal-plan"
                  auth="JWT"
                  description="Generate a structured weekly meal plan. Uses algorithmic food distribution by default; AI-powered when OPENAI_API_KEY is configured. Respects allergens and preferences per child."
                  requestBody={`{
  "kid_ids": ["uuid-kid-1", "uuid-kid-2"],
  "date_range": {
    "start": "2026-03-01",
    "end": "2026-03-07"
  },
  "dietary_restrictions": ["dairy_free"],
  "preferences": { "variety": "high" }
}`}
                  responseBody={`{
  "meal_plan": [
    {
      "date": "2026-03-01",
      "breakfast": { "food_id": "...", "name": "Oatmeal" },
      "lunch": { "food_id": "...", "name": "Turkey Wrap" },
      "dinner": { "food_id": "...", "name": "Grilled Chicken" },
      "snacks": [{ "food_id": "...", "name": "Apple Slices" }]
    }
  ],
  "nutritional_insights": { "avg_calories": 1800 },
  "prompt_usage": { "tokens": 450, "cost": 0.002 }
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing kid_ids or date_range' },
                    { code: 401, description: 'Invalid or missing JWT token' },
                  ]}
                />
              </div>
            </section>

            {/* Billing & Subscriptions */}
            <section>
              <h3 className="text-xl font-semibold mb-3">Billing &amp; Subscriptions</h3>
              <div className="space-y-2">
                <EndpointDetail
                  method="POST"
                  path="/create-checkout"
                  auth="JWT"
                  description="Create a Stripe checkout session for subscription purchases. Stores a pending subscription record and returns a redirect URL."
                  requestBody={`{
  "price_id": "price_XXXXXXXXXXXXXXXX",
  "user_id": "uuid-of-user"
}`}
                  responseBody={`{
  "checkout_url": "https://checkout.stripe.com/pay/cs_live_..."
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing price_id or user_id' },
                    { code: 401, description: 'Invalid or missing JWT token' },
                    { code: 500, description: 'Stripe API error' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/stripe-webhook"
                  auth="Stripe Signature"
                  description="Process Stripe webhook events. Verifies HMAC-SHA256 signature with 5-minute timestamp tolerance. Handles: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed."
                  requestBody={`// Stripe sends the event payload automatically.
// Headers must include:
//   Stripe-Signature: t=timestamp,v1=signature
{
  "type": "checkout.session.completed",
  "data": {
    "object": { "subscription": "sub_...", "customer": "cus_..." }
  }
}`}
                  responseBody={`{ "received": true }`}
                  errorCodes={[
                    { code: 400, description: 'Invalid signature or missing Stripe-Signature header' },
                    { code: 400, description: 'Timestamp outside 5-minute tolerance' },
                  ]}
                />
              </div>
            </section>

            {/* Content & Marketing */}
            <section>
              <h3 className="text-xl font-semibold mb-3">Content &amp; Marketing</h3>
              <div className="space-y-2">
                <EndpointDetail
                  method="POST"
                  path="/generate-blog-content"
                  auth="None"
                  description="Generate blog content using OpenAI (gpt-4o-mini) when OPENAI_API_KEY is configured, or a structured HTML template fallback."
                  requestBody={`{
  "topic": "5 Tips for Picky Eaters",
  "target_keywords": ["picky eater", "food chaining", "toddler nutrition"],
  "tone": "friendly",
  "word_count": 800
}`}
                  responseBody={`{
  "title": "5 Tips for Picky Eaters: A Parent's Guide",
  "excerpt": "Discover practical strategies to help...",
  "body": "<h2>Introduction</h2><p>...</p>",
  "meta_tags": {
    "description": "Learn 5 proven strategies...",
    "keywords": "picky eater, food chaining, toddler nutrition"
  },
  "generation_cost": 0.003
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing topic field' },
                    { code: 500, description: 'OpenAI API error (falls back to template)' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/generate-social-content"
                  auth="None"
                  description="Generate platform-specific social media posts. Twitter respects 280-char limit. Instagram includes caption and hashtags. Facebook generates longer-form posts."
                  requestBody={`{
  "content_summary": "New blog post about picky eater strategies",
  "target_platforms": ["twitter", "instagram", "facebook"]
}`}
                  responseBody={`{
  "posts": {
    "twitter": {
      "text": "Struggling with a picky eater? Try food chaining! ...",
      "hashtags": ["#PickyEater", "#FoodChaining"]
    },
    "instagram": {
      "caption": "5 game-changing tips for parents of picky eaters...",
      "hashtags": ["#PickyEater", "#ToddlerMeals", "#FoodChaining"]
    },
    "facebook": {
      "text": "Does your little one refuse to try new foods? ..."
    }
  },
  "generation_cost": 0.002
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing content_summary or target_platforms' },
                  ]}
                />
                <EndpointDetail
                  method="POST"
                  path="/update-blog-image"
                  auth="None"
                  description="Fetch an image from a URL and upload it to Supabase Storage (blog-images bucket). Updates the blog_posts record with the new image URL and generates size variants."
                  requestBody={`{
  "blog_post_id": "uuid-of-blog-post",
  "image_url": "https://example.com/photo.jpg"
}`}
                  responseBody={`{
  "original": "https://api.tryeatpal.com/storage/v1/object/public/blog-images/abc123.jpg",
  "variants": {
    "thumbnail": "https://api.tryeatpal.com/storage/v1/.../abc123_thumb.jpg",
    "medium": "https://api.tryeatpal.com/storage/v1/.../abc123_medium.jpg",
    "large": "https://api.tryeatpal.com/storage/v1/.../abc123_large.jpg"
  }
}`}
                  errorCodes={[
                    { code: 400, description: 'Missing blog_post_id or image_url' },
                    { code: 404, description: 'Blog post not found' },
                    { code: 500, description: 'Failed to fetch or upload image' },
                  ]}
                />
              </div>
            </section>

            {/* System */}
            <section>
              <h3 className="text-xl font-semibold mb-3">System</h3>
              <div className="space-y-2">
                <EndpointDetail
                  method="GET"
                  path="/health-check"
                  auth="None"
                  description="Check API and database health. Returns 200 for healthy, 503 for degraded. Includes database latency measurement with 5-second timeout."
                  responseBody={`// 200 OK - Healthy
{
  "status": "healthy",
  "timestamp": "2026-02-25T12:00:00.000Z",
  "version": "1.0.0",
  "database": {
    "connected": true,
    "latency_ms": 42
  }
}

// 503 Service Unavailable - Degraded
{
  "status": "degraded",
  "timestamp": "2026-02-25T12:00:00.000Z",
  "version": "1.0.0",
  "database": {
    "connected": false,
    "error": "Connection timeout"
  }
}`}
                  errorCodes={[{ code: 503, description: 'Database unreachable or query timed out' }]}
                />
              </div>
            </section>
          </div>

          {/* Support */}
          <div className="mt-8 p-6 bg-muted rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Support</h2>
            <p>
              For API support or to report issues, contact us at{' '}
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

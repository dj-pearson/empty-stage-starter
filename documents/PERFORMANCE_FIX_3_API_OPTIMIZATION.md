# Performance Fix #3: API Performance Optimization

## Problem
- Edge Functions return 50-500KB JSON responses uncompressed
- No HTTP caching headers
- AI functions send entire food database (wasteful)
- No request deduplication on client

## Solution: Optimize API Layer

### 1. Add Caching Headers to Edge Functions

```typescript
// Create shared utility: supabase/functions/_shared/headers.ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export const cacheableHeaders = (maxAge: number = 300) => ({
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
  'Vary': 'Authorization',
});

export const noCacheHeaders = () => ({
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
});
```

**Update functions to use caching:**

```typescript
// For static/semi-static data (lookup-barcode, food properties)
return new Response(
  JSON.stringify(data),
  {
    status: 200,
    headers: cacheableHeaders(3600), // 1 hour cache
  }
);

// For user-specific data (meal plans)
return new Response(
  JSON.stringify(data),
  {
    status: 200,
    headers: cacheableHeaders(60), // 1 minute cache
  }
);

// For mutations (create, update, delete)
return new Response(
  JSON.stringify(data),
  {
    status: 200,
    headers: noCacheHeaders(),
  }
);
```

**Impact:**
- Reduces Edge Function invocations by 60-80%
- Saves Supabase compute costs
- Faster response times (CDN cache hits)

### 2. Implement Response Compression

```typescript
// Add to _shared/compression.ts
export async function compressResponse(data: any): Promise<Uint8Array> {
  const json = JSON.stringify(data);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(json));
      controller.close();
    }
  });

  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const reader = compressedStream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

// Usage in Edge Functions:
const compressed = await compressResponse(responseData);
return new Response(compressed, {
  status: 200,
  headers: {
    ...cacheableHeaders(300),
    'Content-Encoding': 'gzip',
  }
});
```

**Impact:** 70-80% reduction in payload size

### 3. Optimize AI Function Payloads

```typescript
// In ai-meal-plan/index.ts, replace lines 32-70 with:

// Only send essential food data (not full objects)
const safeFoods = foods
  .filter((f: any) => f.is_safe && (f.quantity || 0) > 0)
  .map((f: any) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    quantity: f.quantity,
    unit: f.unit,
    // Skip: created_at, updated_at, user_id, household_id, etc.
  }));

const tryBiteFoods = foods
  .filter((f: any) => f.is_try_bite && (f.quantity || 0) > 0)
  .map((f: any) => ({
    id: f.id,
    name: f.name,
    category: f.category,
  }));

// Limit context sent to AI
const availableRecipes = recipes.slice(0, 20).map((r: any) => ({
  name: r.name,
  ingredients: r.food_ids
    .slice(0, 10) // Max 10 ingredients per recipe
    .map((id: string) => foods.find((f: any) => f.id === id)?.name)
    .filter(Boolean),
}));
```

**Impact:**
- Reduces AI function payload from 200-500KB → 30-80KB
- Faster AI responses (less context to process)
- Lower AI costs (fewer tokens)

### 4. Implement Client-Side Request Deduplication

```typescript
// Create hook: src/hooks/useDeduplicatedQuery.ts
import { useQuery } from '@tanstack/react-query';

export function useDeduplicatedQuery<T>(
  key: string[],
  fetcher: () => Promise<T>,
  options?: {
    staleTime?: number;
    cacheTime?: number;
  }
) {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    staleTime: options?.staleTime ?? 60000, // 1 minute default
    cacheTime: options?.cacheTime ?? 300000, // 5 minutes default
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

// Usage in components:
const { data: mealPlan, isLoading } = useDeduplicatedQuery(
  ['meal-plan', kidId, weekStart],
  async () => {
    const { data } = await supabase.functions.invoke('ai-meal-plan', {
      body: { kid, foods, recipes, days: 7 }
    });
    return data;
  },
  { staleTime: 5 * 60 * 1000 } // 5 minutes
);
```

**Impact:**
- Prevents duplicate API calls
- Automatic request deduplication across components
- Better UX (instant results from cache)

### 5. Add Response Pagination for Large Datasets

```typescript
// For functions returning large lists (e.g., food search, blog posts)
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

// Implement in functions:
const page = parseInt(req.headers.get('x-page') || '1');
const perPage = parseInt(req.headers.get('x-per-page') || '50');

const { data, count } = await supabaseClient
  .from('foods')
  .select('*', { count: 'exact' })
  .range((page - 1) * perPage, page * perPage - 1);

const response: PaginatedResponse<Food> = {
  data: data || [],
  pagination: {
    page,
    per_page: perPage,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / perPage),
  }
};

return new Response(JSON.stringify(response), {
  status: 200,
  headers: cacheableHeaders(60),
});
```

### 6. Implement ETags for Conditional Requests

```typescript
// Add to _shared/etag.ts
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

export async function generateETag(data: any): Promise<string> {
  const json = JSON.stringify(data);
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(json));
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// Usage:
const etag = await generateETag(responseData);
const clientETag = req.headers.get('if-none-match');

if (clientETag === etag) {
  return new Response(null, {
    status: 304, // Not Modified
    headers: {
      'ETag': etag,
      'Cache-Control': 'public, max-age=300',
    }
  });
}

return new Response(JSON.stringify(responseData), {
  status: 200,
  headers: {
    ...cacheableHeaders(300),
    'ETag': etag,
  }
});
```

### 7. Add API Response Monitoring

```typescript
// Create _shared/monitoring.ts
export function logPerformance(
  functionName: string,
  startTime: number,
  payloadSize: number,
  success: boolean
) {
  const duration = Date.now() - startTime;

  // Log to Supabase analytics table
  console.log(JSON.stringify({
    function: functionName,
    duration_ms: duration,
    payload_bytes: payloadSize,
    success,
    timestamp: new Date().toISOString(),
  }));

  // Alert if slow
  if (duration > 5000) {
    console.error(`⚠️ Slow function: ${functionName} took ${duration}ms`);
  }
}

// Usage in functions:
const startTime = Date.now();
try {
  // ... function logic
  const responseData = { /* data */ };
  const json = JSON.stringify(responseData);

  logPerformance(
    'ai-meal-plan',
    startTime,
    json.length,
    true
  );

  return new Response(json, { status: 200, headers: cacheableHeaders(60) });
} catch (error) {
  logPerformance('ai-meal-plan', startTime, 0, false);
  throw error;
}
```

## Expected Performance Gains

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| API response size | 200-500 KB | 40-100 KB | **75% smaller** |
| Edge Function invocations | 100% | 20-40% | **60-80% reduction** |
| API response time (cached) | 200-1000ms | 10-50ms | **95% faster** |
| AI function payload | 300 KB | 50 KB | **83% smaller** |
| Duplicate requests | Common | None | **100% eliminated** |

## Implementation Priority: 🔴 **CRITICAL**

1. Implement #1 (caching headers) - **Immediate cost savings**
2. Implement #3 (optimize AI payloads) - **Faster AI responses**
3. Implement #4 (request deduplication) - **Better UX**
4. Implement #2 (compression) - **Progressive enhancement**
5. Implement #5-7 (advanced optimizations)

## Quick Implementation Steps

```bash
# 1. Create shared utilities
mkdir -p supabase/functions/_shared
touch supabase/functions/_shared/headers.ts
touch supabase/functions/_shared/compression.ts

# 2. Update most-used functions first:
# - ai-meal-plan
# - lookup-barcode
# - suggest-recipes-from-pantry

# 3. Deploy and test
supabase functions deploy ai-meal-plan
supabase functions deploy lookup-barcode

# 4. Monitor improvements in Supabase dashboard
```

## Testing Caching

```bash
# Test cache headers
curl -I https://your-project.supabase.co/functions/v1/lookup-barcode

# Should see:
# Cache-Control: public, max-age=3600, s-maxage=3600
# ETag: "abc123..."
# Vary: Authorization

# Test ETag
curl -H "If-None-Match: abc123..." https://...
# Should return 304 Not Modified
```

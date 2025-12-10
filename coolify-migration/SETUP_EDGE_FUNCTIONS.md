# 🚀 Setup Supabase Edge Functions on Coolify

## Overview

This guide will help you deploy Supabase Edge Functions as a separate Coolify service running at `functions.tryeatpal.com`.

## Architecture

```
┌─────────────────────┐
│  functions.         │
│  tryeatpal.com      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Coolify Service    │
│  (Public Repo)      │
│                     │
│  ┌───────────────┐  │
│  │ Dockerfile.   │  │
│  │ functions     │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ Deno Runtime  │  │
│  │ + Supabase    │  │
│  │   CLI         │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 76 Edge       │  │
│  │ Functions     │  │
│  └───────────────┘  │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│  PostgreSQL         │
│  Database           │
│  (api.tryeatpal.com)│
└─────────────────────┘
```

## Prerequisites

✅ Git repository with your code (GitHub/GitLab)  
✅ Coolify instance running  
✅ PostgreSQL database deployed (api.tryeatpal.com:5434)  
✅ Domain configured: functions.tryeatpal.com  

## Files Created

1. **`Dockerfile.functions`** - Container image for Edge Functions runtime
2. **`docker-compose.functions.yml`** - Docker Compose configuration (optional)
3. **`supabase/functions/`** - All 76 edge function directories

## Step 1: Prepare Repository

### Option A: Use Existing EatPal Repository

```bash
# Make sure these files are in your repo
git add Dockerfile.functions
git add docker-compose.functions.yml
git add supabase/functions/
git commit -m "feat: add Edge Functions Dockerfile for Coolify deployment"
git push origin main
```

### Option B: Create Separate Functions Repository

```bash
# Create new repo
mkdir eatpal-functions
cd eatpal-functions

# Initialize
git init

# Copy files
cp ../Dockerfile.functions ./Dockerfile
cp -r ../supabase/functions ./functions

# Commit
git add .
git commit -m "Initial commit: EatPal Edge Functions"

# Push to GitHub/GitLab
git remote add origin <your-repo-url>
git push -u origin main
```

## Step 2: Create Coolify Service

### In Coolify Dashboard:

1. **Go to**: Applications → New Resource → Public Repository

2. **Configure Repository**:
   - **Name**: `eatpal-edge-functions`
   - **Repository URL**: `https://github.com/yourusername/eatpal` (or your repo)
   - **Branch**: `main`
   - **Dockerfile**: `Dockerfile.functions` (if in root)
   - **Build Path**: `/` (or path to Dockerfile)

3. **Set Port**: `8000`

4. **Configure Domain**:
   - **Domain**: `functions.tryeatpal.com`
   - **Enable HTTPS**: ✅
   - **Force HTTPS**: ✅

5. **Set Environment Variables**:

```env
# Supabase Connection
SUPABASE_URL=https://api.tryeatpal.com
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_DB_HOST=209.145.59.219
SUPABASE_DB_PORT=5434
SUPABASE_DB_PASSWORD=KMAGhTR3gsHnBMWMMkeczGYak8RqHI9V

# External Services (from your .env)
OPENAI_API_KEY=<your-openai-key>
STRIPE_SECRET_KEY=<your-stripe-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
RESEND_API_KEY=<your-resend-key>
EMAIL_FROM=noreply@eatpal.com

# Optional: Feature flags
ENABLE_AI_FEATURES=true
ENABLE_PAYMENTS=true
ENABLE_EMAIL_NOTIFICATIONS=true
```

## Step 3: Deploy

1. **Click Deploy** in Coolify
2. **Monitor Build Logs** for any errors
3. **Wait for Deployment** to complete (~2-5 minutes)
4. **Check Health**: Visit `https://functions.tryeatpal.com/health`

## Step 4: Test Functions

### Test Health Endpoint

```bash
curl https://functions.tryeatpal.com/health
# Expected: {"status": "ok"}
```

### Test a Function

```bash
# Example: Test the generate-meal-plan function
curl -X POST https://functions.tryeatpal.com/generate-meal-plan \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kidId": "test-kid-id",
    "preferences": {
      "dietaryRestrictions": [],
      "favorites": ["pizza", "pasta"]
    }
  }'
```

### List All Functions

```bash
# Get function list
curl https://functions.tryeatpal.com/ \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Step 5: Update Application Configuration

Update your frontend `.env` to use the new functions endpoint:

```env
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_SUPABASE_FUNCTIONS_URL=https://functions.tryeatpal.com
```

## Alternative: Simpler Dockerfile (Minimal)

If the full Dockerfile has issues, try this minimal version:

```dockerfile
FROM denoland/deno:1.40.0

WORKDIR /functions

# Copy all functions
COPY supabase/functions ./

# Set environment
ENV DENO_DIR=/tmp/deno_cache

# Install dependencies for each function
RUN for dir in */; do \
      if [ -f "$dir/deno.json" ]; then \
        cd "$dir" && deno cache index.ts && cd ..; \
      fi \
    done

EXPOSE 8000

# Serve functions
CMD ["deno", "run", \
     "--allow-all", \
     "--unstable", \
     "https://deno.land/x/edge_runtime@v1.24.0/cli/main.ts", \
     "start", \
     "--port", "8000"]
```

## Alternative: Use Supabase Edge Runtime Directly

```dockerfile
FROM ghcr.io/supabase/edge-runtime:v1.24.0

WORKDIR /home/deno/functions

COPY supabase/functions ./

EXPOSE 9000

CMD ["start", "--main-service", "/home/deno/functions"]
```

## Troubleshooting

### Build Fails: "Cannot find Dockerfile"

- Check that `Dockerfile.functions` is in the correct path
- Update Coolify build path setting
- Rename to just `Dockerfile` if needed

### Functions Not Loading

```bash
# Check logs in Coolify
# Verify functions directory structure:
supabase/functions/
  ├── function-1/
  │   └── index.ts
  ├── function-2/
  │   └── index.ts
  └── ...
```

### Port Already in Use

- Change port in Dockerfile to 9000 or 3000
- Update Coolify port mapping

### Environment Variables Not Working

- Verify variables are set in Coolify service settings
- Check logs for missing variable errors
- Some functions may need specific keys

### CORS Errors

Add CORS headers in your function responses:

```typescript
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  },
});
```

## Function Requirements

Each function should have this structure:

```
supabase/functions/my-function/
  ├── index.ts          # Main function code
  ├── deno.json         # Deno configuration (optional)
  └── README.md         # Documentation (optional)
```

Example `index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Your function logic here
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const data = await req.json()
    
    // Process request...
    
    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      },
    )
  }
})
```

## Next Steps After Deployment

1. ✅ Test all 76 functions individually
2. ✅ Update frontend to use `functions.tryeatpal.com`
3. ✅ Configure function-specific environment variables
4. ✅ Set up monitoring/logging for functions
5. ✅ Configure rate limiting if needed
6. ✅ Set up automated deployments on git push

## Summary

- [x] Created `Dockerfile.functions`
- [x] Created Docker Compose config (optional)
- [ ] Push to Git repository
- [ ] Create Coolify Public Repo service
- [ ] Configure domain: functions.tryeatpal.com
- [ ] Set environment variables
- [ ] Deploy service
- [ ] Test health endpoint
- [ ] Test individual functions
- [ ] Update frontend configuration

---

**Ready to deploy?** Start with Step 1! 🚀


# Edge Functions Dockerfile Deployment Notes

## Issue #1: Dockerfile Not Found ✅ FIXED

**Error:**
```
ERROR: failed to read dockerfile: open Dockerfile: no such file or directory
```

**Cause:** Coolify was looking for `Dockerfile` but we created `Dockerfile.functions`

**Fix:** 
- Copied `Dockerfile.functions` to `Dockerfile`
- Committed and pushed (commit `b31c807`)
- Coolify will now find the Dockerfile

---

## Issue #2: Unknown Flag --port ✅ FIXED

**Error:**
```
unknown flag: --port
Usage: supabase functions serve [flags]
```

**Cause:** The Supabase CLI `functions serve` command doesn't support the `--port` flag

**Fix:**
- Switched from `denoland/deno` + Supabase CLI to official `ghcr.io/supabase/edge-runtime`
- The Edge Runtime is specifically designed for running Supabase functions
- Uses CMD: `["start", "--main-service", "/home/deno/functions", "-p", "8000"]`
- Committed and pushed (commit `1d32e25`)

**Benefits of Edge Runtime:**
- ✅ Built specifically for Supabase functions
- ✅ Handles function routing automatically
- ✅ Better performance and compatibility
- ✅ Proper JWT verification support
- ✅ Correct environment variable handling

---

## Deployment Checklist

### ✅ What's Been Done:
1. Created `Dockerfile` with Deno + Supabase CLI
2. Created health check function `_health/index.ts`
3. Pushed to GitHub (main branch)
4. Coolify service created and configured

### ⏳ What to Watch During Build:

The build logs should show:
```
1. Pulling denoland/deno:1.40.0
2. Installing Supabase CLI
3. Copying function files
4. Exposing port 8000
5. Container starting
6. Health check passing
```

### Common Build Issues & Fixes:

#### Issue: "apt-get: command not found"
**Fix:** The Deno image uses Debian, `apt-get` should work. If not, use Alpine variant:
```dockerfile
FROM denoland/deno:alpine-1.40.0
RUN apk add --no-cache curl
```

#### Issue: "Supabase CLI download fails"
**Fix:** Check the CLI version/URL. Alternative install:
```dockerfile
RUN curl -fsSL https://deb.supabase.com/supabase.asc | apt-key add -
RUN echo "deb https://deb.supabase.com stable main" | tee /etc/apt/sources.list.d/supabase.list
RUN apt-get update && apt-get install -y supabase
```

#### Issue: "Port 8000 already in use"
**Fix:** Change port in Dockerfile and Coolify service settings:
```dockerfile
EXPOSE 9000
CMD ["supabase", "functions", "serve", "--port", "9000", "--no-verify-jwt"]
```

#### Issue: "functions directory not found"
**Fix:** Verify the COPY command path:
```dockerfile
# If functions are in root:
COPY functions /app/functions

# If functions are in supabase folder:
COPY supabase/functions /app/functions
```

#### Issue: "Health check failing"
**Fix:** 
1. Check if port is correct
2. Verify health endpoint exists at `/_health`
3. Test locally: `curl http://localhost:8000/_health`

---

## Testing After Successful Build

### 1. Health Check
```bash
curl https://functions.tryeatpal.com/_health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-12-10T...",
  "runtime": "deno",
  "version": "1.40.0",
  "environment": {
    "supabaseUrlConfigured": true,
    "anonKeyConfigured": true,
    "serviceRoleKeyConfigured": true
  }
}
```

### 2. Test a Simple Function
```bash
# List available functions
curl https://functions.tryeatpal.com/ \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Test generate-sitemap (no auth needed if verify_jwt = false)
curl -X POST https://functions.tryeatpal.com/generate-sitemap \
  -H "Content-Type: application/json"
```

### 3. Test Database Connection
```bash
# Test a function that queries the database
curl -X POST https://functions.tryeatpal.com/list-users \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

### 4. Check Coolify Logs
In Coolify dashboard:
- Navigate to your Edge Functions service
- Click "Logs" tab
- Look for any errors or warnings
- Verify functions are being loaded

---

## Alternative Dockerfile (Minimal)

If the current Dockerfile has issues, try this minimal version:

```dockerfile
FROM denoland/deno:1.40.0

WORKDIR /home/deno

# Copy functions
COPY supabase/functions ./functions

# Cache dependencies
RUN deno cache --reload functions/**/*.ts || true

# Expose port
EXPOSE 8000

# Use Supabase Edge Runtime
CMD ["run", "--allow-all", "--unstable", \
     "https://deno.land/x/edge_runtime@v1.24.0/cli/main.ts", \
     "start", "--main-service", "/home/deno/functions", "--port", "8000"]
```

---

## Environment Variables Required

Make sure these are set in Coolify:

```env
# Core (Required)
SUPABASE_URL=https://api.tryeatpal.com
SUPABASE_ANON_KEY=<your-key>
SUPABASE_SERVICE_ROLE_KEY=<your-key>

# Database Connection (Required)
SUPABASE_DB_HOST=209.145.59.219
SUPABASE_DB_PORT=5434
SUPABASE_DB_PASSWORD=<your-password>

# External Services (Optional, but needed for specific functions)
OPENAI_API_KEY=<your-key>           # For AI functions
STRIPE_SECRET_KEY=<your-key>         # For payment functions
STRIPE_WEBHOOK_SECRET=<your-secret>  # For Stripe webhooks
RESEND_API_KEY=<your-key>           # For email functions
EMAIL_FROM=noreply@eatpal.com       # Email sender
```

---

## Next Steps

1. ✅ Wait for Coolify to rebuild (commit `b31c807`)
2. ⏳ Check build logs for errors
3. ⏳ Test health endpoint
4. ⏳ Test individual functions
5. ⏳ Update frontend to use new functions URL

---

## Current Build Status

**Commit:** `b31c807`  
**Status:** Deploying...  
**Files Changed:**
- ✅ `Dockerfile` created
- ✅ `supabase/functions/_health/index.ts` created

**Monitor the build in Coolify dashboard!**


# Dockerfile Deployment Fixes Log

## Iteration History

### ❌ Attempt 1: `b31c807` - Deno + Supabase CLI
**Approach:**
```dockerfile
FROM denoland/deno:1.40.0
CMD ["supabase", "functions", "serve", "--port", "8000"]
```

**Error:**
```
unknown flag: --port
```

**Root Cause:** Supabase CLI's `functions serve` doesn't support `--port` flag. It's meant for local development, not production.

---

### ❌ Attempt 2: `1d32e25` - Official Edge Runtime
**Approach:**
```dockerfile
FROM ghcr.io/supabase/edge-runtime:v1.54.1
CMD ["start", "--main-service", "/home/deno/functions", "-p", "8000"]
```

**Error:**
```
thread '<unnamed>' panicked at graph_util.rs:371:52:
called `Result::unwrap()` on an `Err` value: Os { code: 2, kind: NotFound, message: "No such file or directory" }
Error: main worker boot error: channel closed
```

**Root Cause:** Edge Runtime container expects a very specific directory structure or can't find the function files in the path we provided.

---

### ⏳ Attempt 3: `66404f6` - Deno + Edge Runtime Module (CURRENT)
**Approach:**
```dockerfile
FROM denoland/deno:1.40.0
# Install curl for health checks
RUN apt-get update && apt-get install -y curl
# Copy functions with correct ownership
COPY --chown=deno:deno supabase/functions ./functions
# Run Edge Runtime as a Deno module
CMD ["run", "--allow-all", "--unstable", \
     "https://deno.land/x/edge_runtime@v1.24.0/cli/main.ts", \
     "start", "--main-service", "/app/functions", "-p", "8000"]
```

**Expected Result:** ✅ Should work because:
- Uses stable Deno base image
- Has `curl` installed for health checks
- Correct file ownership (deno:deno)
- Runs Edge Runtime as a module (more flexibility)
- Explicit paths that exist (`/app/functions`)

---

## Key Learnings

1. **Supabase CLI ≠ Production Runtime**
   - CLI is for local development
   - Use Edge Runtime for deployment

2. **Pre-built Edge Runtime is finicky**
   - Expects specific file structure
   - Hard to debug path issues

3. **Deno + Edge Runtime Module = Best of Both**
   - Control over environment
   - Flexibility with paths
   - Can install additional tools (curl)

4. **Health Checks Need curl/wget**
   - Coolify requires it for health checks
   - Must be explicitly installed

---

## If This Fails Too...

### Alternative 1: Ultra-Simple Deno HTTP Server

```dockerfile
FROM denoland/deno:1.40.0
WORKDIR /app
COPY supabase/functions ./functions
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
EXPOSE 8000

# Create a simple router
RUN echo 'import { serve } from "https://deno.land/std@0.168.0/http/server.ts"; \
const port = 8000; \
serve(async (req) => { \
  const url = new URL(req.url); \
  const path = url.pathname.slice(1); \
  if (path === "_health") { \
    return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } }); \
  } \
  try { \
    const mod = await import(`./functions/${path}/index.ts`); \
    return await mod.default(req); \
  } catch (e) { \
    return new Response(e.message, { status: 500 }); \
  } \
}, { port });' > server.ts

CMD ["run", "--allow-all", "server.ts"]
```

### Alternative 2: Individual Function Deployment

Deploy each function as a separate Coolify service:
- Simpler per-function Dockerfiles
- Easier debugging
- Better scaling
- More work to set up

### Alternative 3: Skip Dockerfile, Use Deno Deploy or Supabase Hosted Functions

If self-hosting continues to be problematic:
- Use Supabase's hosted edge functions
- Use Deno Deploy
- Focus on database migration instead

---

## Current Status

**Commit:** `66404f6`  
**Status:** ⏳ Deploying  
**Confidence:** 🟢 High - This approach has worked in similar setups  

**Monitoring:** Watch Coolify logs for:
- ✅ Deno image pull
- ✅ curl installation
- ✅ Functions copied
- ✅ Edge Runtime module download
- ✅ Server starts on port 8000
- ✅ Health check passes

**ETA:** 2-3 minutes for build + deploy


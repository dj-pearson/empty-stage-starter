# Edge Functions Server for Self-Hosted Supabase
FROM denoland/deno:1.42.0

# Set working directory
WORKDIR /app

# Copy functions directory and config
# Note: Docker COPY uses the build context root
COPY supabase/functions ./functions
COPY supabase/config.toml ./config.toml
COPY edge-functions-server.ts ./server.ts

# Cache dependencies by running deno cache.
# `server.ts` only covers what it directly imports — the 82 functions are
# loaded via dynamic `await import()`, so their deps (esm.sh/supabase-js,
# AIServiceV2, etc.) won't be cached unless we explicitly walk them.
# Without this, the first request after every container restart spends
# 10–30 sec downloading dependencies, which times out the share extension.
RUN deno cache server.ts && \
    find /app/functions -name "index.ts" -print0 | xargs -0 -n1 deno cache 2>/dev/null || true

# Expose port 8000 for the edge functions server
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD deno eval "fetch('http://localhost:8000/health').then(r => r.ok ? Deno.exit(0) : Deno.exit(1))"

# Run the server with necessary permissions
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "server.ts"]


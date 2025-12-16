# Edge Functions Server for Self-Hosted Supabase
FROM denoland/deno:1.42.0

# Set working directory
WORKDIR /app

# Copy functions directory and config
# Note: Docker COPY uses the build context root
COPY supabase/functions ./functions
COPY supabase/config.toml ./config.toml
COPY edge-functions-server.ts ./server.ts

# Cache dependencies by running deno cache
RUN deno cache server.ts

# Expose port 8000 for the edge functions server
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD deno eval "fetch('http://localhost:8000/health').then(r => r.ok ? Deno.exit(0) : Deno.exit(1))"

# Run the server with necessary permissions
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "server.ts"]


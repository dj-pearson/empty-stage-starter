# Supabase Edge Functions Runtime for Coolify
# Simple Deno HTTP server

FROM denoland/deno:1.40.0

# Set working directory
WORKDIR /app

# Install curl for health checks
USER root
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
USER deno

# Copy server and function files
COPY --chown=deno:deno server.ts ./
COPY --chown=deno:deno supabase/functions ./functions

# Set environment variables
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV DENO_DIR=/app/.deno_cache

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/_health || exit 1

# Run our simple server
CMD ["run", "--allow-all", "server.ts"]


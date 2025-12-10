# Supabase Edge Functions Runtime for Coolify
# Uses Supabase Edge Runtime directly

FROM ghcr.io/supabase/edge-runtime:v1.54.1

# Set working directory
WORKDIR /home/deno/functions

# Copy function files
COPY supabase/functions ./

# Set environment variables
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
ENV PORT=8000

# Expose port for functions
EXPOSE 8000

# Health check - Edge Runtime serves on /
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/_health || exit 1

# Start the edge runtime
CMD ["start", "--main-service", "/home/deno/functions", "-p", "8000"]


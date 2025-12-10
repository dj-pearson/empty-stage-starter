# Supabase Edge Functions Runtime for Coolify
# Based on Deno runtime for Supabase Functions

FROM denoland/deno:1.40.0

# Set working directory
WORKDIR /app

# Install Supabase CLI
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://github.com/supabase/cli/releases/download/v1.142.2/supabase_linux_amd64.tar.gz | tar -xz && \
    mv supabase /usr/local/bin/supabase && \
    chmod +x /usr/local/bin/supabase

# Copy function files
COPY supabase/functions /app/functions

# Set environment variables
ENV DENO_DIR=/app/.deno_cache
ENV SUPABASE_URL=${SUPABASE_URL}
ENV SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
ENV SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}

# Expose port for functions
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start the functions server
CMD ["supabase", "functions", "serve", "--port", "8000", "--no-verify-jwt"]


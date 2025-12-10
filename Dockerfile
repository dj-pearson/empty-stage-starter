# Use official Supabase Edge Runtime
FROM supabase/edge-runtime:v1.67.4

# Copy functions
COPY supabase/functions /home/deno/functions

# Use default Supabase edge-runtime entrypoint (no custom server needed)


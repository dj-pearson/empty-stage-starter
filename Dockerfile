# Use official Supabase Edge Runtime
FROM supabase/edge-runtime:v1.67.4

# Copy functions to the expected location
COPY supabase/functions /home/deno/functions

# Start edge-runtime pointing to functions directory
CMD ["start", "--main-service", "/home/deno/functions", "--port", "9000", "--verbose"]


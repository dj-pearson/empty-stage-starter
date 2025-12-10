# Use official Supabase Edge Runtime
FROM supabase/edge-runtime:v1.67.4

# Copy functions
COPY supabase/functions /home/deno/functions

# Start edge-runtime
CMD ["edge-runtime", "start", "--main-service", "/home/deno/functions", "-p", "9000"]


# Self-Hosted Supabase Edge Functions

A complete, production-ready setup for running Supabase Edge Functions in a self-hosted environment using Docker.

## 📋 Features

- ✅ **Deno-based runtime** (v1.40.0)
- ✅ **Dynamic function loading** (auto-discovers functions in `/functions` directory)
- ✅ **Health check endpoint** (`/_health`)
- ✅ **CORS support** (configurable)
- ✅ **Environment variable management**
- ✅ **Hot reload support** (in development)
- ✅ **Docker Compose for local testing**
- ✅ **Production-ready Dockerfile**
- ✅ **Proper permissions & security**

## 📁 Directory Structure

```
edge-functions-template/
├── Dockerfile                 # Production Docker image
├── docker-compose.yml         # Local development setup
├── server.ts                  # Custom Deno HTTP server
├── .env.example              # Environment variables template
├── .dockerignore             # Docker build exclusions
├── README.md                 # This file
├── DEPLOYMENT.md             # Deployment guide
└── functions/                # Edge functions directory
    ├── _health/              # Health check function
    │   └── index.ts
    └── example/              # Example function
        └── index.ts
```

## 🚀 Quick Start

### 1. Copy Template to Your Project

```bash
# Copy the entire template
cp -r edge-functions-template/ your-project/

# Or clone just the edge functions setup
cd your-project/
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

Required variables:
```env
SUPABASE_URL=https://your-instance.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Add Your Functions

Create a new function:

```bash
mkdir -p functions/my-function
```

Create `functions/my-function/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  try {
    const { name } = await req.json();

    return new Response(
      JSON.stringify({ message: `Hello, ${name}!` }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
```

### 4. Test Locally

```bash
# Start with Docker Compose
docker-compose up

# Test health endpoint
curl http://localhost:8000/_health

# Test your function
curl -X POST http://localhost:8000/my-function \
  -H "Content-Type: application/json" \
  -d '{"name":"World"}'
```

### 5. Deploy to Production

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions for:
- Coolify
- Railway
- Fly.io
- Generic Docker hosting

## 🏗️ How It Works

### Architecture

```
Client Request
    ↓
Reverse Proxy (Traefik/Nginx)
    ↓
Docker Container (Port 8000)
    ↓
server.ts (Deno HTTP Server)
    ↓
Dynamic Function Import
    ↓
/functions/{function-name}/index.ts
    ↓
Response
```

### Request Flow

1. **Server Start**: `server.ts` starts HTTP server on port 8000
2. **Request Received**: Client calls `https://your-domain.com/function-name`
3. **Path Parsing**: Extract function name from URL path
4. **Function Discovery**: Check if `/functions/{function-name}/index.ts` exists
5. **Dynamic Import**: Load and execute the function module
6. **Response**: Return function result to client

### Special Endpoints

- **`/_health`**: Health check endpoint (returns status and function list)
- **`/`**: Returns welcome message and available functions

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Your Supabase instance URL |
| `SUPABASE_ANON_KEY` | Yes | Anonymous (public) API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role (admin) API key |
| `PORT` | No | Server port (default: 8000) |
| `DENO_DIR` | No | Deno cache directory (default: /app/.deno_cache) |

### Dockerfile Customization

**Change Deno Version**:
```dockerfile
FROM denoland/deno:1.40.0  # Update version here
```

**Add Additional Packages**:
```dockerfile
RUN apt-get update && apt-get install -y \
  curl \
  your-package
```

**Change Port**:
```dockerfile
EXPOSE 9000  # Change port

# Also update server.ts:
const PORT = 9000;
```

### CORS Configuration

Edit `server.ts` to customize CORS headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',  // Change to specific domain
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};
```

## 📝 Writing Functions

### Basic Function Template

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  // Parse request
  const { data } = await req.json();

  // Your logic here
  const result = processData(data);

  // Return response
  return new Response(
    JSON.stringify({ result }),
    { 
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }
  );
});
```

### Using Supabase Client

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  );

  const { data, error } = await supabaseClient
    .from('table')
    .select('*');

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ data }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

### Error Handling

```typescript
serve(async (req) => {
  try {
    // Your function logic
    
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );
  } catch (error) {
    console.error('Function error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { status: 500 }
    );
  }
});
```

## 🧪 Testing

### Unit Testing

Create `functions/my-function/index.test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

Deno.test('my function returns correct result', async () => {
  const result = await myFunction({ input: 'test' });
  assertEquals(result.output, 'expected');
});
```

Run tests:
```bash
deno test functions/my-function/index.test.ts
```

### Integration Testing

```bash
# Start server
docker-compose up -d

# Run tests
curl -X POST http://localhost:8000/my-function \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}' \
  | jq .

# Stop server
docker-compose down
```

## 🐛 Troubleshooting

### Container Won't Start

**Check logs**:
```bash
docker logs <container-name>
```

**Common issues**:
- Missing environment variables → Check `.env` file
- Port already in use → Change port in `docker-compose.yml`
- Permission errors → Check Dockerfile permissions

### Function Not Found

**Symptoms**: 404 error when calling function

**Solutions**:
1. Verify function directory exists: `functions/your-function/`
2. Verify `index.ts` exists in function directory
3. Check function name in URL matches directory name
4. Restart container to reload functions

### CORS Errors

**Symptoms**: Browser blocks request with CORS error

**Solutions**:
1. Update `corsHeaders` in `server.ts`
2. Add your domain to `Access-Control-Allow-Origin`
3. Rebuild and restart container

### Permission Denied Errors

**Symptoms**: Container logs show "Permission denied" for Deno cache

**Solution**: Already handled in Dockerfile, but if you see this:
```dockerfile
RUN mkdir -p /app/.deno_cache && chown deno:deno /app/.deno_cache
```

### Function Crashes

**Check function logs**:
```bash
docker exec -it <container-name> deno run \
  --allow-all \
  /app/functions/your-function/index.ts
```

## 📊 Monitoring

### Health Checks

Built-in health endpoint returns:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-16T...",
  "runtime": "deno",
  "version": "1.40.0",
  "environment": {
    "supabaseUrlConfigured": true,
    "anonKeyConfigured": true,
    "serviceRoleKeyConfigured": true
  },
  "functions": ["_health", "example", "your-function"]
}
```

### Logging

Functions log to stdout, accessible via:
```bash
docker logs <container-name> -f
```

Add structured logging:
```typescript
console.log(JSON.stringify({
  level: 'info',
  function: 'my-function',
  message: 'Processing request',
  data: { userId: 123 }
}));
```

## 🔒 Security Best Practices

1. **Never commit `.env` files** (use `.env.example` template)
2. **Use service role key only for admin operations**
3. **Validate all inputs** in functions
4. **Implement rate limiting** at proxy level
5. **Use HTTPS** in production (handled by reverse proxy)
6. **Keep Deno updated** (update Dockerfile version)
7. **Review function permissions** (use `--allow-net`, `--allow-env` only)

## 🚀 Performance Tips

1. **Minimize dependencies**: Import only what you need
2. **Use Deno cache**: Dependencies are cached in `/app/.deno_cache`
3. **Implement function timeouts**: Prevent hanging requests
4. **Use connection pooling**: For database connections
5. **Enable compression**: At reverse proxy level

## 📦 Migration from Hosted Supabase

If migrating from hosted Supabase Edge Functions:

1. **Copy functions**: Copy all functions from your Supabase project
2. **Update imports**: Ensure all imports use URLs (not npm packages)
3. **Update environment**: Change `SUPABASE_URL` to self-hosted instance
4. **Test locally**: Run with `docker-compose up`
5. **Deploy**: Follow deployment guide

## 🆘 Support

- **Issues**: Check logs, verify environment variables, test locally
- **Documentation**: See [Deno Manual](https://deno.land/manual)
- **Community**: [Supabase Discord](https://discord.supabase.com)

## 📄 License

This template is provided as-is for use with self-hosted Supabase instances.

---

**Ready to deploy?** → See [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific guides!


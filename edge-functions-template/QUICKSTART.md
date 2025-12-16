# Quick Start - 5 Minutes to Running Edge Functions

Get your self-hosted Edge Functions running in 5 minutes or less!

## Step 1: Copy Template (30 seconds)

```bash
# Copy the template to your project
cp -r edge-functions-template/ my-project/
cd my-project/
```

## Step 2: Configure Environment (1 minute)

```bash
# Run setup script
# Linux/Mac:
bash setup.sh

# Windows:
.\setup.ps1
```

Edit `.env` with your Supabase credentials:
```env
SUPABASE_URL=https://api.tryeatpal.com
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

## Step 3: Test Locally (2 minutes)

```bash
# Start with Docker Compose
docker-compose up

# In another terminal, test:
curl http://localhost:8000/_health
curl -X POST http://localhost:8000/example \
  -H "Content-Type: application/json" \
  -d '{"name":"World"}'
```

Expected output:
```json
{
  "status": "healthy",
  "functions": ["_health", "example"]
}
```

## Step 4: Add Your Functions (1 minute)

```bash
# Create a new function
mkdir -p functions/my-function
```

Create `functions/my-function/index.ts`:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { name } = await req.json();
  
  return new Response(
    JSON.stringify({ message: `Hello, ${name}!` }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

Test it:
```bash
curl -X POST http://localhost:8000/my-function \
  -H "Content-Type: application/json" \
  -d '{"name":"Claude"}'
```

## Step 5: Deploy (1 minute)

### Option A: Coolify

1. Push to Git
2. Create Public Repo service in Coolify
3. Set environment variables
4. Set **Ports Exposes**: `8000`
5. Deploy!

### Option B: Railway

```bash
railway init
railway variables set SUPABASE_URL="..."
railway variables set SUPABASE_ANON_KEY="..."
railway variables set SUPABASE_SERVICE_ROLE_KEY="..."
railway up
```

### Option C: Fly.io

```bash
fly launch
fly secrets set SUPABASE_URL="..." SUPABASE_ANON_KEY="..." SUPABASE_SERVICE_ROLE_KEY="..."
fly deploy
```

## ✅ Done!

Your Edge Functions are now running at:
- **Local**: http://localhost:8000
- **Production**: https://your-domain.com

Test production:
```bash
curl https://your-domain.com/_health
```

## Next Steps

- 📖 Read [README.md](./README.md) for full documentation
- 🚀 See [DEPLOYMENT.md](./DEPLOYMENT.md) for advanced deployment options
- 🔧 Customize `server.ts` for special needs
- 📝 Write tests for your functions
- 🔒 Set up monitoring and logging

## Troubleshooting

**Container won't start?**
- Check `.env` has correct values
- Run `docker-compose logs` to see errors

**Function not found?**
- Verify directory structure: `functions/your-function/index.ts`
- Check function exports a handler (uses `serve()`)

**CORS errors?**
- Update `corsHeaders` in `server.ts`
- Restart container after changes

---

**Need help?** Check the full [README.md](./README.md) or [DEPLOYMENT.md](./DEPLOYMENT.md)!


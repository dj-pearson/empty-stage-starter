# 🚀 Complete EatPal Coolify Deployment Plan

## Overview

This guide covers the complete migration of EatPal to your Coolify instance, including:
1. **Database Migrations** (88 migrations)
2. **Edge Functions Service** (78 functions)
3. **Domain Configuration**
4. **Testing & Verification**

---

## Current Status

### ✅ What's Ready

- **Database Service**: Running on Coolify at `api.tryeatpal.com:5434`
- **Migration Files**: 88 migrations combined into `combined_eatpal_migrations_clean.sql` (776 KB)
- **Edge Functions**: 78 functions ready in `supabase/functions/` directory
- **Dockerfile**: Created for Edge Functions deployment
- **MCP Server**: Connected and working for monitoring

### ⚠️ What Needs Setup

- **Database Schema**: Needs migrations applied (has 66 old migrations from August)
- **Edge Functions Service**: Not deployed yet (needs Coolify Public Repo service)
- **Domain Routing**: `functions.tryeatpal.com` not configured yet

---

## Deployment Order

### Phase 1: Database Migrations ✅
### Phase 2: Edge Functions Service ⏳ (You are here)
### Phase 3: Testing & Verification 📋

---

## Phase 1: Deploy Database Migrations

### Option A: Start Fresh (Recommended)

Since you're migrating to a new Coolify instance, starting fresh is cleanest:

```bash
# 1. Upload migration file
scp coolify-migration/combined_eatpal_migrations_clean.sql root@209.145.59.219:/tmp/

# 2. SSH into server
ssh root@209.145.59.219

# 3. Find PostgreSQL container
docker ps | grep postgres
# Example output: 6ifjdjxwwwkskk-db-1

# 4. Set container name
CONTAINER_NAME="your-postgres-container-name"

# 5. Reset database (drop all tables)
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres <<'EOF'
DO $$ 
DECLARE r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;
EOF

# 6. Copy and apply migrations
docker cp /tmp/combined_eatpal_migrations_clean.sql $CONTAINER_NAME:/tmp/
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql

# 7. Verify
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "SELECT COUNT(*) FROM _migrations;"
# Should show: 88
```

### Option B: Use MCP Server (Advanced)

The MCP server can monitor but direct deployment via SSH is more reliable for bulk migrations.

---

## Phase 2: Deploy Edge Functions Service

### Step 1: Prepare Git Repository

```bash
# Add new files to git
git add Dockerfile.functions
git add docker-compose.functions.yml
git add supabase/functions/
git commit -m "feat: add Edge Functions Dockerfile and health check"
git push origin main
```

### Step 2: Create Coolify Service

1. **Open Coolify Dashboard**
2. **Navigate to**: Applications → New Resource → Public Repository
3. **Configure**:
   - **Name**: `eatpal-edge-functions`
   - **Repository**: `https://github.com/yourusername/empty-stage-starter`
   - **Branch**: `main`
   - **Dockerfile**: `Dockerfile.functions`
   - **Port**: `8000`

4. **Set Domain**:
   - **Domain**: `functions.tryeatpal.com`
   - **HTTPS**: ✅ Enabled
   - **Force HTTPS**: ✅ Enabled

5. **Environment Variables**:

```env
# Supabase Connection
SUPABASE_URL=https://api.tryeatpal.com
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_DB_HOST=<your-server-ip>
SUPABASE_DB_PORT=5434
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=<your-db-password>

# External Service Keys
OPENAI_API_KEY=<your-openai-key>
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
RESEND_API_KEY=<your-resend-api-key>
EMAIL_FROM=noreply@eatpal.com

# Optional
INSTACART_API_KEY=<if-you-have-one>
```

6. **Click Deploy**

### Step 3: Monitor Deployment

Watch the build logs in Coolify for:
- ✅ Dockerfile build success
- ✅ Deno installation
- ✅ Supabase CLI installation
- ✅ Container start
- ✅ Health check passing

### Step 4: Verify Deployment

```bash
# Test health endpoint
curl https://functions.tryeatpal.com/_health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2025-12-10T...",
  "runtime": "deno",
  "version": "1.40.0",
  "environment": {
    "supabaseUrlConfigured": true,
    "anonKeyConfigured": true,
    "serviceRoleKeyConfigured": true
  }
}
```

### Step 5: Test Individual Functions

```bash
# Test a simple function
curl -X POST https://functions.tryeatpal.com/generate-sitemap \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json"

# Test AI function
curl -X POST https://functions.tryeatpal.com/ai-meal-plan \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "kidId": "test-kid",
    "days": 7
  }'
```

---

## Phase 3: Update Application Configuration

### Update .env File

```env
# Old (hosted Supabase)
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=old-key

# New (Coolify self-hosted)
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=<your-coolify-anon-key>
VITE_SUPABASE_SERVICE_ROLE_KEY=<your-coolify-service-role-key>
```

### Rebuild Frontend

```bash
npm run build
npm run preview  # Test locally

# Deploy to production
git add .env
git commit -m "chore: update Supabase URLs to Coolify instance"
git push
```

---

## Phase 4: Testing Checklist

### Database Tests

- [ ] Can connect to `api.tryeatpal.com:5434`
- [ ] All 88 migrations applied
- [ ] Tables created correctly
- [ ] RLS policies active
- [ ] Indexes created
- [ ] Functions/triggers working

### Edge Functions Tests

- [ ] Health endpoint responds
- [ ] Authentication works (Bearer token)
- [ ] Database functions can query data
- [ ] AI functions can call OpenAI
- [ ] Payment functions can call Stripe
- [ ] Email functions can send emails
- [ ] CORS headers present
- [ ] Error handling works

### Frontend Tests

- [ ] Login/signup works
- [ ] Can fetch user profile
- [ ] Can create/read/update/delete data
- [ ] AI meal planning works
- [ ] Recipe parsing works
- [ ] Barcode lookup works
- [ ] Grocery list generation works
- [ ] Checkout/payments work

---

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs your-postgres-container

# Test connection
docker exec -i your-postgres-container psql -U postgres -d postgres -c "SELECT version();"
```

### Edge Functions Not Starting

```bash
# Check Coolify logs
# Common issues:
# 1. Missing environment variables
# 2. Dockerfile build errors
# 3. Port conflicts
# 4. Missing dependencies in functions
```

### CORS Errors

Ensure all functions return proper CORS headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### Function Timeout

Increase timeout in Coolify or optimize function:
- Use connection pooling
- Cache expensive operations
- Add pagination for large datasets

---

## Architecture Diagram

```
┌─────────────────────┐
│   User Browser      │
│   (eatpal.com)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│         Coolify Instance                │
│  ┌─────────────────────────────────┐   │
│  │  Edge Functions Service         │   │
│  │  functions.tryeatpal.com:8000   │   │
│  │  ┌─────────────────────────┐    │   │
│  │  │ Deno + Supabase CLI     │    │   │
│  │  │ 78 Edge Functions       │    │   │
│  │  └─────────────────────────┘    │   │
│  └──────────────┬──────────────────┘   │
│                 │                       │
│  ┌──────────────▼──────────────────┐   │
│  │  PostgreSQL Database            │   │
│  │  api.tryeatpal.com:5434         │   │
│  │  ┌─────────────────────────┐    │   │
│  │  │ 88 Migrations Applied   │    │   │
│  │  │ RLS Enabled             │    │   │
│  │  └─────────────────────────┘    │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
           │
           ▼
┌─────────────────────┐
│  External Services  │
│  - OpenAI API       │
│  - Stripe API       │
│  - Resend Email     │
│  - Instacart API    │
└─────────────────────┘
```

---

## Success Criteria

### ✅ Deployment Complete When:

1. **Database**: 88 migrations applied, all tables created
2. **Functions**: Health check returns 200, all 78 functions accessible
3. **Frontend**: Can login, create data, use AI features
4. **Payments**: Stripe checkout works
5. **Email**: Notifications sent successfully
6. **Mobile**: Expo app can connect and sync

---

## Next Steps After Deployment

1. **Monitor Performance**:
   - Set up monitoring/alerts
   - Check function execution times
   - Monitor database query performance

2. **Set Up Backups**:
   - Configure automated PostgreSQL backups
   - Test restore procedures
   - Store backups offsite

3. **Security Hardening**:
   - Review RLS policies
   - Rotate API keys
   - Set up rate limiting
   - Configure WAF rules

4. **Optimize**:
   - Add database indexes for slow queries
   - Cache frequently accessed data
   - Optimize image delivery
   - Enable CDN for static assets

5. **Documentation**:
   - Document deployment process
   - Create runbooks for common issues
   - Update team on new URLs

---

## Summary

### Files Created:
- ✅ `Dockerfile.functions` - Edge Functions container
- ✅ `docker-compose.functions.yml` - Compose config
- ✅ `supabase/functions/_health/index.ts` - Health check
- ✅ `coolify-migration/combined_eatpal_migrations_clean.sql` - All migrations
- ✅ `coolify-migration/eatpal-functions-package.zip` - Functions backup

### Commands to Run:
1. Apply database migrations via SSH
2. Push code to Git
3. Create Coolify Public Repo service
4. Configure domain and environment variables
5. Deploy and test

### Estimated Time:
- Database migration: 5-10 minutes
- Edge Functions setup: 10-15 minutes
- Testing: 15-30 minutes
- **Total: ~30-60 minutes**

---

**Ready to deploy? Let's start with Phase 1! 🚀**


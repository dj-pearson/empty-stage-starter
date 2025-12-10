# 🚀 EatPal Coolify Migration - Start Here

## What We've Accomplished

✅ **MCP Server Debugging**: Identified that Edge Functions service wasn't deployed yet  
✅ **Database Analysis**: Found 66 remote migrations vs 88 local migrations  
✅ **Migration Files**: Combined all 88 migrations into single SQL file (776 KB)  
✅ **Edge Functions**: Packaged all 78 functions and created health check  
✅ **Dockerfile Created**: Ready-to-deploy container for Edge Functions  
✅ **Deployment Guides**: Complete step-by-step instructions  

## What You Need to Do Next

### Quick Start (Recommended Order):

#### 1. Deploy Database Migrations (30 minutes)

```bash
# Follow: coolify-migration/DEPLOY_NOW.md
scp coolify-migration/combined_eatpal_migrations_clean.sql root@209.145.59.219:/tmp/
ssh root@209.145.59.219
# ... (see DEPLOY_NOW.md for full steps)
```

#### 2. Deploy Edge Functions Service (30 minutes)

```bash
# a. Push to Git
git add Dockerfile.functions docker-compose.functions.yml supabase/functions/
git commit -m "feat: add Edge Functions service for Coolify"
git push origin main

# b. Create Coolify service
# Follow: coolify-migration/SETUP_EDGE_FUNCTIONS.md
# - Create Public Repo service
# - Point to your GitHub repo
# - Set Dockerfile: Dockerfile.functions
# - Configure domain: functions.tryeatpal.com
# - Add environment variables
# - Deploy!
```

#### 3. Test Everything (15 minutes)

```bash
# Follow: coolify-migration/COMPLETE_DEPLOYMENT_PLAN.md (Phase 4)
# Test database, functions, frontend
```

## Key Files Reference

| File | Purpose | Size |
|------|---------|------|
| `Dockerfile.functions` | Edge Functions container definition | 1 KB |
| `docker-compose.functions.yml` | Optional compose config | 1 KB |
| `supabase/functions/_health/index.ts` | Health check endpoint | 1 KB |
| `coolify-migration/combined_eatpal_migrations_clean.sql` | All 88 database migrations | 776 KB |
| `coolify-migration/eatpal-functions-package.zip` | Backup of all functions | 771 KB |
| `coolify-migration/COMPLETE_DEPLOYMENT_PLAN.md` | Master deployment guide | 10 KB |
| `coolify-migration/DEPLOY_NOW.md` | Quick deployment steps | 5 KB |
| `coolify-migration/SETUP_EDGE_FUNCTIONS.md` | Edge Functions setup guide | 8 KB |

## Architecture

```
Your Coolify Server (209.145.59.219)
│
├── PostgreSQL Service (api.tryeatpal.com:5434)
│   └── 88 migrations (to be applied)
│
└── Edge Functions Service (functions.tryeatpal.com:8000)
    └── 78 Deno functions (to be deployed)
```

## Environment Variables You'll Need

From your `.env` file, you'll need these for the Edge Functions service:

```env
SUPABASE_URL=https://api.tryeatpal.com
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_DB_HOST=<your-server-ip>
SUPABASE_DB_PORT=5434
SUPABASE_DB_PASSWORD=<your-db-password>
OPENAI_API_KEY=<your-openai-key>
STRIPE_SECRET_KEY=<your-stripe-key>
STRIPE_WEBHOOK_SECRET=<your-webhook-secret>
RESEND_API_KEY=<your-resend-key>
```

## Common Issues & Solutions

### "Can't connect to database"
- Check PostgreSQL container is running: `docker ps | grep postgres`
- Verify port 5434 is exposed in Coolify
- Test with: `docker exec -i container-name psql -U postgres -d postgres -c "SELECT 1"`

### "Edge Functions build fails"
- Check Dockerfile path in Coolify settings
- Verify all environment variables are set
- Check Coolify build logs for specific errors

### "Functions return 500 errors"
- Check function logs in Coolify
- Verify environment variables (SUPABASE_URL, keys, etc.)
- Test individual functions with curl

## Quick Test Commands

```bash
# Test database
ssh root@209.145.59.219
docker exec -i container-name psql -U postgres -d postgres -c "SELECT COUNT(*) FROM _migrations;"

# Test Edge Functions health
curl https://functions.tryeatpal.com/_health

# Test a function
curl -X POST https://functions.tryeatpal.com/generate-sitemap \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Estimated Timeline

- **Database migrations**: 5-10 minutes (SSH + SQL execution)
- **Edge Functions setup**: 10-15 minutes (Coolify service creation)
- **Testing**: 15-30 minutes (Verify everything works)
- **Total**: 30-60 minutes

## Need Help?

1. **Database issues**: Check `DEPLOY_NOW.md`
2. **Edge Functions issues**: Check `SETUP_EDGE_FUNCTIONS.md`
3. **Complete guide**: Check `COMPLETE_DEPLOYMENT_PLAN.md`
4. **MCP debugging**: We've confirmed it works for monitoring, but SSH is more reliable for deployment

## Success Criteria

✅ Database has 88 migrations applied  
✅ Health endpoint returns 200 OK  
✅ Can login to frontend  
✅ Can create/read data  
✅ AI features work  
✅ Payments work  

---

**Ready to deploy?** Start with `COMPLETE_DEPLOYMENT_PLAN.md` Phase 1! 🚀

Or for a quick start, go directly to `DEPLOY_NOW.md`.

# 🚀 Deploy EatPal to Coolify - Quick Start

## Current Status

✅ **MCP Server Connected**: Coolify + Supabase healthy  
✅ **Migration Files Ready**: 88 local migrations (776 KB combined SQL)  
✅ **Edge Functions Ready**: 76 functions packaged (771 KB)  
⚠️ **Remote Database**: Has 66 old migrations that need to be handled  

## Problem

The remote Coolify database has 66 migrations from August-September that don't exist locally. We need to either:
1. **Start fresh** (drop and recreate schema)
2. **Merge migrations** (keep old + add new)

## Recommended: Start Fresh

Since this is a new Coolify deployment, the cleanest approach is to start fresh:

### Step 1: Upload Files

```powershell
# From your local machine
scp coolify-migration/combined_eatpal_migrations_clean.sql root@209.145.59.219:/tmp/
scp coolify-migration/eatpal-functions-package.zip root@209.145.59.219:/tmp/
```

### Step 2: SSH into Server

```powershell
ssh root@209.145.59.219
```

### Step 3: Find PostgreSQL Container

```bash
# List containers
docker ps | grep postgres

# Example output:
# 6ifjdjxwwwkskk-db-1   supabase/postgres:15   ...   5434/tcp

# Set your container name
CONTAINER_NAME="6ifjdjxwwkskk-db-1"  # Replace with your actual name
```

### Step 4: Reset Database (Fresh Start)

```bash
# Drop all tables and start fresh
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres <<'EOF'
-- Drop all tables in public schema
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- Verify clean slate
SELECT count(*) as table_count FROM pg_tables WHERE schemaname = 'public';
EOF
```

### Step 5: Apply New Migrations

```bash
# Copy SQL file into container
docker cp /tmp/combined_eatpal_migrations_clean.sql $CONTAINER_NAME:/tmp/

# Apply all migrations
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql

# Check result
if [ $? -eq 0 ]; then
    echo "✅ Migrations applied successfully!"
else
    echo "❌ Migration failed - check errors above"
fi
```

### Step 6: Verify Migrations

```bash
# Check migration tracking table
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "SELECT COUNT(*) as applied_migrations FROM _migrations;"

# Should show: 88

# List some tables
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "\dt"
```

### Step 7: Deploy Edge Functions

```bash
# Unzip functions
cd /tmp
unzip -o eatpal-functions-package.zip

# Find your Supabase project directory on the server
# This is usually where Coolify stores the service files
cd /path/to/coolify/services/your-supabase-service

# If you don't have a functions directory, create it
mkdir -p supabase/functions

# Copy all functions
cp -r /tmp/eatpal-functions-package/* supabase/functions/

# Deploy each function
cd supabase/functions
for dir in */; do
    func_name=$(basename "$dir")
    echo "Deploying: $func_name"
    supabase functions deploy $func_name \
        --project-ref your-project-ref \
        --no-verify-jwt  # Adjust based on your config
done
```

### Step 8: Update Environment Variables

Back on your local machine, update `.env`:

```env
# Update these to point to Coolify
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=<your-new-anon-key>
```

### Step 9: Test Deployment

```bash
# Test database connection
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "SELECT version();"

# Test a simple query
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "SELECT COUNT(*) FROM kids;"

# Test API endpoint
curl https://api.tryeatpal.com/rest/v1/ \
  -H "apikey: YOUR_ANON_KEY"
```

## Alternative: Merge Migrations (Keep Old Data)

If you need to keep the existing data:

### Step 1: Pull Remote Schema

```bash
# On the server
supabase db pull --db-url "postgresql://postgres:KMAGhTR3gsHnBMWMMkeczGYak8RqHI9V@localhost:5434/postgres"
```

### Step 2: Merge with Local

```bash
# This will create migration files for the remote schema
# Then you can apply your new migrations on top
```

## Troubleshooting

### Can't Find Container

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
```

### Permission Denied

```bash
docker exec -u root -i $CONTAINER_NAME psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql
```

### SQL Errors

Check the error message and fix the specific migration file, then regenerate the combined SQL.

## Summary Checklist

- [ ] Upload SQL file via `scp`
- [ ] Upload functions package via `scp`
- [ ] SSH into server
- [ ] Find PostgreSQL container name
- [ ] Reset database (drop all tables)
- [ ] Apply combined migrations
- [ ] Verify 88 migrations applied
- [ ] Deploy 76 edge functions
- [ ] Update local `.env` file
- [ ] Test database connection
- [ ] Test API endpoints

## Next Steps After Deployment

1. Update DNS/routing for `api.tryeatpal.com` and `functions.tryeatpal.com`
2. Configure SSL certificates
3. Set up automated backups
4. Configure monitoring/alerts
5. Test all application features

---

**Ready to deploy?** Start with Step 1! 🚀


# EatPal Migration Quick Start Guide

## Prerequisites

1. **PostgreSQL Client (`psql`)** - Required for applying migrations
   - Download from: https://www.postgresql.org/download/windows/
   - Or install via Chocolatey: `choco install postgresql`
   - Verify: `psql --version`

2. **Database Connection Details** - Get from Coolify dashboard or .env file

## Step 1: Set Environment Variables

Open PowerShell and set your database credentials:

```powershell
# Set the database password (REQUIRED)
$env:COOLIFY_POSTGRES_PASSWORD = "your-postgres-password-here"

# Optional: Override defaults if needed
$env:COOLIFY_POSTGRES_HOST = "api.tryeatpal.com"
$env:COOLIFY_POSTGRES_PORT = "5434"
$env:COOLIFY_POSTGRES_DB = "postgres"
$env:COOLIFY_POSTGRES_USER = "postgres"
```

## Step 2: Run Migration Script

Navigate to the migration directory and run:

```powershell
cd C:\Users\pears\Documents\EatPal\empty-stage-starter\coolify-migration
.\apply-eatpal-migrations.ps1
```

## Step 3: Verify Migrations

Check that migrations were applied:

```powershell
psql -h api.tryeatpal.com -p 5434 -U postgres -d postgres -c "SELECT COUNT(*) FROM _migrations WHERE success = true;"
```

## Step 4: Deploy Edge Functions

The edge functions need to be synced to the Coolify Supabase volumes directory:

```powershell
# Manually copy functions to Coolify (if you have SSH access)
# OR restart the edge functions container in Coolify dashboard
```

Alternatively, you can deploy functions via Supabase CLI:

```powershell
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Deploy all functions
supabase functions deploy
```

## Troubleshooting

### Cannot connect to database

1. **Check if database is public**: In Coolify, ensure "Public Port" is set to 5434
2. **Check firewall**: Ensure port 5434 is open on your Contabo server
3. **Verify credentials**: Double-check your password in `.env`

### psql command not found

Install PostgreSQL client:
```powershell
# Via Chocolatey
choco install postgresql

# Or download installer from
https://www.postgresql.org/download/windows/
```

### Migration fails with permission error

Ensure you're using the correct user credentials. The `postgres` user should have full access.

### Functions not deploying

1. Restart the edge functions container in Coolify
2. Check Coolify logs for errors
3. Verify functions are in: `/data/coolify/services/ig8ow4o4okkogowggkog4cww/volumes/functions/`

## What Gets Deployed

### Database (88 migrations):
- ✅ Core tables (subscriptions, profiles, blog, etc.)
- ✅ Food tracking (foods, recipes, meal plans)
- ✅ SEO management (GSC integration, backlinks)
- ✅ User intelligence (support, analytics)
- ✅ Advanced features (push notifications, voting)
- ✅ Performance optimizations (indexes, rate limiting)

### Edge Functions (73 functions):
- ✅ AI & Content Generation (12 functions)
- ✅ SEO & Analytics (21 functions)
- ✅ Google Search Console (5 functions)
- ✅ Payment & Subscriptions (5 functions)
- ✅ Food & Nutrition (10 functions)
- ✅ User Management (8 functions)
- ✅ Email & Notifications (5 functions)
- ✅ And more...

## Next Steps After Deployment

1. **Update your `.env` file** with new Coolify URLs:
   ```
   VITE_SUPABASE_URL=https://api.tryeatpal.com
   VITE_SUPABASE_ANON_KEY=<from-coolify>
   ```

2. **Test the API**:
   ```powershell
   curl https://api.tryeatpal.com/rest/v1/ -H "apikey: YOUR_ANON_KEY"
   ```

3. **Test an edge function**:
   ```powershell
   curl https://functions.tryeatpal.com/ai-meal-plan -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

4. **Restore your database backup** (if needed):
   ```powershell
   pg_restore -h api.tryeatpal.com -p 5434 -U postgres -d postgres -v Database_Backup/db_cluster-08-12-2025@06-22-46.backup.gz
   ```

## Success Criteria

- [ ] All 88 migrations applied successfully
- [ ] Database accessible at `api.tryeatpal.com:5434`
- [ ] Kong API responding at `https://api.tryeatpal.com`
- [ ] Edge functions responding at `https://functions.tryeatpal.com`
- [ ] No errors in Coolify logs
- [ ] Can query tables via API
- [ ] Authentication works


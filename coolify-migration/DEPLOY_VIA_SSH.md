# Deploy EatPal Migrations via SSH

Since the MCP server's `deploy_migration` tool is encountering errors and direct `psql` connections are being refused, we'll deploy via SSH directly on the Coolify server.

## Prerequisites

✅ Coolify Connection: Working
✅ Supabase Health: Database, Auth, Storage are healthy
✅ Combined SQL File: `combined_eatpal_migrations_clean.sql` (776 KB)
✅ Edge Functions Package: `eatpal-functions-package.zip` (771 KB)

## Step 1: Upload Files to Server

```powershell
# Upload migration SQL
scp coolify-migration/combined_eatpal_migrations_clean.sql root@209.145.59.219:/tmp/

# Upload edge functions package
scp coolify-migration/eatpal-functions-package.zip root@209.145.59.219:/tmp/
```

## Step 2: SSH into Server

```powershell
ssh root@209.145.59.219
```

## Step 3: Find Supabase Database Container

```bash
# List all containers to find Supabase DB
docker ps | grep postgres

# Look for a container name like:
# - supabase-db
# - postgres
# - [service-name]-db
# Example: 6ifjdjxwwwkskk-db-1
```

## Step 4: Apply Migrations

```bash
# Replace CONTAINER_NAME with your actual container name
CONTAINER_NAME="your-postgres-container-name"

# Copy SQL file into container
docker cp /tmp/combined_eatpal_migrations_clean.sql $CONTAINER_NAME:/tmp/

# Execute migrations
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql

# Check for errors
echo "Migration exit code: $?"
```

## Step 5: Verify Migrations

```bash
# Check that _migrations table was created and populated
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "SELECT COUNT(*) FROM _migrations;"

# Should show 88 migrations applied

# Check a sample table from the migrations
docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -c "\dt blog_posts"
```

## Step 6: Deploy Edge Functions

```bash
# Unzip functions package
cd /tmp
unzip -o eatpal-functions-package.zip

# Navigate to the functions directory
cd eatpal-functions-package

# Initialize Supabase if needed (in the project directory)
cd /path/to/your/supabase/project
supabase link --project-ref your-project-ref --password KMAGhTR3gsHnBMWMMkeczGYak8RqHI9V

# Deploy all functions
for dir in /tmp/eatpal-functions-package/*/; do
    func_name=$(basename "$dir")
    echo "Deploying function: $func_name"
    
    # Copy function to supabase/functions directory
    mkdir -p supabase/functions/$func_name
    cp -r "$dir"* supabase/functions/$func_name/
    
    # Deploy the function
    supabase functions deploy $func_name
done
```

## Alternative: Deploy Functions One by One

If batch deployment fails, deploy individually:

```bash
# List functions
ls -1 /tmp/eatpal-functions-package/

# Deploy each function
supabase functions deploy generate-meal-plan
supabase functions deploy analyze-nutrition
# ... etc for all 76 functions
```

## Step 7: Verify Deployment

```bash
# List deployed functions
supabase functions list

# Test a function
curl -i --location --request POST 'https://api.tryeatpal.com/functions/v1/generate-meal-plan' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"test": true}'
```

## Troubleshooting

### Cannot Find Container

```bash
# List all containers with 'postgres' or 'db' in name
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}" | grep -E "postgres|db"

# Or list all Coolify containers
docker ps --format "table {{.Names}}\t{{.Image}}" | grep coolify
```

### Permission Denied in Container

```bash
# Execute as root in container
docker exec -u root -i $CONTAINER_NAME psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql
```

### SQL Syntax Errors

If you encounter errors, you can apply migrations in smaller batches:

```bash
# Split the SQL file
split -l 1000 /tmp/combined_eatpal_migrations_clean.sql migration_part_

# Apply each part
for file in migration_part_*; do
    echo "Applying $file..."
    docker exec -i $CONTAINER_NAME psql -U postgres -d postgres -f /tmp/$file
done
```

## Summary

1. ✅ Upload files via `scp`
2. ✅ SSH into server
3. ✅ Find Supabase container name
4. ✅ Copy SQL into container
5. ✅ Execute migrations
6. ✅ Verify migrations applied
7. ✅ Deploy edge functions
8. ✅ Test deployment

## After Deployment

Update your application's environment variables to point to the new Coolify Supabase:

```env
VITE_SUPABASE_URL=https://api.tryeatpal.com
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Done! 🎉


# Simple SSH Deployment - Final Approach
# Since MCP has some connectivity issues, use reliable SSH method

## ✅ What We Know Works

- ✅ SSH connection to <your-server-ip>
- ✅ Docker container access: `supabase-db-ig8ow4o4okkogowggkog4cww`
- ✅ Migration file ready: `combined_eatpal_migrations_clean.sql` (0.78 MB)
- ✅ Functions package ready: `eatpal-functions-package/` (0.77 MB)

---

## 🚀 Deploy Now (3 Commands)

### From PowerShell on Your Windows Machine:

```powershell
# 1. Upload migration file (you're in coolify-migration directory)
scp combined_eatpal_migrations_clean.sql root@<your-server-ip>:/tmp/

# 2. SSH and apply migrations
ssh root@<your-server-ip> "docker cp /tmp/combined_eatpal_migrations_clean.sql supabase-db-ig8ow4o4okkogowggkog4cww:/tmp/ && docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql"

# 3. Verify migrations
ssh root@<your-server-ip> "docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww psql -U postgres -d postgres -c 'SELECT COUNT(*) as total_migrations FROM _migrations;'"
```

---

## Alternative: Interactive SSH Session

```powershell
# 1. Upload file
cd coolify-migration
scp combined_eatpal_migrations_clean.sql root@<your-server-ip>:/tmp/

# 2. Connect via SSH
ssh root@<your-server-ip>

# Then on the server:
docker cp /tmp/combined_eatpal_migrations_clean.sql supabase-db-ig8ow4o4okkogowggkog4cww:/tmp/

docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww \
  psql -U postgres -d postgres -f /tmp/combined_eatpal_migrations_clean.sql

# Check results
docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww \
  psql -U postgres -d postgres -c "SELECT COUNT(*) FROM _migrations;"

docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww \
  psql -U postgres -d postgres -c "\dt"
```

---

## After Migrations: Deploy Edge Functions

### Option A: Via Supabase CLI

```powershell
# Set environment
$env:SUPABASE_URL = "https://api.tryeatpal.com"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc2NTI1MzE2MCwiZXhwIjo0OTIwOTI2NzYwLCJyb2xlIjoic2VydmljZV9yb2xlIn0.boQSRX69iO2srPeiyEmc6IgDfwpJZOIhDmnW-NnW6rs"

# Deploy all functions
cd ..\supabase\functions
supabase functions deploy --project-ref api.tryeatpal.com
```

### Option B: Deploy Individual Functions

```powershell
cd ..\supabase\functions

# Deploy each function
supabase functions deploy ai-meal-plan --project-ref api.tryeatpal.com
supabase functions deploy create-checkout --project-ref api.tryeatpal.com
# ... etc
```

---

## Why This Approach?

1. **MCP Server Limitations**: The `supabase-coolify-mcp-server` is still using placeholder URLs for SQL execution
2. **Direct Access Works**: We've confirmed direct database and SSH access work reliably
3. **Simplicity**: 3 commands vs troubleshooting MCP configuration
4. **Speed**: Can complete deployment in < 5 minutes

---

## Ready?

Run the first command now:

```powershell
scp combined_eatpal_migrations_clean.sql root@<your-server-ip>:/tmp/
```

Then run the second command to apply migrations! 🚀


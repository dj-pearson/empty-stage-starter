# Fix: Supabase Vector Configuration Error

## Problem
```
ERROR vector::cli: Configuration error. error=Is a directory (os error 21)
```

Vector (log aggregator) can't start because it's looking for `etc/vector/vector.yml` but finding a directory instead.

---

## Solution 1: Create Vector Configuration File (Recommended)

### Step 1: Access Your Coolify Supabase Service

In Coolify dashboard:
1. Go to your Supabase service
2. Look for "Storages" or "Volumes" section
3. Find the vector configuration volume mount

### Step 2: Create Proper vector.yml File

Create a file at the correct location with this minimal configuration:

**File: `vector.yml`** (should be mounted to `/etc/vector/vector.yml`)

```yaml
# Minimal Vector configuration for Supabase
data_dir: "/var/lib/vector"

# Sources - collect logs from Supabase services
sources:
  # PostgreSQL logs
  postgres_logs:
    type: "file"
    include:
      - "/var/log/postgresql/*.log"
    read_from: "beginning"

  # API logs (PostgREST, GoTrue, etc.)
  api_logs:
    type: "file"
    include:
      - "/var/log/api/*.log"
    read_from: "beginning"

# Transforms - process the logs (optional)
transforms:
  parse_logs:
    type: "remap"
    inputs:
      - "postgres_logs"
      - "api_logs"
    source: |
      . = parse_json!(.message)

# Sinks - where to send logs
sinks:
  # Send to console (for Coolify to capture)
  console:
    type: "console"
    inputs:
      - "parse_logs"
    encoding:
      codec: "json"

  # Or disable if you don't need logging
  # blackhole:
  #   type: "blackhole"
  #   inputs:
  #     - "postgres_logs"
  #     - "api_logs"
```

### Step 3: Restart Supabase Service

In Coolify:
1. Save the vector.yml file
2. Restart the Supabase service
3. Check logs - Vector should start successfully

---

## Solution 2: Disable Vector (If You Don't Need Advanced Logging)

### Option A: Via Coolify Environment Variable

Add this environment variable to your Supabase service:

```bash
VECTOR_DISABLED=true
```

Or:

```bash
DISABLE_VECTOR=true
```

Then restart the service.

### Option B: Modify Docker Command

If Coolify exposes the Docker command/entrypoint, you can disable vector by:

1. Find the service configuration
2. Remove vector from the startup command
3. Or add a flag to skip vector initialization

---

## Solution 3: Quick Fix with Minimal Config

If you can't access the file system directly, create this minimal vector.yml:

```yaml
data_dir: "/tmp/vector"

sources:
  dummy:
    type: "stdin"

sinks:
  blackhole:
    type: "blackhole"
    inputs:
      - "dummy"
```

This creates a no-op Vector configuration that won't crash but also won't collect logs.

---

## Verifying the Fix

After applying the fix, check Supabase logs:

```
✓ Should see: INFO vector::app: Vector has started
✓ Should NOT see: ERROR vector::cli: Configuration error
```

---

## Coolify-Specific Instructions

### Method 1: Via Coolify UI

1. Go to Supabase service
2. Click "Storages" or "Configuration"
3. Look for vector volume mount
4. Edit or add vector.yml file
5. Restart service

### Method 2: Via Coolify File Manager (if available)

1. Access Coolify's file manager
2. Navigate to Supabase volume
3. Create `/etc/vector/vector.yml`
4. Paste minimal config above
5. Save and restart

### Method 3: Via SSH to Contabo Server

```bash
# SSH into your Contabo server
ssh user@your-contabo-ip

# Find the Supabase/Vector container volume
docker volume ls | grep vector

# Or find the mounted path
docker inspect <supabase-container-id> | grep vector

# Create the vector.yml file
# (Location depends on your Coolify setup)
sudo nano /path/to/vector/vector.yml

# Paste the minimal config, save

# Restart Supabase via Coolify UI
```

---

## After Vector is Fixed

Once Vector starts successfully:

1. **Check PostgreSQL is accessible**
   ```bash
   docker exec <postgres-container> psql -U postgres -c "SELECT version();"
   ```

2. **Make PostgreSQL port public**
   
   In Coolify:
   - Go to Supabase service
   - Find PostgreSQL port (usually 5432)
   - Add port mapping: `5432:5432`
   - Or enable "Make Public" option
   - Restart service

3. **Get connection string**
   ```
   postgresql://postgres:[PASSWORD]@[YOUR-CONTABO-IP]:5432/postgres
   ```

4. **Test connection from your machine**
   ```bash
   psql "postgresql://postgres:[PASSWORD]@[YOUR-CONTABO-IP]:5432/postgres" -c "SELECT 1;"
   ```

---

## Security Note

Once PostgreSQL is publicly accessible:

1. **Use strong password** for postgres user
2. **Configure pg_hba.conf** to restrict IPs (optional)
   ```
   host all all 0.0.0.0/0 md5  # Allow all (less secure)
   host all all YOUR-IP/32 md5  # Allow only your IP (more secure)
   ```
3. **Use SSL connections** if possible
4. **Consider using SSH tunnel** instead of public access:
   ```bash
   ssh -L 5432:localhost:5432 user@contabo-ip
   # Then connect to localhost:5432
   ```

---

## Quick Checklist

- [ ] Created or fixed vector.yml configuration
- [ ] Restarted Supabase service in Coolify
- [ ] Vector starts without errors
- [ ] PostgreSQL container is running
- [ ] PostgreSQL port is exposed (5432)
- [ ] Can connect from external machine
- [ ] Ready to run migration scripts!

---

## Next Steps After Fix

Once Supabase is running and PostgreSQL is accessible:

1. Test connection:
   ```bash
   psql "postgresql://postgres:PASS@YOUR-IP:5432/postgres" -c "SELECT 1;"
   ```

2. Run migrations:
   ```bash
   cd coolify-migration
   ./apply-migrations.sh "postgresql://postgres:PASS@YOUR-IP:5432/postgres"
   ```

3. Restore database:
   ```bash
   pg_restore -h YOUR-IP -U postgres -d postgres \
     Database_Backup/db_cluster-08-12-2025@06-22-46.backup
   ```

---

**Most Common Fix**: Create a simple vector.yml file in the right location and restart!


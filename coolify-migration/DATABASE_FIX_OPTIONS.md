# 🚨 EatPal Database Connection Fix

## Current Status

✅ **Port 5434 is OPEN** (TCP test successful)  
❌ **PostgreSQL is closing connections immediately**

This indicates PostgreSQL is running but rejecting connections due to:
1. `pg_hba.conf` configuration (most likely)
2. Database not fully initialized
3. Password authentication method mismatch

---

## 🔧 Solution 1: Fix via Coolify Terminal (RECOMMENDED)

### Step 1: Access Database Container

In Coolify Dashboard:
1. Go to **Services** → **EatPal** → **supabase-db**
2. Click **Terminal** button

### Step 2: Check PostgreSQL Configuration

In the container terminal:

```bash
# Check if PostgreSQL is running
ps aux | grep postgres

# Check pg_hba.conf
cat /etc/postgresql/postgresql.conf | grep listen_addresses

# Check pg_hba.conf for connection rules
cat /var/lib/postgresql/data/pg_hba.conf
```

### Step 3: Fix pg_hba.conf

The file should have this line for external connections:

```bash
# Edit pg_hba.conf
echo "host    all             all             0.0.0.0/0               md5" >> /var/lib/postgresql/data/pg_hba.conf

# Reload PostgreSQL
pg_ctl reload -D /var/lib/postgresql/data
```

### Step 4: Test Connection from Container

```bash
# Test local connection
psql -U postgres -d postgres -c "SELECT version();"

# Test from another container
psql -h supabase-db -p 5432 -U postgres -d postgres -c "SELECT version();"
```

---

## 🔧 Solution 2: Apply Migrations Inside Container (FASTEST)

Since external connections aren't working, apply migrations from inside the container:

### Step 1: Copy Migrations to Container

From your local machine:

```powershell
# Create a single SQL file with all migrations
cd C:\Users\pears\Documents\EatPal\empty-stage-starter\coolify-migration

# Generate combined migration file
powershell -ExecutionPolicy Bypass -File .\create-combined-migration.ps1
```

I'll create this script for you...

### Step 2: Upload to Coolify

In Coolify Dashboard:
1. **Services** → **EatPal** → **Files**
2. Navigate to `/data/coolify/services/ig8ow4o4okkogowggkog4cww/volumes/db/`
3. Upload `combined_migrations.sql`

### Step 3: Apply from Container Terminal

In Coolify Terminal:

```bash
# Enter database container
docker exec -it supabase-db-ig8ow4o4okkogowggkog4cww bash

# Apply migrations
psql -U postgres -d postgres -f /var/lib/postgresql/data/combined_migrations.sql

# Or if migrations are in mounted volume
psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/combined_migrations.sql
```

---

## 🔧 Solution 3: Use Coolify Exec (CLI)

If you have SSH access to your Contabo server:

```bash
# SSH to Contabo
ssh root@209.145.59.219

# Execute migrations in container
docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww psql -U postgres -d postgres < /path/to/migrations.sql
```

---

## 🔧 Solution 4: Rebuild Database with Custom pg_hba.conf

### Create custom pg_hba.conf

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
host    all             all             0.0.0.0/0               md5
host    replication     all             0.0.0.0/0               md5
```

### Add to Docker Compose

In Coolify, edit the EatPal service environment variables:
- Add: `POSTGRES_HOST_AUTH_METHOD=md5`

Then restart the service.

---

## 🎯 Recommended Action Plan

**Option A: Quick Fix (5 minutes)**
1. Create combined migration SQL file
2. Upload to Coolify via Files UI
3. Run from container terminal

**Option B: Proper Fix (15 minutes)**
1. SSH into Contabo server
2. Fix pg_hba.conf
3. Reload PostgreSQL
4. Run migrations from local machine

**Option C: Restart Everything (10 minutes)**
1. Stop EatPal service in Coolify
2. Add `POSTGRES_HOST_AUTH_METHOD=md5` to environment
3. Start service
4. Wait for health checks
5. Try connection again

---

## 🤖 What I'll Do Next

I'll create the **combined migration file** so you can apply it manually. This is the fastest path forward.

**Which solution would you like me to prepare?**


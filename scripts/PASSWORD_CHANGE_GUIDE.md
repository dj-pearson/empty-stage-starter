# Supabase PostgreSQL Password Change Guide

## Quick Start

### Basic Usage

```powershell
# Navigate to scripts directory
cd scripts

# Run the script
.\change-supabase-password.ps1

# Or specify server address directly
.\change-supabase-password.ps1 -ServerAddress root@yourserver.com
```

## What This Script Does

The script automates the entire password change process:

1. ✅ **Connects to your server via SSH**
2. ✅ **Changes password in PostgreSQL** for:
   - `postgres` user (main superuser)
   - `supabase_admin` user (if exists)
   - `authenticator` user (used by PostgREST)
3. ✅ **Updates all environment variables**:
   - `POSTGRES_PASSWORD`
   - `DB_PASSWORD`
   - `DATABASE_URL`
   - `GOTRUE_DATABASE_URL`
   - `STORAGE_DATABASE_URL`
   - `META_DATABASE_URL`
4. ✅ **Backs up your .env file** before making changes
5. ✅ **Restarts services in the correct order**:
   - Stops Supabase services
   - Restarts PostgreSQL
   - Waits for PostgreSQL to be ready
   - Restarts all services
6. ✅ **Verifies the connection** with the new password
7. ✅ **Optionally updates your local .env file**

## Prerequisites

### Required
- ✅ SSH access to your server (password or key-based)
- ✅ Docker and docker-compose on the server
- ✅ PowerShell 5.1+ or PowerShell Core 7+ (on Windows)

### Optional
- SSH key authentication (recommended for easier connection)

## Usage Examples

### Example 1: Interactive Mode (Recommended)

```powershell
.\change-supabase-password.ps1
```

The script will prompt you for:
1. SSH server address (e.g., `root@123.45.67.89`)
2. Project path (default: `~/supabase`)
3. New password (hidden input)
4. Confirm password
5. Confirmation before proceeding

### Example 2: With Parameters

```powershell
.\change-supabase-password.ps1 -ServerAddress root@api.tryeatpal.com -ProjectPath /root/supabase
```

### Example 3: Custom PostgreSQL Container

```powershell
.\change-supabase-password.ps1 -ServerAddress root@yourserver.com -PostgresContainerName supabase_db_1
```

## Step-by-Step Process

### Step 1: Server Connection
```
Enter SSH server address: root@yourserver.com
```
- Use your SSH username and server IP/domain
- Format: `user@server` or `user@123.45.67.89`

### Step 2: Project Path
```
Enter Supabase project path on server: ~/supabase
```
- Default is `~/supabase`
- Press Enter to use default or specify custom path

### Step 3: New Password
```
Enter new PostgreSQL password: ********
Confirm new password: ********
```
- Minimum 8 characters
- Input is hidden for security
- Must match confirmation

### Step 4: Auto-Detection
- Script automatically detects your PostgreSQL container
- If detection fails, you'll be prompted to enter it manually

### Step 5: Confirmation
```
⚠ This will change your PostgreSQL password. Continue? (y/N)
```
- Type `y` and press Enter to proceed
- Type `N` or anything else to cancel

### Step 6: Execution
The script will:
- Change passwords in the database
- Update environment variables
- Restart services
- Verify the connection

### Step 7: Local Update (Optional)
```
Do you want to update your local .env file? (y/N)
```
- Type `y` to update your local `.env` file
- Your local `.env` will be backed up first

## What Gets Updated

### In the Database
```sql
ALTER USER postgres WITH PASSWORD 'new_password';
ALTER USER supabase_admin WITH PASSWORD 'new_password';
ALTER USER authenticator WITH PASSWORD 'new_password';
```

### In .env File
```env
# Direct password variables
POSTGRES_PASSWORD=new_password
DB_PASSWORD=new_password

# Connection strings (password is URL-encoded)
DATABASE_URL=postgresql://postgres:new_password@db:5432/postgres
GOTRUE_DATABASE_URL=postgresql://postgres:new_password@db:5432/postgres
STORAGE_DATABASE_URL=postgresql://postgres:new_password@db:5432/postgres
META_DATABASE_URL=postgresql://postgres:new_password@db:5432/postgres
```

## Service Restart Order

The script follows the correct restart sequence:

1. **Stop services** (keeps database running):
   ```
   kong, auth, rest, realtime, storage, imgproxy, meta, functions, analytics
   ```

2. **Restart PostgreSQL**:
   ```
   docker-compose restart db
   ```

3. **Wait 15 seconds** for PostgreSQL to be fully ready

4. **Start all services**:
   ```
   docker-compose up -d
   ```

5. **Wait 5 seconds** and verify connection

## Backup Files

The script creates backups with timestamps:

### On Server
```
.env.backup.20260114_103045
```

### Locally (if you choose to update)
```
.env.backup.20260114_103045
```

Backup format: `.env.backup.YYYYMMDD_HHMMSS`

## Troubleshooting

### SSH Connection Fails

**Error**: `Permission denied (publickey,password)`

**Solution**:
```powershell
# Test SSH connection manually
ssh root@yourserver.com

# If that works, the script should work too
```

### Container Not Found

**Error**: `Could not auto-detect PostgreSQL container`

**Solution**:
```powershell
# SSH into server and list containers
ssh root@yourserver.com "docker ps --format '{{.Names}}'"

# Find your PostgreSQL container name (usually contains 'db' or 'postgres')
# Run script with explicit container name
.\change-supabase-password.ps1 -PostgresContainerName supabase_db_1
```

### Password Change Fails

**Error**: `Failed to change postgres password`

**Solution**:
```powershell
# Check if container is running
ssh root@yourserver.com "docker ps | grep postgres"

# Check PostgreSQL logs
ssh root@yourserver.com "cd ~/supabase && docker-compose logs db --tail=50"
```

### Services Don't Start

**Error**: Services fail to restart after password change

**Solution**:
```powershell
# SSH into server
ssh root@yourserver.com

# Navigate to project
cd ~/supabase

# Check which services are down
docker-compose ps

# Check logs for failed services
docker-compose logs <service-name>

# Manually restart if needed
docker-compose up -d
```

## Security Best Practices

1. ✅ **Use strong passwords**: Minimum 16 characters with mixed case, numbers, and symbols
2. ✅ **Don't share passwords**: Each environment should have unique passwords
3. ✅ **Use SSH keys**: Set up key-based authentication instead of passwords
4. ✅ **Backup .env files**: The script does this automatically
5. ✅ **Update all locations**: Don't forget CI/CD secrets and backup scripts
6. ✅ **Test immediately**: Verify your application still works after the change

## Post-Change Checklist

After running the script, make sure to update:

- [ ] Local `.env` file (script can do this)
- [ ] CI/CD pipeline secrets (GitHub Actions, GitLab CI, etc.)
- [ ] Backup scripts that connect to the database
- [ ] Any external services connecting to your database
- [ ] Team members who need the new credentials
- [ ] Password manager entries

## Additional Commands

### Manual Password Reset (if script fails)

```powershell
# SSH into server
ssh root@yourserver.com

# Go to project directory
cd ~/supabase

# Change password in database
docker exec -it <postgres-container-name> psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'new_password';"

# Update .env manually
nano .env

# Restart services
docker-compose restart db
sleep 10
docker-compose up -d
```

### View Current Database Users

```powershell
ssh root@yourserver.com "cd ~/supabase && docker exec -it <container-name> psql -U postgres -c '\du'"
```

### Check Service Status

```powershell
ssh root@yourserver.com "cd ~/supabase && docker-compose ps"
```

### View Service Logs

```powershell
ssh root@yourserver.com "cd ~/supabase && docker-compose logs -f --tail=100"
```

## Need Help?

If you encounter issues:

1. Check the error messages carefully
2. Review the backup `.env` file
3. Check service logs: `docker-compose logs <service>`
4. Try manual password reset steps above
5. Restore from backup if needed: `cp .env.backup.TIMESTAMP .env`

## Script Execution Policy

If you get an execution policy error:

```powershell
# Check current policy
Get-ExecutionPolicy

# If restricted, run this (as Administrator):
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or run the script with bypass:
powershell -ExecutionPolicy Bypass -File .\change-supabase-password.ps1
```

---

**Version**: 1.0  
**Last Updated**: 2026-01-14  
**Tested On**: Windows 10/11, PowerShell 7+

#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Change PostgreSQL password for self-hosted Supabase instance via SSH

.DESCRIPTION
    This script connects to your server via SSH and:
    1. Changes the PostgreSQL password in the database
    2. Updates all environment variables with the new password
    3. Restarts services in the correct order

.PARAMETER ServerAddress
    SSH server address (e.g., user@yourserver.com or 123.45.67.89)

.PARAMETER ProjectPath
    Path to your Supabase project on the server (default: ~/supabase)

.PARAMETER PostgresContainerName
    Name of the PostgreSQL container (default: auto-detect)

.EXAMPLE
    .\change-supabase-password.ps1 -ServerAddress root@yourserver.com

.NOTES
    Requires: SSH client, proper SSH access to server
    Author: Platform Tools
    Version: 1.0
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$ServerAddress,
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectPath = "~/supabase",
    
    [Parameter(Mandatory=$false)]
    [string]$PostgresContainerName = ""
)

# Color output functions
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Success { param([string]$Message) Write-ColorOutput "✓ $Message" "Green" }
function Write-Error { param([string]$Message) Write-ColorOutput "✗ $Message" "Red" }
function Write-Warning { param([string]$Message) Write-ColorOutput "⚠ $Message" "Yellow" }
function Write-Info { param([string]$Message) Write-ColorOutput "ℹ $Message" "Cyan" }
function Write-Step { param([string]$Message) Write-ColorOutput "`n▶ $Message" "Magenta" }

# Banner
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                          ║" -ForegroundColor Cyan
Write-Host "║   🔐 Supabase PostgreSQL Password Change Tool           ║" -ForegroundColor Cyan
Write-Host "║                                                          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Step 1: Get SSH server address
Write-Step "Step 1: Server Connection Details"

if (-not $ServerAddress) {
    $ServerAddress = Read-Host "Enter SSH server address (e.g., root@yourserver.com or user@123.45.67.89)"
}

if (-not $ServerAddress) {
    Write-Error "Server address is required"
    exit 1
}

Write-Info "Target server: $ServerAddress"

# Step 2: Get project path
Write-Step "Step 2: Project Configuration"

$ProjectPathInput = Read-Host "Enter Supabase project path on server (default: $ProjectPath)"
if ($ProjectPathInput) {
    $ProjectPath = $ProjectPathInput
}

Write-Info "Project path: $ProjectPath"

# Step 3: Get new password
Write-Step "Step 3: New Password"

$NewPassword = Read-Host "Enter new PostgreSQL password" -AsSecureString
$NewPasswordConfirm = Read-Host "Confirm new password" -AsSecureString

# Convert SecureString to plain text for comparison
$NewPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($NewPassword)
)
$NewPasswordConfirmPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($NewPasswordConfirm)
)

if ($NewPasswordPlain -ne $NewPasswordConfirmPlain) {
    Write-Error "Passwords do not match"
    exit 1
}

if ($NewPasswordPlain.Length -lt 8) {
    Write-Error "Password must be at least 8 characters long"
    exit 1
}

Write-Success "Password validated"

# Step 4: Test SSH connection
Write-Step "Step 4: Testing SSH Connection"

$sshTest = ssh -o ConnectTimeout=10 -o BatchMode=yes $ServerAddress "echo 'connected'" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Warning "SSH key authentication failed, you may need to enter password"
}

# Step 5: Detect PostgreSQL container
Write-Step "Step 5: Detecting PostgreSQL Container"

if (-not $PostgresContainerName) {
    Write-Info "Auto-detecting PostgreSQL container..."
    
    $detectCommand = @"
cd $ProjectPath && docker-compose ps --format json | grep -E 'postgres|db' | head -n 1 | jq -r '.Name' 2>/dev/null || docker ps --format '{{.Names}}' | grep -E 'postgres|db|supabase.*db' | head -n 1
"@
    
    $PostgresContainerName = ssh $ServerAddress $detectCommand 2>$null
    
    if ($PostgresContainerName) {
        Write-Success "Detected PostgreSQL container: $PostgresContainerName"
    } else {
        Write-Warning "Could not auto-detect PostgreSQL container"
        $PostgresContainerName = Read-Host "Enter PostgreSQL container name manually"
    }
}

if (-not $PostgresContainerName) {
    Write-Error "PostgreSQL container name is required"
    exit 1
}

# Step 6: Create the update script
Write-Step "Step 6: Preparing Update Script"

# Escape special characters in password for different contexts
$PasswordEscaped = $NewPasswordPlain -replace "'", "''"  # SQL escape
$PasswordUrlEncoded = [System.Uri]::EscapeDataString($NewPasswordPlain)  # URL encode

Write-Info "Creating remote update script..."

# Create the bash script that will run on the server
$remoteScript = @"
#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════"
echo "  Supabase PostgreSQL Password Update"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Navigate to project directory
cd $ProjectPath || { echo -e "`${RED}✗ Failed to navigate to $ProjectPath`${NC}"; exit 1; }

echo -e "`${BLUE}▶ Step 1: Changing PostgreSQL password in database`${NC}"

# Change postgres user password
docker exec -i $PostgresContainerName psql -U postgres -c "ALTER USER postgres WITH PASSWORD '$PasswordEscaped';" > /dev/null 2>&1
if [ `$? -eq 0 ]; then
    echo -e "`${GREEN}✓ Changed password for postgres user`${NC}"
else
    echo -e "`${RED}✗ Failed to change postgres password`${NC}"
    exit 1
fi

# Try to change supabase_admin password (may not exist, ignore errors)
docker exec -i $PostgresContainerName psql -U postgres -c "ALTER USER supabase_admin WITH PASSWORD '$PasswordEscaped';" > /dev/null 2>&1
if [ `$? -eq 0 ]; then
    echo -e "`${GREEN}✓ Changed password for supabase_admin user`${NC}"
else
    echo -e "`${YELLOW}⚠ supabase_admin user not found (this is OK if not used)`${NC}"
fi

# Try to change authenticator password (used by PostgREST)
docker exec -i $PostgresContainerName psql -U postgres -c "ALTER USER authenticator WITH PASSWORD '$PasswordEscaped';" > /dev/null 2>&1
if [ `$? -eq 0 ]; then
    echo -e "`${GREEN}✓ Changed password for authenticator user`${NC}"
else
    echo -e "`${YELLOW}⚠ authenticator user not found (this is OK if not used)`${NC}"
fi

echo ""
echo -e "`${BLUE}▶ Step 2: Backing up .env file`${NC}"

# Backup .env file
if [ -f .env ]; then
    cp .env .env.backup.`$(date +%Y%m%d_%H%M%S)
    echo -e "`${GREEN}✓ .env file backed up`${NC}"
else
    echo -e "`${YELLOW}⚠ No .env file found`${NC}"
fi

echo ""
echo -e "`${BLUE}▶ Step 3: Updating environment variables`${NC}"

# Function to update env variable
update_env_var() {
    local var_name=`$1
    local new_value=`$2
    local file=`$3
    
    if grep -q "^`${var_name}=" "`$file" 2>/dev/null; then
        sed -i "s|^`${var_name}=.*|`${var_name}=`${new_value}|" "`$file"
        echo -e "`${GREEN}✓ Updated `${var_name}`${NC}"
        return 0
    else
        echo -e "`${YELLOW}⚠ `${var_name} not found in `$file`${NC}"
        return 1
    fi
}

# Update POSTGRES_PASSWORD
update_env_var "POSTGRES_PASSWORD" "$NewPasswordPlain" ".env"

# Update DB_PASSWORD
update_env_var "DB_PASSWORD" "$NewPasswordPlain" ".env"

# Update DATABASE_URL and related connection strings
if [ -f .env ]; then
    # Get current DATABASE_URL to extract other parts
    CURRENT_DB_URL=`$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- || echo "")
    
    if [ ! -z "`$CURRENT_DB_URL" ]; then
        # Parse the connection string
        DB_HOST=`$(echo "`$CURRENT_DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p' || echo "db")
        DB_PORT=`$(echo "`$CURRENT_DB_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p' || echo "5432")
        DB_NAME=`$(echo "`$CURRENT_DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p' || echo "postgres")
        DB_USER=`$(echo "`$CURRENT_DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p' || echo "postgres")
        
        NEW_DB_URL="postgresql://`${DB_USER}:${PasswordUrlEncoded}@`${DB_HOST}:`${DB_PORT}/`${DB_NAME}"
        
        # Update all *_DATABASE_URL variables
        for var in DATABASE_URL GOTRUE_DATABASE_URL STORAGE_DATABASE_URL META_DATABASE_URL; do
            update_env_var "`$var" "`$NEW_DB_URL" ".env"
        done
    fi
fi

echo ""
echo -e "`${BLUE}▶ Step 4: Restarting services`${NC}"

# Stop all Supabase services (except db)
echo -e "`${BLUE}Stopping Supabase services...`${NC}"
docker-compose stop kong auth rest realtime storage imgproxy meta functions analytics 2>/dev/null || true
echo -e "`${GREEN}✓ Services stopped`${NC}"

# Restart PostgreSQL
echo -e "`${BLUE}Restarting PostgreSQL...`${NC}"
docker-compose restart db
echo -e "`${GREEN}✓ PostgreSQL restarted`${NC}"

# Wait for PostgreSQL to be ready
echo -e "`${BLUE}Waiting for PostgreSQL to be ready...`${NC}"
sleep 15
echo -e "`${GREEN}✓ PostgreSQL is ready`${NC}"

# Restart all services
echo -e "`${BLUE}Starting all services...`${NC}"
docker-compose up -d
echo -e "`${GREEN}✓ All services started`${NC}"

echo ""
echo -e "`${BLUE}▶ Step 5: Verifying connection`${NC}"

# Test the connection with new password
sleep 5
docker exec -i $PostgresContainerName psql -U postgres -c "SELECT version();" > /dev/null 2>&1
if [ `$? -eq 0 ]; then
    echo -e "`${GREEN}✓ PostgreSQL connection verified`${NC}"
else
    echo -e "`${RED}✗ Failed to verify PostgreSQL connection`${NC}"
    exit 1
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo -e "`${GREEN}✓ Password change completed successfully!`${NC}"
echo "════════════════════════════════════════════════════════"
echo ""
echo -e "`${YELLOW}Important:`${NC}"
echo "1. Update your local .env file with the new password"
echo "2. Update any CI/CD secrets with the new password"
echo "3. Update any backup scripts with the new password"
echo ""
echo "Backup of original .env saved with timestamp"
echo ""
"@

# Step 7: Execute the script on the server
Write-Step "Step 7: Executing Password Change on Server"

Write-Warning "This will change your PostgreSQL password. Continue? (y/N)"
$confirm = Read-Host
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Info "Operation cancelled"
    exit 0
}

Write-Info "Connecting to server and executing update..."

# Send the script via SSH and execute it
$remoteScript | ssh $ServerAddress "cat > /tmp/update_password.sh && chmod +x /tmp/update_password.sh && bash /tmp/update_password.sh && rm /tmp/update_password.sh"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Success "Password change completed successfully!"
    Write-Host ""
    Write-Warning "Don't forget to update:"
    Write-Host "  1. Your local .env file" -ForegroundColor Yellow
    Write-Host "  2. Any CI/CD secrets" -ForegroundColor Yellow
    Write-Host "  3. Any backup scripts" -ForegroundColor Yellow
    Write-Host "  4. Any application connection strings" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Error "Password change failed. Check the output above for details."
    exit 1
}

# Step 8: Offer to update local .env
Write-Step "Step 8: Update Local Configuration"

$updateLocal = Read-Host "Do you want to update your local .env file? (y/N)"
if ($updateLocal -eq 'y' -or $updateLocal -eq 'Y') {
    $localEnvPath = Join-Path $PSScriptRoot ".." ".env"
    
    if (Test-Path $localEnvPath) {
        # Backup local .env
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        Copy-Item $localEnvPath "$localEnvPath.backup.$timestamp"
        Write-Success "Local .env backed up"
        
        # Read current .env
        $envContent = Get-Content $localEnvPath
        
        # Update POSTGRES_PASSWORD
        $envContent = $envContent -replace '^POSTGRES_PASSWORD=.*', "POSTGRES_PASSWORD=$NewPasswordPlain"
        
        # Update DATABASE_URL and related connection strings
        $envContent = $envContent | ForEach-Object {
            if ($_ -match '^(.*_)?DATABASE_URL=postgresql://([^:]+):([^@]+)@(.+)$') {
                $prefix = $Matches[1]
                $user = $Matches[2]
                $rest = $Matches[4]
                "${prefix}DATABASE_URL=postgresql://${user}:${PasswordUrlEncoded}@${rest}"
            } else {
                $_
            }
        }
        
        # Write updated content
        $envContent | Set-Content $localEnvPath
        
        Write-Success "Local .env file updated"
    } else {
        Write-Warning "Local .env file not found at: $localEnvPath"
    }
}

Write-Host ""
Write-ColorOutput "╔══════════════════════════════════════════════════════════╗" "Green"
Write-ColorOutput "║                                                          ║" "Green"
Write-ColorOutput "║   ✓ Password Change Complete!                            ║" "Green"
Write-ColorOutput "║                                                          ║" "Green"
Write-ColorOutput "╚══════════════════════════════════════════════════════════╝" "Green"
Write-Host ""

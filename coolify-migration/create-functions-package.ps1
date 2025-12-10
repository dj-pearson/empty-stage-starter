# EatPal Edge Functions Deployment Package Creator
# Creates a deployable package of all 73 edge functions

param(
    [string]$OutputDir = "eatpal-functions-package"
)

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

$FunctionsDir = "..\supabase\functions"
$OutputPath = Join-Path $PSScriptRoot $OutputDir

Write-ColorOutput "===================================" "Yellow"
Write-ColorOutput "  EatPal Functions Package Creator" "Yellow"
Write-ColorOutput "===================================" "Yellow"
Write-Host ""

# Check if functions directory exists
if (-not (Test-Path $FunctionsDir)) {
    Write-ColorOutput "Error: Functions directory not found: $FunctionsDir" "Red"
    exit 1
}

# Create output directory
if (Test-Path $OutputPath) {
    Write-ColorOutput "Removing existing package directory..." "Yellow"
    Remove-Item -Path $OutputPath -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputPath | Out-Null

# Copy _shared directory first
$SharedDir = Join-Path $FunctionsDir "_shared"
if (Test-Path $SharedDir) {
    Write-ColorOutput "Copying _shared utilities..." "Cyan"
    Copy-Item -Path $SharedDir -Destination $OutputPath -Recurse
}

# Get all function directories (exclude _shared)
$FunctionDirs = Get-ChildItem -Path $FunctionsDir -Directory | Where-Object { $_.Name -ne "_shared" } | Sort-Object Name

Write-ColorOutput "Found $($FunctionDirs.Count) edge functions" "Green"
Write-Host ""

$count = 0
foreach ($Dir in $FunctionDirs) {
    $count++
    $FunctionName = $Dir.Name
    
    Write-ColorOutput "[$count/$($FunctionDirs.Count)] Packaging: $FunctionName" "Cyan"
    
    # Copy function directory
    Copy-Item -Path $Dir.FullName -Destination $OutputPath -Recurse
}

# Create deployment script for the server
$DeployScript = @'
#!/bin/bash
# Deploy EatPal Edge Functions to Coolify Supabase
# Run this script ON the Coolify server

set -e

# Configuration
SERVICE_UUID="ig8ow4o4okkogowggkog4cww"
FUNCTIONS_VOLUME="/data/coolify/services/$SERVICE_UUID/volumes/functions"
EDGE_FUNCTIONS_CONTAINER="supabase-edge-functions-$SERVICE_UUID"

echo "==================================="
echo "  EatPal Functions Deployment"
echo "==================================="
echo ""

# Stop edge functions container
echo "Stopping edge functions container..."
docker stop $EDGE_FUNCTIONS_CONTAINER || true

# Create functions volume directory if it doesn't exist
mkdir -p "$FUNCTIONS_VOLUME"

# Copy all functions
echo "Copying functions to volume..."
cp -r ./* "$FUNCTIONS_VOLUME/"

# Set permissions
chmod -R 755 "$FUNCTIONS_VOLUME"

# Start edge functions container
echo "Starting edge functions container..."
docker start $EDGE_FUNCTIONS_CONTAINER

# Wait for container to be healthy
echo "Waiting for container to be healthy..."
sleep 10

# Check status
echo ""
echo "==================================="
echo "  Deployment Status"
echo "==================================="
docker ps --filter "name=$EDGE_FUNCTIONS_CONTAINER" --format "table {{.Names}}\t{{.Status}}"
echo ""

echo "✓ Edge functions deployed!"
echo ""
echo "Test at: https://functions.tryeatpal.com"
'@

Set-Content -Path (Join-Path $OutputPath "deploy.sh") -Value $DeployScript -Encoding UTF8

# Create README
$ReadmeContent = @"
# EatPal Edge Functions Deployment Package

## Contents

- **73 Edge Functions** - All your Supabase Edge Functions
- **_shared/** - Shared utilities and headers
- **deploy.sh** - Deployment script for Coolify server

## Deployment Instructions

### Method 1: Via SCP + SSH (Recommended)

1. **Upload package to Coolify server:**

``````bash
scp -r eatpal-functions-package root@209.145.59.219:/tmp/
``````

2. **SSH into server and deploy:**

``````bash
ssh root@209.145.59.219
cd /tmp/eatpal-functions-package
chmod +x deploy.sh
./deploy.sh
``````

### Method 2: Via Coolify UI

1. **Zip the package:**
   - Right-click ``eatpal-functions-package`` folder
   - Select "Send to" → "Compressed (zipped) folder"

2. **Upload via Coolify:**
   - Go to Coolify Dashboard
   - Services → EatPal → Files
   - Navigate to: ``/data/coolify/services/ig8ow4o4okkogowggkog4cww/volumes/functions/``
   - Upload and extract all function folders

3. **Restart edge functions container:**
   - In Coolify: Services → EatPal → supabase-edge-functions
   - Click "Restart"

### Method 3: Manual Copy

If you have direct access to the server:

``````bash
cp -r /tmp/eatpal-functions-package/* /data/coolify/services/ig8ow4o4okkogowggkog4cww/volumes/functions/
docker restart supabase-edge-functions-ig8ow4o4okkogowggkog4cww
``````

## Function List (73 total)

### AI & Content (12)
- ai-meal-plan, generate-blog-content, generate-social-content, etc.

### SEO & Analytics (21)
- seo-audit, analyze-blog-posts-seo, check-core-web-vitals, etc.

### Payments (5)
- create-checkout, stripe-webhook, manage-subscription, etc.

### Food & Nutrition (10)
- lookup-barcode, identify-food-image, parse-recipe, etc.

### Full list in DEPLOYMENT_PLAN.md

## Testing

After deployment:

``````bash
# Test a function
curl https://functions.tryeatpal.com/ai-meal-plan \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
``````

## Troubleshooting

- **Functions not responding**: Restart the container
- **401 errors**: Check SUPABASE_ANON_KEY in environment
- **500 errors**: Check container logs in Coolify

For more help, see: DATABASE_FIX_OPTIONS.md
"@

Set-Content -Path (Join-Path $OutputPath "README.md") -Value $ReadmeContent -Encoding UTF8

Write-Host ""
Write-ColorOutput "Success! Functions package created!" "Green"
Write-Host ""
Write-ColorOutput "Output: $OutputPath" "Cyan"
Write-Host ""

# Calculate total size
$TotalSize = (Get-ChildItem -Path $OutputPath -Recurse | Measure-Object -Property Length -Sum).Sum
Write-ColorOutput "Package Size: $([math]::Round($TotalSize / 1MB, 2)) MB" "Cyan"
Write-Host ""

Write-ColorOutput "===================================" "Yellow"
Write-ColorOutput "  Package Contents:" "Yellow"
Write-ColorOutput "===================================" "Yellow"
Get-ChildItem -Path $OutputPath -Directory | Select-Object Name, @{Name="Files";Expression={(Get-ChildItem $_.FullName).Count}} | Format-Table -AutoSize

Write-Host ""
Write-ColorOutput "Next: See README.md in the package for deployment instructions" "Green"
Write-Host ""

exit 0


# Deploy EatPal from Windows to Coolify Server
# This script uploads files and provides SSH commands

$Server = "root@209.145.59.219"
$MigrationFile = "combined_eatpal_migrations_clean.sql"
$DeployScript = "deploy-now.sh"

Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  EatPal Deployment Wizard" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""

# Step 1: Upload migration file
Write-Host "Step 1: Uploading migration file..." -ForegroundColor Cyan
scp $MigrationFile ${Server}:/tmp/

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Migration file uploaded" -ForegroundColor Green
} else {
    Write-Host "❌ Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 2: Upload deployment script
Write-Host "Step 2: Uploading deployment script..." -ForegroundColor Cyan
scp $DeployScript ${Server}:/tmp/

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Deployment script uploaded" -ForegroundColor Green
} else {
    Write-Host "❌ Upload failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Instructions for SSH
Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  Files Uploaded Successfully!" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Now SSH into your server and run:" -ForegroundColor White
Write-Host ""
Write-Host "  ssh $Server" -ForegroundColor Cyan
Write-Host "  chmod +x /tmp/deploy-now.sh" -ForegroundColor Cyan
Write-Host "  /tmp/deploy-now.sh" -ForegroundColor Cyan
Write-Host ""
Write-Host "Or run it all in one command:" -ForegroundColor White
Write-Host ""
Write-Host "  ssh $Server 'chmod +x /tmp/deploy-now.sh && /tmp/deploy-now.sh'" -ForegroundColor Green
Write-Host ""

# Ask if user wants to run it now
$response = Read-Host "Do you want to run the deployment now? (y/n)"
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host ""
    Write-Host "Running deployment..." -ForegroundColor Cyan
    Write-Host ""
    ssh $Server "chmod +x /tmp/deploy-now.sh && /tmp/deploy-now.sh"
} else {
    Write-Host ""
    Write-Host "Deployment files ready. Run the commands above when ready." -ForegroundColor Yellow
}


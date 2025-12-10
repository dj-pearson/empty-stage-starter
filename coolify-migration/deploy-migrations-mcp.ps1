# Deploy Migrations via MCP Execute SQL
# Deploys each migration individually for better error handling

$MigrationDir = "..\supabase\migrations"
$MigrationFiles = Get-ChildItem -Path $MigrationDir -Filter "*.sql" | Sort-Object Name

Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  Deploying $($MigrationFiles.Count) Migrations" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""

# Create tracking table first
$createTrackingSQL = @"
CREATE TABLE IF NOT EXISTS _migrations (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);
"@

Write-Host "Creating tracking table..." -ForegroundColor Cyan
Write-Host $createTrackingSQL
Write-Host ""
Write-Host "Run this first: mcp_supabase-coolify_execute_sql" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Enter to continue..."
Read-Host

# Output each migration for manual deployment
$count = 0
foreach ($File in $MigrationFiles) {
    $count++
    $Filename = $File.Name
    
    Write-Host "===================================" -ForegroundColor Cyan
    Write-Host "[$count/$($MigrationFiles.Count)] $Filename" -ForegroundColor White
    Write-Host "===================================" -ForegroundColor Cyan
    
    $content = Get-Content $File.FullName -Raw
    $sizeKB = [math]::Round($content.Length / 1KB, 2)
    
    Write-Host "Size: $sizeKB KB" -ForegroundColor Gray
    Write-Host ""
    
    # Save to individual file for MCP deployment
    $outputFile = Join-Path $PSScriptRoot "temp_migration_${count}.sql"
    $content | Out-File -FilePath $outputFile -Encoding UTF8 -NoNewline
    
    Write-Host "Saved to: $outputFile" -ForegroundColor Green
    Write-Host "Execute via MCP: mcp_supabase-coolify_execute_sql" -ForegroundColor Yellow
    Write-Host ""
    
    if ($count -eq 5) {
        Write-Host "Pausing after 5 migrations for testing..." -ForegroundColor Yellow
        Write-Host "Press Enter to continue or Ctrl+C to stop..."
        Read-Host
    }
}

Write-Host ""
Write-Host "All migrations prepared!" -ForegroundColor Green
Write-Host "Use the MCP execute_sql tool to run each temp_migration_*.sql file" -ForegroundColor Cyan


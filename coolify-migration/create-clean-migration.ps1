# Create CLEAN Combined Migration File for EatPal
# This version runs migrations without error-handling wrappers

param(
    [string]$OutputFile = "combined_eatpal_migrations_clean.sql"
)

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

$MigrationDir = "..\supabase\migrations"
$OutputPath = Join-Path $PSScriptRoot $OutputFile

Write-ColorOutput "===================================" "Yellow"
Write-ColorOutput "  EatPal Clean Migration Generator" "Yellow"
Write-ColorOutput "===================================" "Yellow"
Write-Host ""

# Check if migration directory exists
if (-not (Test-Path $MigrationDir)) {
    Write-ColorOutput "Error: Migration directory not found: $MigrationDir" "Red"
    exit 1
}

# Get all migration files (sorted)
$MigrationFiles = Get-ChildItem -Path $MigrationDir -Filter "*.sql" | Sort-Object Name

Write-ColorOutput "Found $($MigrationFiles.Count) migration files" "Green"
Write-Host ""

# Create combined file header
$Content = "-- ============================================`n"
$Content += "-- EatPal Clean Migrations (No Error Wrappers)`n"
$Content += "-- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
$Content += "-- Total Migrations: $($MigrationFiles.Count)`n"
$Content += "-- ============================================`n`n"

$Content += "-- Create migrations tracking table`n"
$Content += "CREATE TABLE IF NOT EXISTS _migrations (`n"
$Content += "    id SERIAL PRIMARY KEY,`n"
$Content += "    filename TEXT NOT NULL UNIQUE,`n"
$Content += "    applied_at TIMESTAMPTZ DEFAULT NOW()`n"
$Content += ");`n`n"

# Add each migration WITHOUT error handling wrappers
$count = 0
foreach ($File in $MigrationFiles) {
    $count++
    $Filename = $File.Name
    
    Write-ColorOutput "[$count/$($MigrationFiles.Count)] Adding: $Filename" "Cyan"
    
    $Content += "`n-- ============================================`n"
    $Content += "-- Migration ${count}: ${Filename}`n"
    $Content += "-- ============================================`n`n"
    
    # Read migration content directly
    $migrationContent = Get-Content $File.FullName -Raw
    
    # Add the migration content AS-IS
    $Content += $migrationContent
    
    # Just record that we attempted this migration
    $Content += "`n`n-- Record migration`n"
    $Content += "INSERT INTO _migrations (filename) VALUES ('${Filename}') ON CONFLICT (filename) DO NOTHING;`n`n"
}

# Add final summary query
$Content += "`n-- ============================================`n"
$Content += "-- View Migration Results`n"
$Content += "-- ============================================`n`n"
$Content += "SELECT COUNT(*) as total_applied FROM _migrations;`n"
$Content += "SELECT filename, applied_at FROM _migrations ORDER BY applied_at;`n"

# Write to file
Set-Content -Path $OutputPath -Value $Content -Encoding UTF8

Write-Host ""
Write-ColorOutput "Success! Clean migration file created!" "Green"
Write-Host ""
Write-ColorOutput "Output: $OutputPath" "Cyan"
Write-Host ""
Write-ColorOutput "File Size: $([math]::Round((Get-Item $OutputPath).Length / 1MB, 2)) MB" "Cyan"
Write-Host ""

Write-ColorOutput "===================================" "Yellow"
Write-ColorOutput "  Next Steps:" "Yellow"
Write-ColorOutput "===================================" "Yellow"
Write-Host ""
Write-Host "1. Upload to Coolify server:"
Write-Host "   scp ${OutputFile} root@<your-server-ip>:/tmp/"
Write-Host ""
Write-Host "2. Apply via Docker:"
Write-Host "   docker cp /tmp/${OutputFile} supabase-db-ig8ow4o4okkogowggkog4cww:/tmp/"
Write-Host "   docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww psql -U postgres -d postgres -f /tmp/${OutputFile}"
Write-Host ""

exit 0



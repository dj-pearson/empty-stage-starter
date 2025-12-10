# Create Combined Migration File for EatPal
# This combines all 88 migrations into a single SQL file for easy deployment

param(
    [string]$OutputFile = "combined_eatpal_migrations.sql"
)

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

$MigrationDir = "..\supabase\migrations"
$OutputPath = Join-Path $PSScriptRoot $OutputFile

Write-ColorOutput "===================================" "Yellow"
Write-ColorOutput "  EatPal Combined Migration Generator" "Yellow"
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
$Content += "-- EatPal Combined Migrations`n"
$Content += "-- Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"
$Content += "-- Total Migrations: $($MigrationFiles.Count)`n"
$Content += "-- ============================================`n`n"

$Content += "-- Create migrations tracking table`n"
$Content += "CREATE TABLE IF NOT EXISTS _migrations (`n"
$Content += "    id SERIAL PRIMARY KEY,`n"
$Content += "    filename TEXT NOT NULL UNIQUE,`n"
$Content += "    applied_at TIMESTAMPTZ DEFAULT NOW(),`n"
$Content += "    success BOOLEAN DEFAULT true,`n"
$Content += "    error_message TEXT`n"
$Content += ");`n`n"

# Add each migration
$count = 0
foreach ($File in $MigrationFiles) {
    $count++
    $Filename = $File.Name
    
    Write-ColorOutput "[$count/$($MigrationFiles.Count)] Adding: $Filename" "Cyan"
    
    $Content += "`n-- ============================================`n"
    $Content += "-- Migration ${count}: ${Filename}`n"
    $Content += "-- ============================================`n`n"
    
    # Read migration content
    $migrationContent = Get-Content $File.FullName -Raw
    
    # Wrap in DO block for error handling
    $Content += "DO `$`$ `n"
    $Content += "BEGIN`n"
    $Content += "    -- Check if migration already applied`n"
    $Content += "    IF NOT EXISTS (SELECT 1 FROM _migrations WHERE filename = '${Filename}' AND success = true) THEN`n"
    $Content += "        -- Apply migration`n"
    $Content += "        BEGIN`n`n"
    
    # Add the actual migration content (indented)
    $Content += $migrationContent
    
    $Content += "`n`n            -- Record successful migration`n"
    $Content += "            INSERT INTO _migrations (filename, success) VALUES ('${Filename}', true);`n"
    $Content += "        EXCEPTION WHEN OTHERS THEN`n"
    $Content += "            -- Record failed migration`n"
    $Content += "            INSERT INTO _migrations (filename, success, error_message) VALUES ('${Filename}', false, SQLERRM);`n"
    $Content += "            RAISE NOTICE 'Migration failed: % - Error: %', '${Filename}', SQLERRM;`n"
    $Content += "        END;`n"
    $Content += "    ELSE`n"
    $Content += "        RAISE NOTICE 'Skipping already applied migration: %', '${Filename}';`n"
    $Content += "    END IF;`n"
    $Content += "END `$`$;`n`n"
}

# Add final summary
$Content += "`n-- ============================================`n"
$Content += "-- Migration Summary`n"
$Content += "-- ============================================`n`n"
$Content += "DO `$`$ `n"
$Content += "DECLARE`n"
$Content += "    total_count INTEGER;`n"
$Content += "    success_count INTEGER;`n"
$Content += "    failed_count INTEGER;`n"
$Content += "BEGIN`n"
$Content += "    SELECT COUNT(*) INTO total_count FROM _migrations;`n"
$Content += "    SELECT COUNT(*) INTO success_count FROM _migrations WHERE success = true;`n"
$Content += "    SELECT COUNT(*) INTO failed_count FROM _migrations WHERE success = false;`n`n"
$Content += "    RAISE NOTICE '===================================';`n"
$Content += "    RAISE NOTICE 'Migration Summary:';`n"
$Content += "    RAISE NOTICE '  Total:   %', total_count;`n"
$Content += "    RAISE NOTICE '  Success: %', success_count;`n"
$Content += "    RAISE NOTICE '  Failed:  %', failed_count;`n"
$Content += "    RAISE NOTICE '===================================';`n"
$Content += "END `$`$;`n"

# Write to file
Set-Content -Path $OutputPath -Value $Content -Encoding UTF8

Write-Host ""
Write-ColorOutput "Success! Combined migration file created!" "Green"
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
Write-Host "   scp ${OutputFile} root@209.145.59.219:/tmp/"
Write-Host ""
Write-Host "2. Apply via Docker exec:"
Write-Host "   docker exec -i supabase-db-ig8ow4o4okkogowggkog4cww psql -U postgres -d postgres -f /tmp/${OutputFile}"
Write-Host ""

exit 0

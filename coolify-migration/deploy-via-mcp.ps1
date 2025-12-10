# Deploy EatPal Migrations and Functions via MCP Server
# This script uses the Coolify MCP server to deploy everything

param(
    [switch]$MigrationsOnly,
    [switch]$FunctionsOnly
)

Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  EatPal Deployment via MCP" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""

# Load environment variables
$envFile = Join-Path $PSScriptRoot "..\\.env"
if (Test-Path $envFile) {
    Write-Host "Loading environment variables..." -ForegroundColor Cyan
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^#].+?)=(.+)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
    Write-Host "✓ Environment loaded" -ForegroundColor Green
    Write-Host ""
}

# Function to deploy migrations in batches
function Deploy-Migrations {
    Write-Host "===================================" -ForegroundColor Yellow
    Write-Host "  Deploying Migrations" -ForegroundColor Yellow
    Write-Host "===================================" -ForegroundColor Yellow
    Write-Host ""
    
    $migrationFile = Join-Path $PSScriptRoot "combined_eatpal_migrations_clean.sql"
    
    if (-not (Test-Path $migrationFile)) {
        Write-Host "Error: Migration file not found: $migrationFile" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Reading migration file..." -ForegroundColor Cyan
    $migrationContent = Get-Content $migrationFile -Raw
    
    Write-Host "Total size: $([math]::Round((Get-Item $migrationFile).Length / 1KB, 2)) KB" -ForegroundColor Cyan
    Write-Host ""
    
    # Split migrations into individual files for better error handling
    Write-Host "Deploying migrations..." -ForegroundColor Cyan
    Write-Host "Note: This will be executed via the MCP server's execute_sql tool" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To deploy, use the Cursor MCP integration:" -ForegroundColor White
    Write-Host "  1. Open Cursor's command palette" -ForegroundColor White
    Write-Host "  2. Ask: 'Execute SQL from combined_eatpal_migrations_clean.sql'" -ForegroundColor White
    Write-Host "  3. Or use: mcp_supabase-coolify_execute_sql" -ForegroundColor White
    Write-Host ""
}

# Function to package and prepare functions
function Deploy-Functions {
    Write-Host "===================================" -ForegroundColor Yellow
    Write-Host "  Deploying Edge Functions" -ForegroundColor Yellow
    Write-Host "===================================" -ForegroundColor Yellow
    Write-Host ""
    
    $functionsDir = Join-Path $PSScriptRoot "..\supabase\functions"
    
    if (-not (Test-Path $functionsDir)) {
        Write-Host "Error: Functions directory not found: $functionsDir" -ForegroundColor Red
        exit 1
    }
    
    $functionDirs = Get-ChildItem -Path $functionsDir -Directory | Where-Object { $_.Name -ne '_shared' }
    
    Write-Host "Found $($functionDirs.Count) edge functions" -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($funcDir in $functionDirs) {
        $funcName = $funcDir.Name
        $indexFile = Join-Path $funcDir.FullName "index.ts"
        
        if (-not (Test-Path $indexFile)) {
            Write-Host "⚠ Skipping $funcName (no index.ts)" -ForegroundColor Yellow
            continue
        }
        
        Write-Host "📦 $funcName" -ForegroundColor White
        Write-Host "   Path: $indexFile" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "To deploy functions, use:" -ForegroundColor White
    Write-Host "  mcp_supabase-coolify_supabase_functions_deploy" -ForegroundColor Cyan
    Write-Host ""
}

# Main execution
if (-not $FunctionsOnly) {
    Deploy-Migrations
}

if (-not $MigrationsOnly) {
    Deploy-Functions
}

Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  Deployment Prepared!" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next: Use Cursor's AI to execute via MCP tools" -ForegroundColor Green
Write-Host ""


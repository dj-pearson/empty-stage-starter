# Update .env file with correct Supabase-Coolify MCP configuration
# Based on: https://github.com/dj-pearson/supabase-coolify-mcp-server

Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  Updating .env for Supabase-Coolify MCP" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""

$envPath = ".env"
$content = Get-Content $envPath

# Find and update SUPABASE_DB_HOST
$newContent = $content -replace '^SUPABASE_DB_HOST=localhost$', 'SUPABASE_DB_HOST=<your-server-ip>'

# Write back
$newContent | Set-Content $envPath

Write-Host "✓ Updated SUPABASE_DB_HOST to <your-server-ip>" -ForegroundColor Green
Write-Host ""
Write-Host "Current Supabase-Coolify MCP configuration:" -ForegroundColor Cyan
Write-Host ""

Get-Content $envPath | Select-String -Pattern "COOLIFY_API|SUPABASE_DB|SUPABASE_URL|SUPABASE_SERVICE"

Write-Host ""
Write-Host "===================================" -ForegroundColor Yellow
Write-Host "  Configuration Updated!" -ForegroundColor Yellow
Write-Host "===================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Now restart Cursor and the MCP server should connect!" -ForegroundColor Green


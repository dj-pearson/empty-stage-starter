# Fix all edge functions to use export default instead of serve()
# This script updates all functions using the old Deno serve pattern

$functionsToFix = @(
    "ai-meal-plan",
    "analyze-blog-posts-seo",
    "analyze-blog-quality",
    "analyze-content",
    "analyze-images",
    "analyze-internal-links",
    "analyze-semantic-keywords",
    "analyze-support-ticket",
    "apply-seo-fixes",
    "backup-scheduler",
    "backup-user-data",
    "bing-webmaster-oauth",
    "calculate-food-similarity",
    "check-broken-links",
    "check-core-web-vitals",
    "check-keyword-positions",
    "check-mobile-first",
    "check-security-headers",
    "crawl-site",
    "create-checkout",
    "detect-duplicate-content",
    "detect-redirect-chains",
    "enrich-barcodes",
    "ga4-oauth",
    "generate-invoice",
    "generate-schema-markup",
    "gsc-fetch-core-web-vitals",
    "gsc-fetch-properties",
    "gsc-oauth",
    "gsc-sync-data",
    "_health",
    "identify-food-image",
    "lookup-barcode",
    "manage-blog-titles",
    "manage-meal-plan-templates",
    "manage-payment-methods",
    "manage-subscription",
    "monitor-performance-budget",
    "oauth-token-refresh",
    "optimize-page-content",
    "parse-recipe",
    "process-email-sequences",
    "process-notification-queue",
    "publish-scheduled-posts",
    "register-push-token",
    "repurpose-content",
    "run-scheduled-audit",
    "schedule-meal-reminders",
    "send-emails",
    "send-seo-notification",
    "seo-audit",
    "stripe-webhook",
    "suggest-foods",
    "suggest-recipe",
    "suggest-recipes-from-pantry",
    "sync-analytics-data",
    "sync-backlinks",
    "test-blog-webhook",
    "track-engagement",
    "track-serp-positions",
    "update-blog-image",
    "update-user",
    "user-intelligence",
    "validate-structured-data",
    "weekly-summary-generator",
    "yandex-webmaster-oauth"
)

$basePath = "c:\Users\dpearson\Documents\EatPal\empty-stage-starter\supabase\functions"
$fixedCount = 0
$errorCount = 0

foreach ($functionName in $functionsToFix) {
    $filePath = Join-Path $basePath "$functionName\index.ts"
    
    if (Test-Path $filePath) {
        Write-Host "Fixing $functionName..." -ForegroundColor Cyan
        
        try {
            $content = Get-Content $filePath -Raw
            
            # Replace import { serve } from "..." with nothing (remove the import)
            $content = $content -replace 'import \{ serve \} from "https://deno\.land/std@[\d\.]+/http/server\.ts";?\r?\n?', ''
            
            # Replace serve(async (req) => { with export default async (req: Request) => {
            $content = $content -replace 'serve\s*\(\s*async\s*\(\s*req\s*\)\s*=>\s*\{', 'export default async (req: Request) => {'
            
            # Replace closing }); with };
            $content = $content -replace '\}\s*\)\s*;(\s*)$', '}$1'
            
            # Write back
            Set-Content -Path $filePath -Value $content -NoNewline
            
            $fixedCount++
            Write-Host "  ✓ Fixed" -ForegroundColor Green
        }
        catch {
            Write-Host "  ✗ Error: $_" -ForegroundColor Red
            $errorCount++
        }
    }
    else {
        Write-Host "  ⚠ File not found: $filePath" -ForegroundColor Yellow
    }
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "Summary:" -ForegroundColor Magenta
Write-Host "  Fixed: $fixedCount" -ForegroundColor Green
Write-Host "  Errors: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "`nRestart the edge functions server to apply changes." -ForegroundColor Yellow

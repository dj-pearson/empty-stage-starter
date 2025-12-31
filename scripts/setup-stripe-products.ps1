# EatPal Stripe Products Setup Script
# Run this script after installing and configuring Stripe CLI
# Prerequisites:
#   1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
#   2. Login: stripe login
#   3. Run this script: .\setup-stripe-products.ps1

param(
    [switch]$TestMode,
    [switch]$SkipPaymentLinks
)

$ErrorActionPreference = "Stop"

# Configuration
$Products = @(
    @{
        Name = "EatPal Pro"
        Description = "Perfect for families with multiple children. Unlimited meal planning, AI suggestions, and advanced analytics."
        DatabasePlanName = "Pro"
        MonthlyPrice = 1499  # $14.99 in cents
        YearlyPrice = 14390  # $143.90 in cents (20% discount)
        Features = @(
            "Up to 3 children profiles",
            "Unlimited pantry foods",
            "AI meal suggestions",
            "Advanced analytics",
            "Recipe builder",
            "Priority support",
            "Food chaining tools",
            "Kid meal builder"
        )
        Metadata = @{
            plan_tier = "pro"
            max_children = "3"
        }
    },
    @{
        Name = "EatPal Family Plus"
        Description = "For large families and multi-household coordination. Full nutrition tracking and unlimited everything."
        DatabasePlanName = "Family Plus"
        MonthlyPrice = 2499  # $24.99 in cents
        YearlyPrice = 23990  # $239.90 in cents (20% discount)
        Features = @(
            "Unlimited children profiles",
            "Everything in Pro",
            "Multiple parent accounts",
            "Multi-household sharing",
            "Custom meal templates",
            "Full nutrition tracking",
            "Dedicated support"
        )
        Metadata = @{
            plan_tier = "family_plus"
            max_children = "unlimited"
        }
    },
    @{
        Name = "EatPal Professional"
        Description = "For dietitians, therapists, and healthcare providers. White-label branding and client management."
        DatabasePlanName = "Professional"
        MonthlyPrice = 9900  # $99.00 in cents
        YearlyPrice = 95000  # $950.00 in cents (20% discount)
        Features = @(
            "Everything in Family Plus",
            "Professional client portal",
            "White-label branding",
            "Custom domains",
            "API access",
            "Priority phone support",
            "Dedicated account manager"
        )
        Metadata = @{
            plan_tier = "professional"
            max_children = "unlimited"
        }
    }
)

# Output storage
$Results = @{
    Products = @()
    Prices = @()
    PaymentLinks = @()
}

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
}

function Write-Step {
    param([string]$Message)
    Write-Host "  -> $Message" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "  [ERROR] $Message" -ForegroundColor Red
}

# Check if Stripe CLI is installed
Write-Header "Checking Stripe CLI Installation"
try {
    $stripeVersion = stripe version 2>&1
    Write-Success "Stripe CLI found: $stripeVersion"
} catch {
    Write-Error "Stripe CLI not found. Please install it first."
    Write-Host ""
    Write-Host "Installation instructions:" -ForegroundColor White
    Write-Host "  Windows (Scoop): scoop install stripe" -ForegroundColor Gray
    Write-Host "  Windows (Direct): Download from https://github.com/stripe/stripe-cli/releases" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Check if logged in
Write-Header "Checking Stripe Authentication"
try {
    $configList = stripe config --list 2>&1
    if ($configList -match "error" -or $configList -match "not logged in") {
        Write-Error "Not logged in to Stripe"
        Write-Host "  Run: stripe login" -ForegroundColor Gray
        exit 1
    }
    Write-Success "Authenticated with Stripe"
} catch {
    Write-Error "Failed to check Stripe authentication"
    Write-Host "  Run: stripe login" -ForegroundColor Gray
    exit 1
}

# Determine mode
$modeFlag = ""
if ($TestMode) {
    Write-Host ""
    Write-Host "  [TEST MODE] Using test API keys" -ForegroundColor Magenta
    $modeFlag = ""  # Test mode is default for CLI
} else {
    Write-Host ""
    Write-Host "  [LIVE MODE] Using production API keys" -ForegroundColor Red
    Write-Host "  Press Ctrl+C now to cancel, or any key to continue..." -ForegroundColor Red
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    $modeFlag = "--live"
}

# Create Products
Write-Header "Creating Stripe Products"

foreach ($product in $Products) {
    Write-Step "Creating product: $($product.Name)"

    # Build metadata string
    $metadataParams = @()
    foreach ($key in $product.Metadata.Keys) {
        $metadataParams += "-d `"metadata[$key]=$($product.Metadata[$key])`""
    }
    $metadataStr = $metadataParams -join " "

    # Build features string for Stripe (product features are added via API)
    $featuresJson = $product.Features | ConvertTo-Json -Compress

    try {
        # Create product
        $productCmd = "stripe products create $modeFlag --name `"$($product.Name)`" --description `"$($product.Description)`" $metadataStr"
        $productOutput = Invoke-Expression $productCmd 2>&1
        $productJson = ($productOutput | Out-String).Trim()
        $productResult = $productJson | ConvertFrom-Json

        if ($productResult.id) {
            $productId = $productResult.id
            Write-Success "Created product: $productId"

            $Results.Products += @{
                Name = $product.Name
                DatabasePlanName = $product.DatabasePlanName
                ProductId = $productId
            }

            # Create Monthly Price
            Write-Step "  Creating monthly price: `$$($product.MonthlyPrice / 100)/month"
            $monthlyPriceCmd = "stripe prices create $modeFlag --product $productId --unit-amount $($product.MonthlyPrice) --currency usd -d `"recurring[interval]=month`" -d `"nickname=$($product.DatabasePlanName) Monthly`""
            $monthlyPriceOutput = Invoke-Expression $monthlyPriceCmd 2>&1
            $monthlyPriceJson = ($monthlyPriceOutput | Out-String).Trim()
            $monthlyPriceResult = $monthlyPriceJson | ConvertFrom-Json

            if ($monthlyPriceResult.id) {
                Write-Success "  Created monthly price: $($monthlyPriceResult.id)"
                $Results.Prices += @{
                    PlanName = $product.DatabasePlanName
                    Interval = "monthly"
                    PriceId = $monthlyPriceResult.id
                    Amount = $product.MonthlyPrice
                }
            }

            # Create Yearly Price
            Write-Step "  Creating yearly price: `$$($product.YearlyPrice / 100)/year"
            $yearlyPriceCmd = "stripe prices create $modeFlag --product $productId --unit-amount $($product.YearlyPrice) --currency usd -d `"recurring[interval]=year`" -d `"nickname=$($product.DatabasePlanName) Yearly`""
            $yearlyPriceOutput = Invoke-Expression $yearlyPriceCmd 2>&1
            $yearlyPriceJson = ($yearlyPriceOutput | Out-String).Trim()
            $yearlyPriceResult = $yearlyPriceJson | ConvertFrom-Json

            if ($yearlyPriceResult.id) {
                Write-Success "  Created yearly price: $($yearlyPriceResult.id)"
                $Results.Prices += @{
                    PlanName = $product.DatabasePlanName
                    Interval = "yearly"
                    PriceId = $yearlyPriceResult.id
                    Amount = $product.YearlyPrice
                }
            }

            # Create Payment Links (if not skipped)
            if (-not $SkipPaymentLinks) {
                Write-Step "  Creating payment links..."

                # Monthly payment link
                $monthlyLinkCmd = "stripe payment_links create $modeFlag -d `"line_items[0][price]=$($monthlyPriceResult.id)`" -d `"line_items[0][quantity]=1`""
                $monthlyLinkOutput = Invoke-Expression $monthlyLinkCmd 2>&1
                $monthlyLinkJson = ($monthlyLinkOutput | Out-String).Trim()
                $monthlyLinkResult = $monthlyLinkJson | ConvertFrom-Json

                if ($monthlyLinkResult.url) {
                    Write-Success "  Monthly link: $($monthlyLinkResult.url)"
                    $Results.PaymentLinks += @{
                        PlanName = $product.DatabasePlanName
                        Interval = "monthly"
                        LinkId = $monthlyLinkResult.id
                        Url = $monthlyLinkResult.url
                    }
                }

                # Yearly payment link
                $yearlyLinkCmd = "stripe payment_links create $modeFlag -d `"line_items[0][price]=$($yearlyPriceResult.id)`" -d `"line_items[0][quantity]=1`""
                $yearlyLinkOutput = Invoke-Expression $yearlyLinkCmd 2>&1
                $yearlyLinkJson = ($yearlyLinkOutput | Out-String).Trim()
                $yearlyLinkResult = $yearlyLinkJson | ConvertFrom-Json

                if ($yearlyLinkResult.url) {
                    Write-Success "  Yearly link: $($yearlyLinkResult.url)"
                    $Results.PaymentLinks += @{
                        PlanName = $product.DatabasePlanName
                        Interval = "yearly"
                        LinkId = $yearlyLinkResult.id
                        Url = $yearlyLinkResult.url
                    }
                }
            }
        }
    } catch {
        Write-Error "Failed to create product $($product.Name): $_"
    }

    Write-Host ""
}

# Generate Summary
Write-Header "Setup Complete - Summary"

Write-Host ""
Write-Host "Products Created:" -ForegroundColor White
foreach ($p in $Results.Products) {
    Write-Host "  $($p.Name): $($p.ProductId)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Prices Created:" -ForegroundColor White
foreach ($price in $Results.Prices) {
    $amount = $price.Amount / 100
    Write-Host "  $($price.PlanName) ($($price.Interval)): $($price.PriceId) - `$$amount" -ForegroundColor Gray
}

if ($Results.PaymentLinks.Count -gt 0) {
    Write-Host ""
    Write-Host "Payment Links Created:" -ForegroundColor White
    foreach ($link in $Results.PaymentLinks) {
        Write-Host "  $($link.PlanName) ($($link.Interval)): $($link.Url)" -ForegroundColor Gray
    }
}

# Generate SQL Update Script
Write-Header "Generating SQL Update Script"

$sqlContent = @"
-- EatPal Stripe IDs Update Script
-- Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
-- Mode: $(if ($TestMode) { "TEST" } else { "PRODUCTION" })

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

"@

foreach ($product in $Results.Products) {
    $monthlyPrice = $Results.Prices | Where-Object { $_.PlanName -eq $product.DatabasePlanName -and $_.Interval -eq "monthly" }
    $yearlyPrice = $Results.Prices | Where-Object { $_.PlanName -eq $product.DatabasePlanName -and $_.Interval -eq "yearly" }

    $sqlContent += @"

-- Update $($product.DatabasePlanName) plan
UPDATE subscription_plans SET
    stripe_product_id = '$($product.ProductId)',
    stripe_price_id_monthly = '$($monthlyPrice.PriceId)',
    stripe_price_id_yearly = '$($yearlyPrice.PriceId)'
WHERE name = '$($product.DatabasePlanName)';

"@
}

$sqlContent += @"

-- Verify the updates
SELECT
    name,
    stripe_product_id,
    stripe_price_id_monthly,
    stripe_price_id_yearly,
    price_monthly,
    price_yearly,
    is_active
FROM subscription_plans
WHERE name IN ('Pro', 'Family Plus', 'Professional')
ORDER BY sort_order;
"@

# Save SQL file
$sqlFileName = "update-stripe-ids-$(Get-Date -Format 'yyyyMMdd-HHmmss').sql"
$sqlFilePath = Join-Path $PSScriptRoot $sqlFileName
$sqlContent | Out-File -FilePath $sqlFilePath -Encoding UTF8

Write-Success "SQL script saved to: $sqlFilePath"

# Generate JSON output for programmatic use
$jsonOutput = @{
    generated_at = (Get-Date -Format "o")
    mode = if ($TestMode) { "test" } else { "live" }
    products = $Results.Products
    prices = $Results.Prices
    payment_links = $Results.PaymentLinks
} | ConvertTo-Json -Depth 10

$jsonFileName = "stripe-ids-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
$jsonFilePath = Join-Path $PSScriptRoot $jsonFileName
$jsonOutput | Out-File -FilePath $jsonFilePath -Encoding UTF8

Write-Success "JSON output saved to: $jsonFilePath"

# Generate .env format
Write-Header "Environment Variables (add to .env)"

Write-Host ""
Write-Host "# Stripe Price IDs" -ForegroundColor Gray
foreach ($price in $Results.Prices) {
    $envName = "STRIPE_PRICE_$($price.PlanName.ToUpper().Replace(' ', '_'))_$($price.Interval.ToUpper())"
    Write-Host "$envName=$($price.PriceId)" -ForegroundColor White
}

Write-Host ""
Write-Host "# Stripe Product IDs" -ForegroundColor Gray
foreach ($product in $Results.Products) {
    $envName = "STRIPE_PRODUCT_$($product.DatabasePlanName.ToUpper().Replace(' ', '_'))"
    Write-Host "$envName=$($product.ProductId)" -ForegroundColor White
}

if ($Results.PaymentLinks.Count -gt 0) {
    Write-Host ""
    Write-Host "# Stripe Payment Links" -ForegroundColor Gray
    foreach ($link in $Results.PaymentLinks) {
        $envName = "STRIPE_LINK_$($link.PlanName.ToUpper().Replace(' ', '_'))_$($link.Interval.ToUpper())"
        Write-Host "$envName=$($link.Url)" -ForegroundColor White
    }
}

Write-Header "Next Steps"
Write-Host ""
Write-Host "1. Review the generated SQL file and run it against your database:" -ForegroundColor White
Write-Host "   $sqlFilePath" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Update your .env file with the environment variables above" -ForegroundColor White
Write-Host ""
Write-Host "3. Configure Stripe webhooks to point to your endpoint:" -ForegroundColor White
Write-Host "   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Test the checkout flow in your application" -ForegroundColor White
Write-Host ""

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""

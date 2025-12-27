#!/bin/bash
# EatPal Stripe Products Setup Script (Bash version)
# Run this script after installing and configuring Stripe CLI
# Prerequisites:
#   1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
#   2. Login: stripe login
#   3. Run this script: ./setup-stripe-products.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
MAGENTA='\033[0;35m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
TEST_MODE=false
SKIP_PAYMENT_LINKS=false
LIVE_MODE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --test)
            TEST_MODE=true
            shift
            ;;
        --live)
            LIVE_MODE="--live"
            shift
            ;;
        --skip-payment-links)
            SKIP_PAYMENT_LINKS=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Output functions
print_header() {
    echo ""
    echo -e "${CYAN}============================================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}============================================================${NC}"
}

print_step() {
    echo -e "${YELLOW}  -> $1${NC}"
}

print_success() {
    echo -e "${GREEN}  [OK] $1${NC}"
}

print_error() {
    echo -e "${RED}  [ERROR] $1${NC}"
}

# Check Stripe CLI
print_header "Checking Stripe CLI Installation"
if ! command -v stripe &> /dev/null; then
    print_error "Stripe CLI not found. Please install it first."
    echo ""
    echo "Installation instructions:"
    echo "  macOS: brew install stripe/stripe-cli/stripe"
    echo "  Linux: See https://stripe.com/docs/stripe-cli"
    exit 1
fi

STRIPE_VERSION=$(stripe version 2>&1)
print_success "Stripe CLI found: $STRIPE_VERSION"

# Check authentication
print_header "Checking Stripe Authentication"
if ! stripe config --list &> /dev/null; then
    print_error "Not logged in to Stripe"
    echo "  Run: stripe login"
    exit 1
fi
print_success "Authenticated with Stripe"

# Mode confirmation
if [[ -n "$LIVE_MODE" ]]; then
    echo ""
    echo -e "${RED}  [LIVE MODE] Using production API keys${NC}"
    echo -e "${RED}  Press Ctrl+C to cancel, or Enter to continue...${NC}"
    read -r
else
    echo ""
    echo -e "${MAGENTA}  [TEST MODE] Using test API keys${NC}"
fi

# Arrays to store results
declare -a PRODUCT_IDS
declare -a PRODUCT_NAMES
declare -a PRICE_IDS
declare -a PRICE_PLANS
declare -a PRICE_INTERVALS
declare -a LINK_URLS
declare -a LINK_PLANS
declare -a LINK_INTERVALS

# Product definitions
PLANS=("Pro" "Family Plus" "Professional")
NAMES=("EatPal Pro" "EatPal Family Plus" "EatPal Professional")
DESCRIPTIONS=(
    "Perfect for families with multiple children. Unlimited meal planning, AI suggestions, and advanced analytics."
    "For large families and multi-household coordination. Full nutrition tracking and unlimited everything."
    "For dietitians, therapists, and healthcare providers. White-label branding and client management."
)
MONTHLY_PRICES=(1499 2499 9900)  # in cents
YEARLY_PRICES=(14390 23990 95000)  # in cents

print_header "Creating Stripe Products"

for i in "${!PLANS[@]}"; do
    PLAN="${PLANS[$i]}"
    NAME="${NAMES[$i]}"
    DESC="${DESCRIPTIONS[$i]}"
    MONTHLY="${MONTHLY_PRICES[$i]}"
    YEARLY="${YEARLY_PRICES[$i]}"

    print_step "Creating product: $NAME"

    # Create product
    PRODUCT_JSON=$(stripe products create $LIVE_MODE \
        --name="$NAME" \
        --description="$DESC" \
        -d "metadata[plan_tier]=$(echo "$PLAN" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')" \
        2>&1)

    PRODUCT_ID=$(echo "$PRODUCT_JSON" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

    if [[ -n "$PRODUCT_ID" ]]; then
        print_success "Created product: $PRODUCT_ID"
        PRODUCT_IDS+=("$PRODUCT_ID")
        PRODUCT_NAMES+=("$PLAN")

        # Create Monthly Price
        MONTHLY_DISPLAY=$(echo "scale=2; $MONTHLY / 100" | bc)
        print_step "  Creating monthly price: \$$MONTHLY_DISPLAY/month"

        MONTHLY_PRICE_JSON=$(stripe prices create $LIVE_MODE \
            --product="$PRODUCT_ID" \
            --unit-amount="$MONTHLY" \
            --currency=usd \
            -d "recurring[interval]=month" \
            -d "nickname=$PLAN Monthly" \
            2>&1)

        MONTHLY_PRICE_ID=$(echo "$MONTHLY_PRICE_JSON" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

        if [[ -n "$MONTHLY_PRICE_ID" ]]; then
            print_success "  Created monthly price: $MONTHLY_PRICE_ID"
            PRICE_IDS+=("$MONTHLY_PRICE_ID")
            PRICE_PLANS+=("$PLAN")
            PRICE_INTERVALS+=("monthly")
        fi

        # Create Yearly Price
        YEARLY_DISPLAY=$(echo "scale=2; $YEARLY / 100" | bc)
        print_step "  Creating yearly price: \$$YEARLY_DISPLAY/year"

        YEARLY_PRICE_JSON=$(stripe prices create $LIVE_MODE \
            --product="$PRODUCT_ID" \
            --unit-amount="$YEARLY" \
            --currency=usd \
            -d "recurring[interval]=year" \
            -d "nickname=$PLAN Yearly" \
            2>&1)

        YEARLY_PRICE_ID=$(echo "$YEARLY_PRICE_JSON" | grep -o '"id": "[^"]*"' | head -1 | cut -d'"' -f4)

        if [[ -n "$YEARLY_PRICE_ID" ]]; then
            print_success "  Created yearly price: $YEARLY_PRICE_ID"
            PRICE_IDS+=("$YEARLY_PRICE_ID")
            PRICE_PLANS+=("$PLAN")
            PRICE_INTERVALS+=("yearly")
        fi

        # Create Payment Links
        if [[ "$SKIP_PAYMENT_LINKS" != "true" ]]; then
            print_step "  Creating payment links..."

            # Monthly link
            MONTHLY_LINK_JSON=$(stripe payment_links create $LIVE_MODE \
                -d "line_items[0][price]=$MONTHLY_PRICE_ID" \
                -d "line_items[0][quantity]=1" \
                2>&1)

            MONTHLY_LINK_URL=$(echo "$MONTHLY_LINK_JSON" | grep -o '"url": "[^"]*"' | head -1 | cut -d'"' -f4)

            if [[ -n "$MONTHLY_LINK_URL" ]]; then
                print_success "  Monthly link: $MONTHLY_LINK_URL"
                LINK_URLS+=("$MONTHLY_LINK_URL")
                LINK_PLANS+=("$PLAN")
                LINK_INTERVALS+=("monthly")
            fi

            # Yearly link
            YEARLY_LINK_JSON=$(stripe payment_links create $LIVE_MODE \
                -d "line_items[0][price]=$YEARLY_PRICE_ID" \
                -d "line_items[0][quantity]=1" \
                2>&1)

            YEARLY_LINK_URL=$(echo "$YEARLY_LINK_JSON" | grep -o '"url": "[^"]*"' | head -1 | cut -d'"' -f4)

            if [[ -n "$YEARLY_LINK_URL" ]]; then
                print_success "  Yearly link: $YEARLY_LINK_URL"
                LINK_URLS+=("$YEARLY_LINK_URL")
                LINK_PLANS+=("$PLAN")
                LINK_INTERVALS+=("yearly")
            fi
        fi
    else
        print_error "Failed to create product: $NAME"
    fi

    echo ""
done

# Generate Summary
print_header "Setup Complete - Summary"

echo ""
echo "Products Created:"
for i in "${!PRODUCT_IDS[@]}"; do
    echo "  ${PRODUCT_NAMES[$i]}: ${PRODUCT_IDS[$i]}"
done

echo ""
echo "Prices Created:"
for i in "${!PRICE_IDS[@]}"; do
    echo "  ${PRICE_PLANS[$i]} (${PRICE_INTERVALS[$i]}): ${PRICE_IDS[$i]}"
done

if [[ ${#LINK_URLS[@]} -gt 0 ]]; then
    echo ""
    echo "Payment Links Created:"
    for i in "${!LINK_URLS[@]}"; do
        echo "  ${LINK_PLANS[$i]} (${LINK_INTERVALS[$i]}): ${LINK_URLS[$i]}"
    done
fi

# Generate SQL
print_header "Generating SQL Update Script"

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
SQL_FILE="$SCRIPT_DIR/update-stripe-ids-$TIMESTAMP.sql"

MODE_LABEL="TEST"
if [[ -n "$LIVE_MODE" ]]; then
    MODE_LABEL="PRODUCTION"
fi

cat > "$SQL_FILE" << EOSQL
-- EatPal Stripe IDs Update Script
-- Generated: $(date "+%Y-%m-%d %H:%M:%S")
-- Mode: $MODE_LABEL

-- WARNING: Run this script to update your subscription_plans table with the new Stripe IDs

EOSQL

for i in "${!PRODUCT_IDS[@]}"; do
    PLAN="${PRODUCT_NAMES[$i]}"
    PROD_ID="${PRODUCT_IDS[$i]}"

    # Find matching prices
    MONTHLY_PRICE_ID=""
    YEARLY_PRICE_ID=""
    for j in "${!PRICE_IDS[@]}"; do
        if [[ "${PRICE_PLANS[$j]}" == "$PLAN" ]]; then
            if [[ "${PRICE_INTERVALS[$j]}" == "monthly" ]]; then
                MONTHLY_PRICE_ID="${PRICE_IDS[$j]}"
            elif [[ "${PRICE_INTERVALS[$j]}" == "yearly" ]]; then
                YEARLY_PRICE_ID="${PRICE_IDS[$j]}"
            fi
        fi
    done

    cat >> "$SQL_FILE" << EOSQL

-- Update $PLAN plan
UPDATE subscription_plans SET
    stripe_product_id = '$PROD_ID',
    stripe_price_id_monthly = '$MONTHLY_PRICE_ID',
    stripe_price_id_yearly = '$YEARLY_PRICE_ID'
WHERE name = '$PLAN';

EOSQL
done

cat >> "$SQL_FILE" << 'EOSQL'

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
EOSQL

print_success "SQL script saved to: $SQL_FILE"

# Generate JSON output
JSON_FILE="$SCRIPT_DIR/stripe-ids-$TIMESTAMP.json"

echo "{" > "$JSON_FILE"
echo "  \"generated_at\": \"$(date -Iseconds)\"," >> "$JSON_FILE"
echo "  \"mode\": \"$MODE_LABEL\"," >> "$JSON_FILE"
echo "  \"products\": [" >> "$JSON_FILE"

for i in "${!PRODUCT_IDS[@]}"; do
    COMMA=""
    if [[ $i -lt $((${#PRODUCT_IDS[@]} - 1)) ]]; then
        COMMA=","
    fi
    echo "    {\"name\": \"${PRODUCT_NAMES[$i]}\", \"product_id\": \"${PRODUCT_IDS[$i]}\"}$COMMA" >> "$JSON_FILE"
done

echo "  ]," >> "$JSON_FILE"
echo "  \"prices\": [" >> "$JSON_FILE"

for i in "${!PRICE_IDS[@]}"; do
    COMMA=""
    if [[ $i -lt $((${#PRICE_IDS[@]} - 1)) ]]; then
        COMMA=","
    fi
    echo "    {\"plan\": \"${PRICE_PLANS[$i]}\", \"interval\": \"${PRICE_INTERVALS[$i]}\", \"price_id\": \"${PRICE_IDS[$i]}\"}$COMMA" >> "$JSON_FILE"
done

echo "  ]" >> "$JSON_FILE"
echo "}" >> "$JSON_FILE"

print_success "JSON output saved to: $JSON_FILE"

# Environment variables output
print_header "Environment Variables (add to .env)"

echo ""
echo "# Stripe Price IDs"
for i in "${!PRICE_IDS[@]}"; do
    ENV_NAME="STRIPE_PRICE_$(echo "${PRICE_PLANS[$i]}" | tr '[:lower:]' '[:upper:]' | tr ' ' '_')_$(echo "${PRICE_INTERVALS[$i]}" | tr '[:lower:]' '[:upper:]')"
    echo "$ENV_NAME=${PRICE_IDS[$i]}"
done

echo ""
echo "# Stripe Product IDs"
for i in "${!PRODUCT_IDS[@]}"; do
    ENV_NAME="STRIPE_PRODUCT_$(echo "${PRODUCT_NAMES[$i]}" | tr '[:lower:]' '[:upper:]' | tr ' ' '_')"
    echo "$ENV_NAME=${PRODUCT_IDS[$i]}"
done

if [[ ${#LINK_URLS[@]} -gt 0 ]]; then
    echo ""
    echo "# Stripe Payment Links"
    for i in "${!LINK_URLS[@]}"; do
        ENV_NAME="STRIPE_LINK_$(echo "${LINK_PLANS[$i]}" | tr '[:lower:]' '[:upper:]' | tr ' ' '_')_$(echo "${LINK_INTERVALS[$i]}" | tr '[:lower:]' '[:upper:]')"
        echo "$ENV_NAME=${LINK_URLS[$i]}"
    done
fi

print_header "Next Steps"
echo ""
echo "1. Review the generated SQL file and run it against your database:"
echo "   $SQL_FILE"
echo ""
echo "2. Update your .env file with the environment variables above"
echo ""
echo "3. Configure Stripe webhooks to point to your endpoint:"
echo "   stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook"
echo ""
echo "4. Test the checkout flow in your application"
echo ""

echo -e "${GREEN}Setup complete!${NC}"
echo ""

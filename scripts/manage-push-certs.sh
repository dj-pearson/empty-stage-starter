#!/bin/bash

# Push Notification Certificate Management Script
# Usage: ./scripts/manage-push-certs.sh [command]
#
# Commands:
#   check      - Check certificate expiry status
#   generate   - Generate a new CSR for APNs certificate
#   convert    - Convert .cer to .p12 format
#   encode     - Base64 encode certificate for secrets storage
#   test-apns  - Test APNs connectivity
#   test-fcm   - Test FCM connectivity
#   help       - Show this help message

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CERT_DIR="${CERT_DIR:-./certs}"
BUNDLE_ID="${BUNDLE_ID:-com.eatpal.app}"

print_header() {
    echo ""
    echo "=============================================="
    echo "$1"
    echo "=============================================="
    echo ""
}

check_dependencies() {
    local deps=("openssl" "curl" "base64")
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            echo -e "${RED}Error: $dep is required but not installed.${NC}"
            exit 1
        fi
    done
}

# Check certificate expiry
cmd_check() {
    print_header "Checking Push Certificate Status"

    if [ ! -d "$CERT_DIR" ]; then
        echo -e "${YELLOW}Certificate directory not found: $CERT_DIR${NC}"
        echo "Creating directory..."
        mkdir -p "$CERT_DIR"
    fi

    # Check for .p12 files
    local found=0
    for cert in "$CERT_DIR"/*.p12; do
        if [ -f "$cert" ]; then
            found=1
            echo "Checking: $cert"

            read -sp "Enter certificate password: " password
            echo ""

            expiry=$(openssl pkcs12 -in "$cert" -passin pass:"$password" -nodes 2>/dev/null | \
                     openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

            if [ -n "$expiry" ]; then
                expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -jf "%b %d %H:%M:%S %Y %Z" "$expiry" +%s 2>/dev/null)
                now_epoch=$(date +%s)
                days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

                echo "Certificate: $(basename "$cert")"
                echo "Expires: $expiry"

                if [ "$days_left" -lt 7 ]; then
                    echo -e "${RED}Status: CRITICAL - $days_left days remaining${NC}"
                elif [ "$days_left" -lt 30 ]; then
                    echo -e "${YELLOW}Status: WARNING - $days_left days remaining${NC}"
                else
                    echo -e "${GREEN}Status: OK - $days_left days remaining${NC}"
                fi
                echo ""
            else
                echo -e "${RED}Error: Could not read certificate expiry${NC}"
            fi
        fi
    done

    if [ $found -eq 0 ]; then
        echo "No .p12 certificates found in $CERT_DIR"
        echo ""
        echo "If you're using APNs Auth Keys (.p8), they don't expire."
        echo "Check for .p8 files:"
        ls -la "$CERT_DIR"/*.p8 2>/dev/null || echo "No .p8 files found"
    fi
}

# Generate CSR for new certificate
cmd_generate() {
    print_header "Generating Certificate Signing Request"

    mkdir -p "$CERT_DIR"

    local key_file="$CERT_DIR/push_key.pem"
    local csr_file="$CERT_DIR/push_csr.csr"

    if [ -f "$key_file" ]; then
        echo -e "${YELLOW}Warning: Private key already exists at $key_file${NC}"
        read -p "Overwrite? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "Using existing key..."
        else
            openssl genrsa -out "$key_file" 2048
            echo -e "${GREEN}Generated new private key: $key_file${NC}"
        fi
    else
        openssl genrsa -out "$key_file" 2048
        echo -e "${GREEN}Generated private key: $key_file${NC}"
    fi

    read -p "Enter Common Name (e.g., 'EatPal Push'): " cn
    read -p "Enter Organization: " org
    read -p "Enter Country (2 letter code): " country

    openssl req -new -key "$key_file" -out "$csr_file" \
        -subj "/CN=$cn/O=$org/C=$country"

    echo -e "${GREEN}Generated CSR: $csr_file${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Go to Apple Developer Portal > Certificates"
    echo "2. Click '+' to create a new certificate"
    echo "3. Select 'Apple Push Notification service SSL'"
    echo "4. Select your App ID"
    echo "5. Upload the CSR file: $csr_file"
    echo "6. Download the .cer file and save to $CERT_DIR"
}

# Convert .cer to .p12
cmd_convert() {
    print_header "Converting Certificate to .p12 Format"

    local cer_file="${1:-}"
    local key_file="$CERT_DIR/push_key.pem"

    if [ -z "$cer_file" ]; then
        echo "Usage: $0 convert <path-to-cer-file>"
        echo ""
        echo "Available .cer files in $CERT_DIR:"
        ls -la "$CERT_DIR"/*.cer 2>/dev/null || echo "No .cer files found"
        exit 1
    fi

    if [ ! -f "$cer_file" ]; then
        echo -e "${RED}Error: Certificate file not found: $cer_file${NC}"
        exit 1
    fi

    if [ ! -f "$key_file" ]; then
        echo -e "${RED}Error: Private key not found: $key_file${NC}"
        echo "Run '$0 generate' first to create a private key"
        exit 1
    fi

    local pem_file="$CERT_DIR/push_cert.pem"
    local p12_file="$CERT_DIR/push_cert.p12"

    # Convert DER to PEM
    openssl x509 -inform DER -in "$cer_file" -out "$pem_file"
    echo "Converted to PEM: $pem_file"

    # Create P12
    read -sp "Enter password for .p12 file: " password
    echo ""
    read -sp "Confirm password: " password_confirm
    echo ""

    if [ "$password" != "$password_confirm" ]; then
        echo -e "${RED}Error: Passwords do not match${NC}"
        exit 1
    fi

    openssl pkcs12 -export -in "$pem_file" -inkey "$key_file" \
        -out "$p12_file" -name "EatPal Push Certificate" \
        -passout pass:"$password"

    echo -e "${GREEN}Created .p12: $p12_file${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run '$0 encode $p12_file' to base64 encode for Supabase"
    echo "2. Update Supabase secrets with the encoded value"
}

# Base64 encode for secrets storage
cmd_encode() {
    print_header "Base64 Encoding for Secrets Storage"

    local file="${1:-}"

    if [ -z "$file" ]; then
        echo "Usage: $0 encode <path-to-file>"
        exit 1
    fi

    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: File not found: $file${NC}"
        exit 1
    fi

    local output_file="${file}.base64"

    base64 -w 0 "$file" > "$output_file" 2>/dev/null || base64 -i "$file" | tr -d '\n' > "$output_file"

    echo -e "${GREEN}Encoded file saved to: $output_file${NC}"
    echo ""
    echo "To set as Supabase secret:"
    echo "  supabase secrets set APNS_CERT_BASE64=\$(cat $output_file)"
    echo ""
    echo "Or copy the content:"
    cat "$output_file"
    echo ""
}

# Test APNs connectivity
cmd_test_apns() {
    print_header "Testing APNs Connectivity"

    local device_token="${1:-}"
    local environment="${2:-sandbox}"

    if [ -z "$device_token" ]; then
        echo "Usage: $0 test-apns <device-token> [sandbox|production]"
        exit 1
    fi

    local host="api.sandbox.push.apple.com"
    if [ "$environment" == "production" ]; then
        host="api.push.apple.com"
    fi

    echo "Environment: $environment"
    echo "Host: $host"
    echo "Device Token: ${device_token:0:20}..."
    echo ""

    # Check if we have auth key or certificate
    if [ -n "$APNS_KEY_ID" ] && [ -n "$APNS_TEAM_ID" ] && [ -f "$CERT_DIR/AuthKey_$APNS_KEY_ID.p8" ]; then
        echo "Using APNs Auth Key authentication"
        echo -e "${YELLOW}JWT generation requires Node.js or similar - use Edge Function for testing${NC}"
    else
        echo "Checking for certificate..."
        local p12_file="$CERT_DIR/push_cert.p12"
        if [ -f "$p12_file" ]; then
            echo "Found certificate: $p12_file"

            read -sp "Enter certificate password: " password
            echo ""

            # Extract cert and key for curl
            local temp_pem="/tmp/push_combined.pem"
            openssl pkcs12 -in "$p12_file" -out "$temp_pem" -nodes -passin pass:"$password" 2>/dev/null

            echo "Sending test notification..."

            response=$(curl -v -X POST \
                --cert "$temp_pem" \
                -H "apns-topic: $BUNDLE_ID" \
                -H "apns-push-type: alert" \
                -d '{"aps":{"alert":"Test notification from CLI"}}' \
                "https://$host/3/device/$device_token" 2>&1)

            rm -f "$temp_pem"

            if echo "$response" | grep -q "200"; then
                echo -e "${GREEN}Success! Notification sent.${NC}"
            else
                echo -e "${RED}Failed to send notification${NC}"
                echo "$response"
            fi
        else
            echo -e "${RED}No certificate found. Please set up authentication first.${NC}"
        fi
    fi
}

# Test FCM connectivity
cmd_test_fcm() {
    print_header "Testing FCM Connectivity"

    local device_token="${1:-}"

    if [ -z "$device_token" ]; then
        echo "Usage: $0 test-fcm <device-token>"
        exit 1
    fi

    if [ -z "$FCM_SERVER_KEY" ]; then
        echo -e "${RED}Error: FCM_SERVER_KEY environment variable not set${NC}"
        echo "Set it with: export FCM_SERVER_KEY=your-server-key"
        exit 1
    fi

    echo "Device Token: ${device_token:0:20}..."
    echo ""
    echo "Sending test notification..."

    response=$(curl -s -X POST \
        -H "Authorization: key=$FCM_SERVER_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"to\": \"$device_token\",
            \"notification\": {
                \"title\": \"Test\",
                \"body\": \"Test notification from CLI\"
            }
        }" \
        https://fcm.googleapis.com/fcm/send)

    if echo "$response" | grep -q '"success":1'; then
        echo -e "${GREEN}Success! Notification sent.${NC}"
    else
        echo -e "${RED}Failed to send notification${NC}"
        echo "$response"
    fi
}

# Show help
cmd_help() {
    echo "Push Notification Certificate Management Script"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  check           Check certificate expiry status"
    echo "  generate        Generate a new CSR for APNs certificate"
    echo "  convert <file>  Convert .cer to .p12 format"
    echo "  encode <file>   Base64 encode file for secrets storage"
    echo "  test-apns       Test APNs connectivity"
    echo "  test-fcm        Test FCM connectivity"
    echo "  help            Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  CERT_DIR        Directory for certificates (default: ./certs)"
    echo "  BUNDLE_ID       iOS Bundle ID (default: com.eatpal.app)"
    echo "  APNS_KEY_ID     APNs Auth Key ID"
    echo "  APNS_TEAM_ID    Apple Team ID"
    echo "  FCM_SERVER_KEY  Firebase Cloud Messaging server key"
    echo ""
    echo "Examples:"
    echo "  $0 check"
    echo "  $0 generate"
    echo "  $0 convert certs/aps_production.cer"
    echo "  $0 encode certs/push_cert.p12"
    echo "  $0 test-apns abc123devicetoken sandbox"
    echo "  FCM_SERVER_KEY=xxx $0 test-fcm abc123devicetoken"
}

# Main
check_dependencies

case "${1:-help}" in
    check)
        cmd_check
        ;;
    generate)
        cmd_generate
        ;;
    convert)
        cmd_convert "$2"
        ;;
    encode)
        cmd_encode "$2"
        ;;
    test-apns)
        cmd_test_apns "$2" "$3"
        ;;
    test-fcm)
        cmd_test_fcm "$2"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        cmd_help
        exit 1
        ;;
esac

#!/usr/bin/env bash
set -euo pipefail

##############################################################################
# EatPal — App Store & Play Store Screenshot Capture
#
# Automates capturing screenshots at every required device size for both
# Apple App Store and Google Play Store submissions.
#
# Supports two modes:
#   1. Maestro (recommended) — fully automated navigation + capture
#   2. Simulator-only — boots simulators/emulators, you navigate manually
#
# Prerequisites:
#   brew install maestro        # for automated mode
#   xcode-select --install      # iOS simulators
#   Android Studio              # Android emulators (or sdkmanager CLI)
#
# Usage:
#   ./scripts/capture-store-screenshots.sh                   # full run
#   ./scripts/capture-store-screenshots.sh --platform ios    # iOS only
#   ./scripts/capture-store-screenshots.sh --platform android # Android only
#   ./scripts/capture-store-screenshots.sh --manual          # skip Maestro
#   ./scripts/capture-store-screenshots.sh --light-only      # skip dark mode
#   ./scripts/capture-store-screenshots.sh --dark-only       # dark mode only
##############################################################################

# ─── Configuration ──────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/screenshots"
MAESTRO_DIR="$PROJECT_ROOT/.maestro"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Parse CLI flags
PLATFORM="all"        # ios | android | all
MODE="auto"           # auto | manual
THEME="both"          # both | light | dark

while [[ $# -gt 0 ]]; do
  case $1 in
    --platform)   PLATFORM="$2"; shift 2 ;;
    --manual)     MODE="manual"; shift ;;
    --light-only) THEME="light"; shift ;;
    --dark-only)  THEME="dark"; shift ;;
    --help|-h)
      echo "Usage: $0 [--platform ios|android|all] [--manual] [--light-only|--dark-only]"
      exit 0 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ─── Apple App Store — Required Screenshot Sizes (2025-2026) ────────────────
#
# Apple requires at least 6.9" and 6.5" for iPhone submissions.
# iPad is required only if the app runs on iPad.
# Up to 10 screenshots per locale per device class.
#
# Format: "LABEL:SIMULATOR_NAME:WIDTHxHEIGHT"

IOS_DEVICES=(
  "iPhone-6.9in:iPhone 16 Pro Max:1320x2868"
  "iPhone-6.7in:iPhone 15 Pro Max:1290x2796"
  "iPhone-6.5in:iPhone 14 Plus:1284x2778"
  "iPhone-6.1in:iPhone 15:1179x2556"
  "iPad-13in:iPad Pro 13-inch (M4):2064x2752"
  "iPad-12.9in:iPad Pro (12.9-inch) (6th generation):2048x2732"
)

# ─── Google Play Store — Required Screenshot Sizes ──────────────────────────
#
# Play Store requires phone screenshots. Tablet is optional but recommended.
# 2–8 screenshots per device type. Aspect ratio: 16:9 or 9:16.
# Min 320px, max 3840px on any side.
#
# Format: "LABEL:AVD_NAME:WIDTHxHEIGHT"
# AVD names match `emulator -list-avds`; create these via Android Studio.

ANDROID_DEVICES=(
  "Phone-1080p:Pixel_8_Pro_API_35:1080x2400"
  "Phone-1440p:Pixel_8_Pro_API_35:1440x3120"
  "Tablet-10in:Pixel_Tablet_API_35:1600x2560"
)

# ─── Screens to Capture ────────────────────────────────────────────────────
# Each entry is a logical screen name used to name the output file.
# Maestro flows in .maestro/ navigate to each of these.

SCREENS=(
  "01-home-dashboard"
  "02-meal-planner"
  "03-pantry"
  "04-grocery-list"
  "05-barcode-scanner"
  "06-kid-profile"
  "07-recipes"
  "08-ai-coach"
  "09-insights"
  "10-settings"
)

# ─── Helper Functions ───────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[screenshots]${NC} $*"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[✗]${NC} $*"; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is not installed."
    echo "  Install: $2"
    return 1
  fi
  ok "$1 found"
}

wait_for_boot() {
  local device_type="$1"  # ios or android
  local max_wait=120
  local elapsed=0

  log "Waiting for $device_type device to boot (max ${max_wait}s)..."

  if [[ "$device_type" == "ios" ]]; then
    while [[ $elapsed -lt $max_wait ]]; do
      if xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
        ok "iOS simulator booted"
        return 0
      fi
      sleep 2
      elapsed=$((elapsed + 2))
    done
  else
    while [[ $elapsed -lt $max_wait ]]; do
      if adb shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
        ok "Android emulator booted"
        return 0
      fi
      sleep 2
      elapsed=$((elapsed + 2))
    done
  fi

  err "Device did not boot within ${max_wait}s"
  return 1
}

# ─── Preflight Checks ──────────────────────────────────────────────────────

preflight() {
  log "Running preflight checks..."
  echo ""

  local has_maestro=true
  local has_ios=true
  local has_android=true

  check_command "node" "https://nodejs.org" || exit 1

  if [[ "$MODE" == "auto" ]]; then
    check_command "maestro" "brew install maestro" || {
      warn "Maestro not found — falling back to manual mode"
      MODE="manual"
      has_maestro=false
    }
  fi

  if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
    check_command "xcrun" "xcode-select --install" || has_ios=false
    if $has_ios; then
      if ! xcrun simctl list devices available 2>/dev/null | grep -q "iPhone"; then
        warn "No iOS simulators found. Install via Xcode > Settings > Platforms."
        has_ios=false
      else
        ok "iOS simulators available"
      fi
    fi
    if ! $has_ios && [[ "$PLATFORM" == "ios" ]]; then
      err "iOS platform requested but not available"
      exit 1
    fi
  fi

  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
    check_command "adb" "Android Studio > SDK Manager > Platform Tools" || has_android=false
    if $has_android && command -v emulator &>/dev/null; then
      ok "Android emulator found"
    else
      warn "Android emulator not in PATH. Add \$ANDROID_HOME/emulator to PATH."
      has_android=false
    fi
    if ! $has_android && [[ "$PLATFORM" == "android" ]]; then
      err "Android platform requested but not available"
      exit 1
    fi
  fi

  echo ""

  # Export for later use
  export HAS_IOS=$has_ios
  export HAS_ANDROID=$has_android
}

# ─── Create Output Directories ──────────────────────────────────────────────

setup_output_dirs() {
  log "Creating output directory structure..."

  local stores=()
  if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
    stores+=("apple")
  fi
  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
    stores+=("google")
  fi

  local themes=()
  if [[ "$THEME" == "both" ]]; then
    themes=("light" "dark")
  else
    themes=("$THEME")
  fi

  for store in "${stores[@]}"; do
    if [[ "$store" == "apple" ]]; then
      for device in "${IOS_DEVICES[@]}"; do
        IFS=':' read -r label _ _ <<< "$device"
        for theme in "${themes[@]}"; do
          mkdir -p "$OUTPUT_DIR/$store/$label/$theme"
        done
      done
    else
      for device in "${ANDROID_DEVICES[@]}"; do
        IFS=':' read -r label _ _ <<< "$device"
        for theme in "${themes[@]}"; do
          mkdir -p "$OUTPUT_DIR/$store/$label/$theme"
        done
      done
    fi
  done

  ok "Output directories created at $OUTPUT_DIR/"
}

# ─── iOS Screenshot Capture ────────────────────────────────────────────────

capture_ios_screenshot() {
  local sim_udid="$1"
  local output_path="$2"

  xcrun simctl io "$sim_udid" screenshot "$output_path" 2>/dev/null
  if [[ -f "$output_path" ]]; then
    ok "  Saved: $(basename "$output_path")"
  else
    err "  Failed: $(basename "$output_path")"
  fi
}

find_or_create_simulator() {
  local sim_name="$1"
  local udid

  # Try to find an existing simulator with this name
  udid=$(xcrun simctl list devices available -j 2>/dev/null | \
    node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      for (const [runtime, devices] of Object.entries(data.devices)) {
        for (const d of devices) {
          if (d.name === '$sim_name' && d.isAvailable) {
            console.log(d.udid);
            process.exit(0);
          }
        }
      }
    " 2>/dev/null || true)

  if [[ -n "$udid" ]]; then
    echo "$udid"
    return 0
  fi

  warn "Simulator '$sim_name' not found. Checking for alternatives..."

  # Try to find a similar device
  local alt_udid
  alt_udid=$(xcrun simctl list devices available -j 2>/dev/null | \
    node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const target = '$sim_name'.toLowerCase();
      for (const [runtime, devices] of Object.entries(data.devices)) {
        if (!runtime.includes('iOS')) continue;
        for (const d of devices) {
          if (d.isAvailable && d.name.toLowerCase().includes(target.split(' ').slice(0,2).join(' ').toLowerCase())) {
            console.log(d.udid + '|' + d.name);
            process.exit(0);
          }
        }
      }
    " 2>/dev/null || true)

  if [[ -n "$alt_udid" ]]; then
    local name="${alt_udid#*|}"
    local uid="${alt_udid%%|*}"
    warn "Using alternative: $name"
    echo "$uid"
    return 0
  fi

  err "No matching simulator for '$sim_name'. Skipping."
  return 1
}

run_ios_screenshots() {
  log "═══════════════════════════════════════════"
  log " iOS Screenshot Capture"
  log "═══════════════════════════════════════════"
  echo ""

  local themes=()
  if [[ "$THEME" == "both" ]]; then themes=("light" "dark"); else themes=("$THEME"); fi

  for device_config in "${IOS_DEVICES[@]}"; do
    IFS=':' read -r label sim_name resolution <<< "$device_config"
    log "──── $label ($sim_name) ────"

    local sim_udid
    sim_udid=$(find_or_create_simulator "$sim_name") || continue

    # Boot the simulator
    xcrun simctl boot "$sim_udid" 2>/dev/null || true
    wait_for_boot "ios" || continue

    # Open the simulator UI
    open -a Simulator --args -CurrentDeviceUDID "$sim_udid" 2>/dev/null || true
    sleep 3

    for theme in "${themes[@]}"; do
      log "  Theme: $theme"

      # Set appearance
      if [[ "$theme" == "dark" ]]; then
        xcrun simctl ui "$sim_udid" appearance dark 2>/dev/null || true
      else
        xcrun simctl ui "$sim_udid" appearance light 2>/dev/null || true
      fi
      sleep 1

      if [[ "$MODE" == "auto" ]]; then
        # Run Maestro flows
        for screen in "${SCREENS[@]}"; do
          local flow_file="$MAESTRO_DIR/flows/${screen}.yaml"
          if [[ -f "$flow_file" ]]; then
            local out_path="$OUTPUT_DIR/apple/$label/$theme/${screen}.png"
            log "  Navigating to: $screen"
            maestro --device "$sim_udid" test "$flow_file" 2>/dev/null || {
              warn "  Maestro flow failed for $screen — capturing current screen"
            }
            sleep 1
            capture_ios_screenshot "$sim_udid" "$out_path"
          else
            warn "  No flow file for $screen — skipping"
          fi
        done
      else
        # Manual mode: prompt the user
        echo ""
        echo "  ┌─────────────────────────────────────────────────┐"
        echo "  │  MANUAL MODE — $label ($theme)                  │"
        echo "  │                                                 │"
        echo "  │  The simulator is booted. Navigate to each      │"
        echo "  │  screen and press ENTER to capture.             │"
        echo "  └─────────────────────────────────────────────────┘"
        echo ""

        for screen in "${SCREENS[@]}"; do
          read -rp "  Navigate to '$screen' then press ENTER to capture (or 's' to skip): " input
          if [[ "$input" == "s" || "$input" == "S" ]]; then
            warn "  Skipped $screen"
            continue
          fi
          local out_path="$OUTPUT_DIR/apple/$label/$theme/${screen}.png"
          capture_ios_screenshot "$sim_udid" "$out_path"
        done
      fi
    done

    # Shutdown simulator
    xcrun simctl shutdown "$sim_udid" 2>/dev/null || true
    log "  Simulator shut down"
    echo ""
  done
}

# ─── Android Screenshot Capture ─────────────────────────────────────────────

capture_android_screenshot() {
  local output_path="$1"
  local temp="/sdcard/screenshot_temp.png"

  adb shell screencap -p "$temp" 2>/dev/null
  adb pull "$temp" "$output_path" 2>/dev/null
  adb shell rm "$temp" 2>/dev/null

  if [[ -f "$output_path" ]]; then
    ok "  Saved: $(basename "$output_path")"
  else
    err "  Failed: $(basename "$output_path")"
  fi
}

run_android_screenshots() {
  log "═══════════════════════════════════════════"
  log " Android Screenshot Capture"
  log "═══════════════════════════════════════════"
  echo ""

  local themes=()
  if [[ "$THEME" == "both" ]]; then themes=("light" "dark"); else themes=("$THEME"); fi

  # Check available AVDs
  local avds
  avds=$(emulator -list-avds 2>/dev/null || true)

  if [[ -z "$avds" ]]; then
    warn "No Android Virtual Devices found."
    echo "  Create AVDs in Android Studio > Device Manager with these names:"
    for device_config in "${ANDROID_DEVICES[@]}"; do
      IFS=':' read -r label avd_name _ <<< "$device_config"
      echo "    - $avd_name ($label)"
    done
    return
  fi

  for device_config in "${ANDROID_DEVICES[@]}"; do
    IFS=':' read -r label avd_name resolution <<< "$device_config"
    IFS='x' read -r width height <<< "$resolution"
    log "──── $label ($avd_name) ────"

    # Check if AVD exists
    if ! echo "$avds" | grep -q "$avd_name"; then
      warn "AVD '$avd_name' not found. Available: $(echo "$avds" | tr '\n' ', ')"
      warn "Skipping $label"
      continue
    fi

    # Boot emulator
    log "  Starting emulator..."
    emulator -avd "$avd_name" -no-audio -no-boot-anim &
    local emu_pid=$!
    wait_for_boot "android" || { kill $emu_pid 2>/dev/null; continue; }
    sleep 5

    for theme in "${themes[@]}"; do
      log "  Theme: $theme"

      # Set dark/light mode via shell
      if [[ "$theme" == "dark" ]]; then
        adb shell "cmd uimode night yes" 2>/dev/null || true
      else
        adb shell "cmd uimode night no" 2>/dev/null || true
      fi
      sleep 2

      if [[ "$MODE" == "auto" ]]; then
        for screen in "${SCREENS[@]}"; do
          local flow_file="$MAESTRO_DIR/flows/${screen}.yaml"
          if [[ -f "$flow_file" ]]; then
            local out_path="$OUTPUT_DIR/google/$label/$theme/${screen}.png"
            log "  Navigating to: $screen"
            maestro test "$flow_file" 2>/dev/null || {
              warn "  Maestro flow failed for $screen — capturing current screen"
            }
            sleep 1
            capture_android_screenshot "$out_path"
          else
            warn "  No flow file for $screen — skipping"
          fi
        done
      else
        echo ""
        echo "  ┌─────────────────────────────────────────────────┐"
        echo "  │  MANUAL MODE — $label ($theme)                  │"
        echo "  │                                                 │"
        echo "  │  The emulator is booted. Navigate to each       │"
        echo "  │  screen and press ENTER to capture.             │"
        echo "  └─────────────────────────────────────────────────┘"
        echo ""

        for screen in "${SCREENS[@]}"; do
          read -rp "  Navigate to '$screen' then press ENTER to capture (or 's' to skip): " input
          if [[ "$input" == "s" || "$input" == "S" ]]; then
            warn "  Skipped $screen"
            continue
          fi
          local out_path="$OUTPUT_DIR/google/$label/$theme/${screen}.png"
          capture_android_screenshot "$out_path"
        done
      fi
    done

    # Kill emulator
    adb emu kill 2>/dev/null || kill $emu_pid 2>/dev/null || true
    sleep 3
    log "  Emulator shut down"
    echo ""
  done
}

# ─── Summary Report ──────────────────────────────────────────────────────────

print_summary() {
  echo ""
  log "═══════════════════════════════════════════"
  log " Screenshot Capture Complete"
  log "═══════════════════════════════════════════"
  echo ""

  local total=0
  local apple_count=0
  local google_count=0

  if [[ -d "$OUTPUT_DIR/apple" ]]; then
    apple_count=$(find "$OUTPUT_DIR/apple" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
    total=$((total + apple_count))
  fi
  if [[ -d "$OUTPUT_DIR/google" ]]; then
    google_count=$(find "$OUTPUT_DIR/google" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
    total=$((total + google_count))
  fi

  echo "  Total screenshots captured: $total"
  echo "    Apple App Store: $apple_count"
  echo "    Google Play Store: $google_count"
  echo ""
  echo "  Output: $OUTPUT_DIR/"
  echo ""

  # Tree view
  if command -v tree &>/dev/null; then
    tree "$OUTPUT_DIR" --dirsfirst -I "*.md" 2>/dev/null || true
  else
    find "$OUTPUT_DIR" -name "*.png" | sort | while read -r f; do
      echo "    ${f#$OUTPUT_DIR/}"
    done
  fi

  echo ""
  log "Next steps:"
  echo "  1. Review screenshots in $OUTPUT_DIR/"
  echo "  2. Add marketing text overlays if desired (Figma, Sketch, etc.)"
  echo "  3. Upload to App Store Connect: https://appstoreconnect.apple.com"
  echo "  4. Upload to Google Play Console: https://play.google.com/console"
  echo ""

  # Validation
  echo "  ─── Submission Checklist ───"
  echo ""

  if [[ $apple_count -gt 0 ]]; then
    local has_6_9=$(find "$OUTPUT_DIR/apple/iPhone-6.9in" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
    local has_6_5=$(find "$OUTPUT_DIR/apple/iPhone-6.5in" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
    [[ $has_6_9 -gt 0 ]] && ok "Apple: 6.9\" iPhone screenshots ($has_6_9)" || warn "Apple: Missing 6.9\" iPhone screenshots (REQUIRED)"
    [[ $has_6_5 -gt 0 ]] && ok "Apple: 6.5\" iPhone screenshots ($has_6_5)" || warn "Apple: Missing 6.5\" iPhone screenshots (REQUIRED)"
  fi

  if [[ $google_count -gt 0 ]]; then
    local has_phone=$(find "$OUTPUT_DIR/google/Phone-1080p" -name "*.png" 2>/dev/null | wc -l | tr -d ' ')
    [[ $has_phone -ge 2 ]] && ok "Google: Phone screenshots ($has_phone, min 2 required)" || warn "Google: Need at least 2 phone screenshots"
  fi
  echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "  ╔═══════════════════════════════════════════════════╗"
  echo "  ║                                                   ║"
  echo "  ║   EatPal — Store Screenshot Capture               ║"
  echo "  ║                                                   ║"
  echo "  ║   Platform: $(printf '%-10s' "$PLATFORM")  Mode: $(printf '%-12s' "$MODE")   ║"
  echo "  ║   Theme: $(printf '%-12s' "$THEME")                          ║"
  echo "  ║                                                   ║"
  echo "  ╚═══════════════════════════════════════════════════╝"
  echo ""

  preflight
  setup_output_dirs

  # Start the Expo dev server in background for Maestro
  if [[ "$MODE" == "auto" ]]; then
    log "Ensure the EatPal app is installed on simulators/emulators."
    log "For development builds: npx eas build --profile development --platform all"
    echo ""
  fi

  if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
    if [[ "$HAS_IOS" == "true" ]]; then
      run_ios_screenshots
    fi
  fi

  if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
    if [[ "$HAS_ANDROID" == "true" ]]; then
      run_android_screenshots
    fi
  fi

  print_summary
}

main "$@"

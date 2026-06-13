#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop
# Usage: ./ralph.sh [--tool amp|claude] [max_iterations]
#
# Multi-agent host safety (we share one Windows box with another Ralph):
#   RULE 1 (never leak): each iteration is wrapped in `timeout`, and stray build
#     processes for THIS repo are swept between iterations. A node/deno count
#     self-check warns if we're leaking.
#   RULE 2 (take turns building): the AGENT runs its builds through
#     scripts/build-lock.mjs (see scripts/ralph/CLAUDE.md) so only one build
#     runs on the host at a time.
#   RULE 3 (stay in your lane): affinity + heap cap + priority are set by the
#     launcher, scripts/ralph/run-ralph.cmd — not here.
#   RULE 4 (good roommate): the sweep only ever kills OUR repo's stray procs.

set -e

# Parse arguments
TOOL="amp"  # Default to amp for backwards compatibility
MAX_ITERATIONS=10
ITER_TIMEOUT="${RALPH_ITER_TIMEOUT:-2400}"   # seconds; a hung iteration is killed (exit 124)

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    *)
      # Assume it's max_iterations if it's a number
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

# Validate tool choice
if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT_WIN="$(cygpath -w "$REPO_ROOT" 2>/dev/null || echo "$REPO_ROOT")"

# Resolve the Claude CLI. Under WSL/Git-Bash a Windows-installed claude may not
# be on PATH as a bare `claude`. Override with CLAUDE_BIN=... if needed.
if [ -z "$CLAUDE_BIN" ]; then
  if command -v claude >/dev/null 2>&1; then
    CLAUDE_BIN="claude"
  else
    for c in \
      "/mnt/c/Users/$(whoami)/.local/bin/claude.exe" \
      "/c/Users/$(whoami)/.local/bin/claude.exe" \
      "/c/Users/pears/.local/bin/claude.exe"; do
      if [ -x "$c" ]; then CLAUDE_BIN="$c"; break; fi
    done
  fi
fi
if [ "$TOOL" == "claude" ] && [ -z "$CLAUDE_BIN" ]; then
  echo "Error: could not find the Claude CLI. Set CLAUDE_BIN to its path." >&2
  exit 1
fi

# The agent (claude/amp) runs from the repo ROOT, so the live PRD + progress log
# are the root-level files — NOT $SCRIPT_DIR/prd.json (which never existed).
PRD_FILE="$REPO_ROOT/prd.json"
PROGRESS_FILE="$REPO_ROOT/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

# RULE 1 + 4: kill only THIS repo's stray build processes (vite/tsc/vitest/...).
# Never kills bare node, never touches the shared claude-flow daemon.
sweep_strays() {
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR/sweep.ps1" -RepoRoot "$REPO_ROOT_WIN" 2>/dev/null || true
  fi
}

# RULE 1 self-check: warn (don't kill) if node/deno process count looks like a leak.
leak_self_check() {
  if command -v powershell >/dev/null 2>&1; then
    local n
    n=$(powershell -NoProfile -Command "@(Get-Process node,deno -ErrorAction SilentlyContinue).Count" 2>/dev/null | tr -d '\r' || echo 0)
    if [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -gt 50 ]; then
      echo "WARNING (RULE 1): $n node/deno processes alive — possible leak. Sweeping and continuing; investigate if it keeps climbing."
      sweep_strays
    fi
  fi
}

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS - Per-iteration timeout: ${ITER_TIMEOUT}s"
ITER_LOG="$(mktemp 2>/dev/null || echo "$SCRIPT_DIR/.iter.log")"
trap 'sweep_strays; rm -f "$ITER_LOG"' EXIT

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  # RULE 1: wrap the agent in `timeout` so a hang is killed, not left to stall.
  RC=0
  set +e
  if [[ "$TOOL" == "amp" ]]; then
    timeout "${ITER_TIMEOUT}" bash -c 'amp --dangerously-allow-all < "$0"' "$SCRIPT_DIR/prompt.md" > "$ITER_LOG" 2>&1
    RC=$?
  else
    timeout "${ITER_TIMEOUT}" "$CLAUDE_BIN" --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md" > "$ITER_LOG" 2>&1
    RC=$?
  fi
  set -e
  cat "$ITER_LOG"

  if [ "$RC" -eq 124 ]; then
    echo ""
    echo "HANG (RULE 1): iteration $i exceeded ${ITER_TIMEOUT}s and was killed (exit 124). Sweeping stray procs."
    sweep_strays
  fi

  # Completion signal
  if grep -q "<promise>COMPLETE</promise>" "$ITER_LOG"; then
    echo ""
    echo "Ralph completed all tasks! (iteration $i of $MAX_ITERATIONS)"
    sweep_strays
    exit 0
  fi

  # RULE 1 + 4: clean up our own leftovers before the next iteration.
  sweep_strays
  leak_self_check

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1

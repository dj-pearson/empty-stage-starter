#!/usr/bin/env bash
# Mirrors https://github.com/mattpocock/skills into every .claude/skills
# directory found under a search root (default: C:/Users/dpearson/Documents).
#
# Usage:
#   scripts/sync-mattpocock-skills.sh [--dry-run] [--refresh] [--here]
#                                     [--search-root <dir>]
#
# Flags:
#   --dry-run        Show what would be copied, make no changes.
#   --refresh        git pull the cached source before syncing.
#   --here           Only sync to this repo's .claude/skills (skip scan).
#   --search-root    Override scan root (default: C:/Users/dpearson/Documents).
#
# Source is cached at: ~/.cache/claude-skills-mattpocock
# Existing non-mattpocock skills in each target are left untouched.
# Skill folders with matching names are overwritten (treated as the source of truth).

set -euo pipefail

SOURCE_REPO="https://github.com/mattpocock/skills.git"
CACHE_DIR="${HOME}/.cache/claude-skills-mattpocock"
SEARCH_ROOT="C:/Users/dpearson/Documents"
DRY_RUN=0
REFRESH=0
HERE_ONLY=0
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --refresh) REFRESH=1 ;;
    --here) HERE_ONLY=1 ;;
    --search-root) SEARCH_ROOT="$2"; shift ;;
    -h|--help) sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# 1. Ensure source cache is present (and up to date if --refresh).
if [[ ! -d "$CACHE_DIR/.git" ]]; then
  echo "Cloning mattpocock/skills -> $CACHE_DIR"
  mkdir -p "$(dirname "$CACHE_DIR")"
  git clone --depth 1 "$SOURCE_REPO" "$CACHE_DIR"
elif [[ $REFRESH -eq 1 ]]; then
  echo "Refreshing $CACHE_DIR"
  git -C "$CACHE_DIR" pull --ff-only
fi

# 2. Collect skill folders from the source (each top-level dir with a SKILL.md).
mapfile -t SKILL_DIRS < <(
  find "$CACHE_DIR" -mindepth 2 -maxdepth 2 -name SKILL.md -printf '%h\n' | sort
)
if [[ ${#SKILL_DIRS[@]} -eq 0 ]]; then
  echo "No skills found in $CACHE_DIR" >&2
  exit 1
fi
echo "Source skills: ${#SKILL_DIRS[@]}"

# 3. Collect targets.
if [[ $HERE_ONLY -eq 1 ]]; then
  TARGETS=("$REPO_ROOT/.claude/skills")
  mkdir -p "${TARGETS[0]}"
else
  mapfile -t TARGETS < <(
    find "$SEARCH_ROOT" -maxdepth 6 -type d -path '*/.claude/skills' 2>/dev/null | sort
  )
fi

if [[ ${#TARGETS[@]} -eq 0 ]]; then
  echo "No .claude/skills dirs found under $SEARCH_ROOT" >&2
  exit 1
fi

echo "Targets: ${#TARGETS[@]}"
for t in "${TARGETS[@]}"; do echo "  - $t"; done
echo

# 4. Copy.
[[ $DRY_RUN -eq 1 ]] && echo "(dry-run — no changes will be made)"
echo

for target in "${TARGETS[@]}"; do
  for skill in "${SKILL_DIRS[@]}"; do
    name="$(basename "$skill")"
    dest="$target/$name"
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "would sync: $name -> $target/"
    else
      rm -rf "$dest"
      cp -R "$skill" "$dest"
      echo "synced: $name -> $target/"
    fi
  done
done

echo
echo "Done. Synced ${#SKILL_DIRS[@]} skills to ${#TARGETS[@]} target(s)."

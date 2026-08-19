#!/bin/bash
#
# Purge leaked values from git history (US-556).
#
# WARNING, read before running:
#   * Rotation is the PRIMARY fix. Scrubbing history does NOT make an exposed
#     credential safe again -- anyone who cloned before the purge still has it.
#     Rotate in Supabase and Coolify FIRST.
#   * This uses `git filter-branch`, which is deprecated. Prefer git-filter-repo
#     or BFG if you have them.
#   * It rewrites every ref and the caller then force-pushes, which breaks every
#     existing clone. Coordinate with the team and run it from a fresh clone,
#     never mid-feature-work.
#
# The values are NOT hardcoded here. This script previously contained the leaked
# database password in plaintext, which made the purge tool itself a tracked
# copy of the secret it was meant to remove. Pass them in instead:
#
#   LEAK_SERVER_IP=203.0.113.10 LEAK_DB_PASSWORD='...' ./rewrite-history.sh
#
set -uo pipefail
export FILTER_BRANCH_SQUELCH_WARNING=1

: "${LEAK_SERVER_IP:?set LEAK_SERVER_IP to the IP to scrub}"
: "${LEAK_DB_PASSWORD:?set LEAK_DB_PASSWORD to the credential to scrub}"

echo "Rewriting git history to remove the supplied values ..."
echo "This rewrites ALL refs. Ctrl-C now if that is not what you want."

# Every text file, not just .md/.ps1/.sh/.txt. The old extension list missed
# supabase/config.toml, which carries the server IP, so the purge would have
# left it behind and looked like it had succeeded.
git filter-branch --force --tree-filter '
  find . -type f -not -path "./.git/*" -print0 |
    while IFS= read -r -d "" file; do
      case "$(file -b --mime-type "$file" 2>/dev/null)" in
        text/*|application/json|application/xml|inode/x-empty)
          sed -i "s|${LEAK_SERVER_IP//./\\.}|<your-server-ip>|g" "$file" 2>/dev/null || true
          sed -i "s|${LEAK_DB_PASSWORD}|<your-db-password>|g" "$file" 2>/dev/null || true
          ;;
      esac
    done
' --prune-empty --tag-name-filter cat -- --all

echo "History rewrite complete."
echo
echo "Next, and only after coordinating with everyone who has a clone:"
echo "  git push --force --all && git push --force --tags"

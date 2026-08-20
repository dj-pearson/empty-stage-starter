#!/usr/bin/env bash
#
# Purge leaked values from git history, and verify the purge (US-556).
#
# WARNING, read before running:
#   * Rotation is the PRIMARY fix. Scrubbing history does NOT make an exposed
#     credential safe again -- anyone who cloned before the purge still has it,
#     and so does every fork, CI cache and backup. Rotate in Supabase and
#     Coolify FIRST. This script only stops the value spreading further.
#   * It rewrites every ref and the caller then force-pushes, which breaks every
#     existing clone. Coordinate with the team and run it from a fresh clone,
#     never mid-feature-work.
#   * `git filter-branch` is deprecated. If you have git-filter-repo, prefer
#     `git filter-repo --replace-text` -- it is faster and handles more cases.
#     This exists because filter-branch ships with git and filter-repo does not.
#
# The values are NOT hardcoded here. This script previously contained the leaked
# database password in plaintext, which made the purge tool itself a tracked
# copy of the secret it was meant to remove. Pass them in instead:
#
#   LEAK_SERVER_IP=203.0.113.10 LEAK_DB_PASSWORD='...' ./rewrite-history.sh
#
# Check first, without changing anything:
#
#   LEAK_SERVER_IP=... LEAK_DB_PASSWORD='...' ./rewrite-history.sh --verify
#
set -uo pipefail
export FILTER_BRANCH_SQUELCH_WARNING=1

: "${LEAK_SERVER_IP:?set LEAK_SERVER_IP to the IP to scrub}"
: "${LEAK_DB_PASSWORD:?set LEAK_DB_PASSWORD to the credential to scrub}"

git rev-parse --git-dir >/dev/null 2>&1 || { echo "Not a git repository." >&2; exit 1; }

# Count every blob in every ref that still contains either value. This is the
# only honest answer to "did it work", and it is why the script has a --verify
# mode: run it before and after and compare.
verify() {
  # Every blob this clone can still reach, from three directions, deduplicated:
  #   * everything reachable from a ref
  #   * everything reachable only through the reflog -- a commit that was reset
  #     away is still one `git reflog` from being restored, and appears in
  #     neither `rev-list --all` nor `fsck --unreachable` (which treats reflog
  #     entries as roots). Missing this reported "clean" on a repository that
  #     still had the value.
  #   * everything left dangling after that
  local found
  found=$(
    {
      git rev-list --objects --all --reflog 2>/dev/null | awk 'NF>1{print $1}'
      git fsck --unreachable --no-reflogs --no-progress 2>/dev/null | awk '$2=="blob"{print $3}'
    } | sort -u | while read -r obj; do
      git cat-file blob "$obj" 2>/dev/null |
        LC_ALL=C grep -qaF -e "$LEAK_SERVER_IP" -e "$LEAK_DB_PASSWORD" && echo "$obj"
    done | wc -l | tr -d ' '
  )

  echo "  blobs still containing a leaked value: $found"
  [ "$found" -eq 0 ]
}

if [ "${1:-}" = "--verify" ]; then
  echo "Checking this repository for the supplied values ..."
  if verify; then
    echo "Clean."
    exit 0
  fi
  echo "Values are still present."
  exit 1
fi

echo "Before:"
verify || true
echo
echo "Rewriting git history to remove the supplied values ..."
echo "This rewrites ALL refs. Ctrl-C now if that is not what you want."

# The per-commit work lives in its own file, run explicitly with bash.
# --tree-filter evaluates its argument with /bin/sh, which on Debian and Ubuntu
# is dash: the previous version used `read -d ''` and `${var//./\.}` inline, so
# every commit failed with "read: Illegal option -d" while filter-branch still
# reported "Ref was rewritten" and the script still printed success. A purge
# that quietly does nothing is worse than no purge at all, because it ends the
# investigation.
SCRUB=$(mktemp) || exit 1
trap 'rm -f "$SCRUB"' EXIT

cat > "$SCRUB" <<'SCRUB_EOF'
#!/usr/bin/env bash
set -uo pipefail
# perl, not sed: the password may contain |, &, \ or a regex metacharacter, any
# of which turns a sed s||| into either a syntax error or a wrong match. \Q..\E
# makes the pattern literal, and the values arrive through the environment so
# they are never interpolated into the program text.
find . -type f -not -path "./.git/*" -print0 |
  while IFS= read -r -d '' file; do
    case "$(file -b --mime-type "$file" 2>/dev/null)" in
      text/*|application/json|application/xml|application/javascript|inode/x-empty)
        perl -i -0777 -pe '
          BEGIN { $ip = $ENV{LEAK_SERVER_IP}; $pw = $ENV{LEAK_DB_PASSWORD}; }
          s/\Q$ip\E/<your-server-ip>/g;
          s/\Q$pw\E/<your-db-password>/g;
        ' "$file" 2>/dev/null || true
        ;;
    esac
  done
SCRUB_EOF

git filter-branch --force --tree-filter "bash '$SCRUB'" \
  --prune-empty --tag-name-filter cat -- --all || {
    echo "filter-branch failed. Nothing was pushed; your refs/original backup is intact." >&2
    exit 1
  }

# filter-branch keeps the pre-rewrite refs under refs/original, and the old
# objects stay reachable through them and through the reflog. Until both are
# gone the value is still in this clone, which is exactly what the verify step
# below would otherwise report as a mystery.
git for-each-ref --format='%(refname)' refs/original |
  while read -r ref; do git update-ref -d "$ref"; done
git reflog expire --expire=now --all
git gc --prune=now --quiet

echo
echo "After:"
if verify; then
  echo "History rewrite complete and verified clean in this clone."
else
  echo "STILL PRESENT after the rewrite. Do not push. Investigate before going further." >&2
  exit 1
fi

echo
echo "Next, and only after coordinating with everyone who has a clone:"
echo "  git push --force --all && git push --force --tags"
echo
echo "Then have every other clone re-clone. A stale clone can push the old"
echo "objects back, which silently undoes all of this."

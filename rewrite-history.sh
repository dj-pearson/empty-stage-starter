#!/bin/bash

# Rewrite git history to remove sensitive data
export FILTER_BRANCH_SQUELCH_WARNING=1

echo "Rewriting git history to remove sensitive credentials..."

git filter-branch --force --tree-filter '
  for file in $(find . -type f \( -name "*.md" -o -name "*.ps1" -o -name "*.sh" -o -name "*.txt" \) 2>/dev/null); do
    if [ -f "$file" ]; then
      sed -i "s/209\\.145\\.59\\.219/<your-server-ip>/g" "$file" 2>/dev/null || true
      sed -i "s/KMAGhTR3gsHnBMWMMkeczGYak8RqHI9V/<your-db-password>/g" "$file" 2>/dev/null || true
    fi
  done
' --prune-empty --tag-name-filter cat -- --all

echo "History rewrite complete!"
echo "Now force pushing to remote..."


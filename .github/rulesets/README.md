# Repository rulesets

These JSON files mirror the branch-protection rulesets active on
`github.com/dj-pearson/empty-stage-starter`. They're committed so the
configuration is reviewable and reproducible.

## What's protected

| File                      | Target          | PR required | Force-push | Deletion | Notes |
| ------------------------- | --------------- | :---------: | :--------: | :------: | ----- |
| `main.json`               | `main` (default) | yes        | blocked    | blocked  | App Store production track |
| `develop.json`            | `develop`        | yes        | blocked    | blocked  | TestFlight internal track |
| `release-branches.json`   | `release/**`     | yes        | blocked    | blocked  | Frozen release candidates |
| `hotfix-branches.json`    | `hotfix/**`      | no         | blocked    | blocked  | Direct commits allowed for fast iteration; gate is on the merge into `main` |

Repository admins can bypass all rules (`bypass_mode: always`) for
emergencies. No required approval count is set because this is a solo-dev
repo today — bump `required_approving_review_count` to `1` once there's a
second reviewer.

## Applying

To re-apply after edits (replaces the matching ruleset by name):

```bash
REPO=dj-pearson/empty-stage-starter
for f in .github/rulesets/*.json; do
  name=$(jq -r .name "$f")
  id=$(gh api "/repos/$REPO/rulesets" --jq ".[] | select(.name==\"$name\") | .id")
  if [ -n "$id" ]; then
    gh api -X PUT "/repos/$REPO/rulesets/$id" --input "$f"
  else
    gh api -X POST "/repos/$REPO/rulesets" --input "$f"
  fi
done
```

## Adding required status checks later

Once a PR has run and produced check names (e.g. `quality`, `test`,
`Lint & Typecheck`), add a `required_status_checks` rule to `main.json`
and `develop.json`:

```json
{
  "type": "required_status_checks",
  "parameters": {
    "strict_required_status_checks_policy": true,
    "required_status_checks": [
      { "context": "quality", "integration_id": 15368 },
      { "context": "test",    "integration_id": 15368 }
    ]
  }
}
```

`integration_id: 15368` is GitHub Actions. Confirm context names match
the job names in `.github/workflows/ci.yml` exactly.

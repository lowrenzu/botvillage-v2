# CI smoke blocker

`scripts/smoke.sh` is GET-only and ready.
Desired workflow (with smoke job): `docs/ci-smoke-workflow.yml`.

**2026-10-02 (PT):** OAuth token scopes are `gist, read:org, repo` — **no `workflow`**.
GitHub rejects pushes that add/change `.github/workflows/*` without `workflow` scope.

Until a PAT/`gh auth refresh -s workflow` is available:
- keep mirror `docs/ci-smoke-workflow.yml`
- run locally: `bash scripts/smoke.sh http://127.0.0.1:8040`
- tracked `.github/workflows/ci.yml` stays go-test + web-build only (no smoke step) so pushes succeed

When `workflow` scope exists: copy `docs/ci-smoke-workflow.yml` → `.github/workflows/ci.yml` and push.

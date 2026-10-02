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

**2026-10-03 01:29 PT:** retried copying this mirror onto `.github/workflows/ci.yml` and pushing `main`. GitHub rejected it: refusing to allow an OAuth App to create or update workflow `.github/workflows/ci.yml` without `workflow` scope. Scopes still `gist`, `read:org`, `repo`. The workflow commit was not pushed; tracked `ci.yml` is unchanged. This mirror stays.

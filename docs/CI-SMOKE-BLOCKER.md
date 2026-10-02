# CI smoke blocker

`scripts/smoke.sh` is GET-only and ready.
Wiring into `.github/workflows/ci.yml` needs a push with GitHub OAuth `workflow` scope.
Until then, keep this mirror: `docs/ci-smoke-workflow.yml` and merge manually or push with a PAT that has `workflow`.

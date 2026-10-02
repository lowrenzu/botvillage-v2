#!/usr/bin/env bash
# Loopback smoke — GET only (no POST /api/prompt; that wakes agents).
set -euo pipefail
BASE="${1:-http://127.0.0.1:8040}"

fail() { echo "smoke FAIL: $*" >&2; exit 1; }

health="$(curl -fsS --max-time 5 "$BASE/api/health")" || fail "GET /api/health"
echo "$health" | grep -q '"ok"[[:space:]]*:[[:space:]]*true' || fail "health.ok != true ($health)"
echo "$health" | grep -q '"webhook"' || fail "health missing webhook ($health)"

bots="$(curl -fsS --max-time 5 "$BASE/api/bots")" || fail "GET /api/bots"
echo "$bots" | grep -q '^\[' || echo "$bots" | grep -q '"bots"' || fail "/api/bots not array-ish ($bots)"

if curl -fsS --max-time 5 "$BASE/api/skills" >/tmp/bv-smoke-skills.json 2>/dev/null; then
  : # optional ok
else
  echo "smoke WARN: /api/skills skipped or failed" >&2
fi

echo "smoke OK · $BASE"

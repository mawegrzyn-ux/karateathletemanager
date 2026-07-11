#!/usr/bin/env bash
# Fast, read-only smoke test against a running deployment. No auth, no
# side effects — safe to run against production right after a deploy.
#
# Usage: scripts/smoke-test.sh [base-url]
#   base-url defaults to https://nadakarate.com

set -euo pipefail

BASE_URL="${1:-${SMOKE_BASE_URL:-https://nadakarate.com}}"
FAILED=0

check() {
  local description="$1"
  local url="$2"
  # Pipe-separated list of acceptable HTTP status codes, e.g. "200" or "401|404"
  local expected_statuses="$3"
  local grep_pattern="${4:-}"

  local response
  response="$(curl -sS -o /tmp/smoke-body -w '%{http_code}' "$url" || echo "000")"

  if ! [[ "$response" =~ ^($expected_statuses)$ ]]; then
    echo "FAIL: $description — expected HTTP $expected_statuses, got $response ($url)"
    FAILED=1
    return
  fi

  if [[ -n "$grep_pattern" ]] && ! grep -q "$grep_pattern" /tmp/smoke-body; then
    echo "FAIL: $description — response body missing expected content ($grep_pattern)"
    FAILED=1
    return
  fi

  echo "OK: $description"
}

echo "Smoke testing $BASE_URL"
echo

check "API health check" "$BASE_URL/api/health" 200 '"status":"ok"'
check "Frontend root serves the SPA" "$BASE_URL/" 200 '<div id="root"'
check "Login route serves the SPA (client-side routed)" "$BASE_URL/login" 200 '<div id="root"'

# Regression check: a bogus /api/uploads/files/*.png path must reach
# Express, not get swallowed by nginx's "cache static assets" regex
# location (see docs/ARCHITECTURE.md — the /api/ location needs its ^~
# modifier or uploaded images silently 404 via nginx instead of the app).
# The route's authorize() middleware runs before the file lookup, so an
# unauthenticated request gets 401 rather than 404 — either is fine, what
# matters is a JSON error body reached us instead of nginx's bare response.
check "Uploads path is proxied to the API, not caught by the static-asset cache rule" \
  "$BASE_URL/api/uploads/files/__smoke-test-missing__.png" "401|404" '"error"'

check "PWA manifest is served" "$BASE_URL/manifest.webmanifest" 200 '"name":"Nada Karate"'
check "Service worker is served" "$BASE_URL/sw.js" 200

rm -f /tmp/smoke-body

echo
if [[ "$FAILED" -ne 0 ]]; then
  echo "Smoke test FAILED"
  exit 1
fi

echo "Smoke test passed"

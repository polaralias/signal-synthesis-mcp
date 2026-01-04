#!/bin/bash
set -e

BASE_URL="http://localhost:3012"

echo "Running OAuth Smoke Tests against $BASE_URL..."

# 1. Check Metadata
echo -n "TEST: Metadata Check... "
META=$(curl -s "$BASE_URL/.well-known/oauth-authorization-server")
if [[ $(echo "$META" | jq -r '.issuer') != http* ]]; then echo "FAIL: Issuer not absolute"; exit 1; fi
echo "PASS"

# 2. Register Allowed
echo -n "TEST: DCR Register Allowed... "
RESP=$(curl -s -X POST "$BASE_URL/register" \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris": ["http://localhost:3000/callback"], "client_name": "Test"}')

if [[ $(echo "$RESP" | jq -r '.client_id') == "null" ]]; then echo "FAIL: No client_id"; exit 1; fi
echo "PASS"

# 3. Register Disallowed
echo -n "TEST: DCR Register Disallowed... "
RESP=$(curl -s -X POST "$BASE_URL/register" \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris": ["http://evil.com/callback"], "client_name": "Evil"}')

ERR_CODE=$(echo "$RESP" | jq -r '.error')
ERR_DESC=$(echo "$RESP" | jq -r '.error_description')

if [[ "$ERR_CODE" != "invalid_redirect_uri" ]]; then 
  echo "FAIL: Wrong error code $ERR_CODE"
  exit 1
fi

REQUIRED_MSG="This client isn't in the redirect allow list - raise an issue on GitHub for it to be added"
if [[ "$ERR_DESC" != "$REQUIRED_MSG" ]]; then
  echo "FAIL: Wrong error message"
  echo "Got: $ERR_DESC"
  exit 1
fi
echo "PASS"

echo ""
echo "All OAuth Smoke Tests Passed!"

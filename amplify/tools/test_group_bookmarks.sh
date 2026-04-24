#!/bin/bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENDPOINT=$(node -e "const o=require('$ROOT/amplify_outputs.sandbox.json');console.log(o.custom.API.bookmarks.endpoint)" 2>/dev/null \
  || node -e "const o=require('$ROOT/amplify_outputs.json');console.log(o.custom.API.bookmarks.endpoint)")
URL="${ENDPOINT}/groupBookmarks"
BODY='{"items":[{"id":"1","url":"https://example.com","title":"Test"}],"purposes":["personal"]}'

for i in $(seq 1 12); do
  curl -s -o /dev/null -w "Call $i: %{http_code}\n" -X POST "$URL" -H "Content-Type: application/json" -d "$BODY"
done

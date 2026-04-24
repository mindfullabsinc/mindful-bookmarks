#!/bin/bash
URL="https://eidotpc2fc.execute-api.us-west-1.amazonaws.com/groupBookmarks"
BODY='{"items":[{"id":"1","url":"https://example.com","title":"Test"}],"purposes":["personal"]}'

for i in $(seq 1 12); do
  curl -s -o /dev/null -w "Call $i: %{http_code}\n" -X POST "$URL" -H "Content-Type: application/json" -d "$BODY"
done

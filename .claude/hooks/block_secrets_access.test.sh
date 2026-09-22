#!/usr/bin/env bash
# Self-check for block_secrets_access.sh. Run by hand, or from CI.
set -uo pipefail
HOOK="$(cd "$(dirname "$0")" && pwd)/block_secrets_access.sh"
fails=0

verdict() {
    printf '{"tool_name":"Read","tool_input":{"file_path":%s}}' \
        "$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    | "$HOOK" | grep -q '"permissionDecision":"deny"' && echo deny || echo allow
}

expect() {
    want="$1"; path="$2"
    got="$(verdict "$path")"
    if [ "$got" = "$want" ]; then
        printf '  ok    %-6s %s\n' "$got" "$path"
    else
        printf '  FAIL  want=%s got=%s  %s\n' "$want" "$got" "$path"
        fails=$((fails + 1))
    fi
}

echo "blocked — secret-shaped files:"
expect deny '.env'
expect deny '.env.local'
expect deny 'apps/api/.env'
expect deny 'secrets.pem'
expect deny 'apps/api/tls/server.key'
expect deny 'id_rsa'
expect deny 'id_rsa.pub'
expect deny 'config/credentials.json'

echo "allowed — templates, and everything else:"
expect allow '.env.example'
expect allow '.env.sample'
expect allow 'apps/api/.env.template'
expect allow 'apps/api/src/main/resources/application.properties'
expect allow 'apps/web/src/app/app.routes.ts'
expect allow 'README.md'

echo
if [ "$fails" -eq 0 ]; then
    echo "block_secrets_access: all cases pass"
else
    echo "block_secrets_access: $fails case(s) failed" >&2
fi
exit "$fails"

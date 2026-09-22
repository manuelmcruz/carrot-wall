#!/usr/bin/env bash
# Self-check for block_destructive_bash.sh. Run by hand, or from CI.
set -uo pipefail
HOOK="$(cd "$(dirname "$0")" && pwd)/block_destructive_bash.sh"
fails=0

verdict() {
    printf '{"tool_name":"Bash","tool_input":{"command":%s}}' \
        "$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    | "$HOOK" | grep -q '"permissionDecision":"deny"' && echo deny || echo allow
}

expect() {
    want="$1"; cmd="$2"
    got="$(verdict "$cmd")"
    if [ "$got" = "$want" ]; then
        printf '  ok    %-6s %s\n' "$got" "$cmd"
    else
        printf '  FAIL  want=%s got=%s  %s\n' "$want" "$got" "$cmd"
        fails=$((fails + 1))
    fi
}

echo "blocked — destructive deletes and force-pushes:"
expect deny 'rm -rf /'
expect deny 'rm -rf node_modules'
expect deny 'sudo rm -rf /var/lib'
expect deny 'rm -fr build'
expect deny 'rm --recursive --force dist'
expect deny 'echo cleaning && rm -rf tmp'
expect deny 'git push --force'
expect deny 'git push --force-with-lease origin main'

echo "allowed — everyday commands:"
expect allow 'rm file.txt'
expect allow 'rm -r ./tmp'
expect allow 'rm -f stale.lock'
expect allow 'git push'
expect allow 'git push origin main'
expect allow 'ls -la'
expect allow './mvnw test'

echo
if [ "$fails" -eq 0 ]; then
    echo "block_destructive_bash: all cases pass"
else
    echo "block_destructive_bash: $fails case(s) failed" >&2
fi
exit "$fails"

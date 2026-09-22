#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) — denies rm -rf and force-pushes.
#
# Stdin is JSON from Claude Code: {"tool_name":"Bash","tool_input":{"command":"..."}}.
# Emits a PreToolUse permission decision, which outranks every permission mode
# including bypassPermissions. Exit 0 either way; the JSON is the verdict.

set -uo pipefail

command_line="$(python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("command", ""))
except Exception:
    pass' <<< "$(cat)")"

[ -n "$command_line" ] || exit 0

deny() {
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$1"
    exit 0
}

if printf '%s' "$command_line" | grep -Eq 'rm +(-[a-zA-Z]*(r[a-zA-Z]*f|f[a-zA-Z]*r)[a-zA-Z]*|--recursive +--force|--force +--recursive)\b'; then
    deny "rm -rf blocked by hook. If you really mean to delete this, name the exact path and ask the user to run it themselves."
fi

if printf '%s' "$command_line" | grep -Eq 'git +push +.*--force(-with-lease)?\b'; then
    deny "git push --force blocked by hook. Force-pushing can overwrite someone else's work; ask the user to run it themselves if it is really needed."
fi

exit 0

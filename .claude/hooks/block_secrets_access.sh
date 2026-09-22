#!/usr/bin/env bash
# PreToolUse hook (matcher: Read|Edit|Write) — denies touching secret-shaped
# files, so the agent can't read a key into context or overwrite one blind.
#
# Stdin is JSON: {"tool_name":"Read","tool_input":{"file_path":"..."}} (Edit/Write
# use the same field). Exit 0 either way; the JSON is the verdict.

set -uo pipefail

file_path="$(python3 -c 'import json,sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("file_path", ""))
except Exception:
    pass' <<< "$(cat)")"

[ -n "$file_path" ] || exit 0

# Template/example files are meant to be read and committed — carve them out
# before testing the secret-shaped patterns below.
if printf '%s' "$file_path" | grep -Eq '\.(env|pem|key)\.(example|sample|template)$'; then
    exit 0
fi

if printf '%s' "$file_path" | grep -Eq '(^|/)\.env(\..+)?$|\.pem$|\.key$|(^|/)id_rsa(\.pub)?$|(^|/)credentials\.json$'; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' \
        "Access to $file_path blocked by hook: it looks like a secret. Ask the user to share the specific value you need instead of reading the file."
    exit 0
fi

exit 0

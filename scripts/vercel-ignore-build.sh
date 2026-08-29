#!/usr/bin/env bash
set -u
echo "VERCEL_GIT_COMMIT_REF: ${VERCEL_GIT_COMMIT_REF:-}"
if [[ "${VERCEL_GIT_COMMIT_MESSAGE:-}" =~ \[skip\ ci\] ]] || [[ "${VERCEL_GIT_COMMIT_MESSAGE:-}" =~ \[data\ only\] ]]; then exit 0; fi
CHANGED_FILES="$(git diff HEAD^ HEAD --name-only 2>/dev/null || true)"
NON_DATA_CHANGES="$(printf '%s\n' "$CHANGED_FILES" | grep -v '^data/' | grep -v '\.md$' | grep -v '^docs/' || true)"
if [[ -z "$NON_DATA_CHANGES" ]]; then exit 0; fi
exit 1

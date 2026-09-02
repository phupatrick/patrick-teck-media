#!/usr/bin/env bash
set -u
echo "VERCEL_GIT_COMMIT_REF: ${VERCEL_GIT_COMMIT_REF:-}"
if [[ "${VERCEL_GIT_COMMIT_MESSAGE:-}" =~ \[skip\ ci\] ]] || [[ "${VERCEL_GIT_COMMIT_MESSAGE:-}" =~ \[data\ only\] ]]; then exit 0; fi
CHANGED_FILES="$(git diff HEAD^ HEAD --name-only 2>/dev/null || true)"

# newsroom-content.json is bundled into the SSR function. Skipping every
# data-only commit leaves production serving an old newsroom snapshot.
DEPLOY_RELEVANT_CHANGES="$(printf '%s\n' "$CHANGED_FILES" \
  | grep -v '^data/openclaw-(pending-clusters|manager-state|learning-state|web-state|owner-brief)\.json$' \
  | grep -v '^data/platform-state\.json$' \
  | grep -v '^data/social-learned-context\.json$' \
  | grep -v '^data/social-posts\.json$' \
  | grep -v '^data/newsroom-feed-http-cache\.json$' \
  | grep -v '\.md$' \
  | grep -v '^docs/' || true)"
if [[ -z "$DEPLOY_RELEVANT_CHANGES" ]]; then exit 0; fi
exit 1

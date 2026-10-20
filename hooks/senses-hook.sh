#!/bin/sh
# Records one Claude Code hook event as sense metadata (PRD-FEAT-007.1).
# Never blocks or fails the session: a missing Deno or any error exits 0.
command -v deno >/dev/null 2>&1 || exit 0
DATA="${NETSI_SENSES_DIR:-${CLAUDE_PROJECT_DIR:-$PWD}/.netsi-agent-senses}"
exec deno run -q --no-lock \
  --allow-env=CLAUDE_PROJECT_DIR,NETSI_SENSES_DIR \
  --allow-read="$DATA,${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects" \
  --allow-write="$DATA" \
  "${CLAUDE_PLUGIN_ROOT:-$(dirname "$0")/..}/src/adapters/claude-code/hook.ts"

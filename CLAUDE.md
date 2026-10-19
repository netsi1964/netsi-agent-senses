@AGENTS.md
@memory.md

## Claude Code specifics

- Plugin manifest: `.claude-plugin/plugin.json`. Hooks live in `hooks/hooks.json` and reference scripts via `${CLAUDE_PLUGIN_ROOT}`.
- Hook payloads and transcript formats change between versions. Check current Claude Code docs (context7) before writing or changing the adapter.
- Use plan mode before touching PRD-FEAT-008 (intervention model) or PRD-FEAT-009 (self-adjustment limits). These are the most sensitive parts of the design.
- Start work on a feature by reading its section in `development/PRD.md`, then its acceptance criteria. Finish by checking each criterion.

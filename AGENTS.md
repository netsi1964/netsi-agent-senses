# AGENTS.md — netsi-agent-senses

Shared guidance for AI coding agents working in this repo (Claude Code, Codex, others).

## What this is

A sense layer for AI agent harnesses. Human-like senses (pain, interoception, time, smell, gut feeling, ...)
are implemented as sensors over a common event format. Both the agent (via MCP) and the human (via a
dashboard) can read and tune them. V1 ships as a Claude Code plugin; Codex comes in phase 2.

**Status:** alpha. Phase 1 is built except PRD-FEAT-008 (interventions); see `memory.md`.

## Source of truth

`development/PRD.md` (written in Danish). Read the relevant `PRD-SEC-###` / `PRD-FEAT-###` before building.

- IDs are stable. Never renumber. New features take the next free `PRD-FEAT-###`.
- Reference the ID in commits and PRs, e.g. `feat(PRD-FEAT-002): add pain sensor`.
- Do not build outside the PRD scope. Phase 1 = Claude Code only. Phase 3 senses (the other ~15) are out of scope for now.
- If the PRD is wrong or unclear, change the PRD (and its changelog) in the same PR instead of silently diverging.

## Stack

- Deno + TypeScript for the core and the MCP server.
- Dashboard: one self-contained HTML file. Vanilla JS, custom elements, SVG. No framework, no build step.
- Storage: JSONL (events, audit) and JSON (config). No database.
- No runtime dependencies unless clearly justified in the PR.

## Layout

| Path | Purpose |
|---|---|
| `development/` | PRD and other planning documents |
| `src/core/` | Event format, sensors, aggregator, config, audit log |
| `src/adapters/` | One folder per harness (`claude-code`, later `codex`). Only place that knows a harness |
| `src/mcp/` | MCP server (`senses_read`, `senses_set`, `senses_history`) |
| `src/http/` | Local dashboard server (127.0.0.1, token, SSE) |
| `bin/` | Status line and dashboard launcher scripts (on the plugin's PATH) |
| `tests/` | Tests and recorded fixtures (`tests/fixtures/`) |
| `dashboard/` | Single-file HTML dashboard |
| `hooks/` | Claude Code hooks (`hooks.json` + scripts) |
| `skills/` | Skill with behaviour rules for the agent |
| `commands/` | Slash command `/senses` |
| `docs/` | User and contributor documentation |
| `.claude-plugin/` | Plugin manifest |

## Commands

```
deno task test   # run tests
deno task lint   # lint
deno task fmt    # format
```

## Design rules

1. Sensors are pure functions of the event list. No I/O, no clock reads inside sensors (pass `now` in).
2. Only adapters know the harness. Core and sensors read the normalised `HarnessEvent` format only.
3. Every reading is `0..1` and carries a `confidence`. Missing data means low confidence, never an invented value.
4. Log metadata only (tool, ok, exit code, token counts). Never log prompt text or file contents.
5. The dashboard server binds to `127.0.0.1` only.
6. A `block` action always has an override path and a timeout, so the agent can never be locked out.
7. Text injected into the agent's context is short and structured. Never inject raw log text (prompt injection risk).

## Security invariants (PRD-FEAT-009) — never weaken

- Through MCP the agent may change only `gain`, `threshold` and `window`, and only within the human-set `bounds`.
- The agent can never change `enabled`, `bounds` or `action`, and can never switch a sense off.
- Every config change and triggered action is written to the audit log with actor, reason, from and to.
- Any change touching these rules needs a test proving the invariant still holds.

## UI conventions

- Light mode by default, with a dark toggle.
- Font stack: `Avenir, Montserrat, Corbel, 'URW Gothic', source-sans-pro, sans-serif`, weight normal.
- Never use colour as the only signal; always show the number and label.
- Use real tables for simple models, not ASCII art.

## Conventions

- Code, comments, README and commit messages in English. The PRD is Danish.
- Conventional Commits (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`).
- Do not commit runtime data (`.netsi-agent-senses/`) or secrets.
- Harness hook and log formats change. Verify against current docs before coding an adapter, and keep adapters thin and covered by recorded-session tests.

# memory.md — netsi-agent-senses

Durable decisions and context for AI agents working in this repo. Keep it short: it is imported into
every session. Put rules in `AGENTS.md` and requirements in `development/PRD.md`, not here.

## Decisions

- Name: `netsi-agent-senses` (chosen 2026-10-19; `sensorium` was considered).
- License: Apache-2.0, same as `netsi-plugins`.
- Audience: open source. Agent and human are equal users of the senses.
- V1 scope: Claude Code plugin with four senses (`pain`, `interoception`, `time`, `smell`) plus the `gut` aggregator.
- Codex support is phase 2. The core stays harness-agnostic.
- Intervention levels per sense: inform, warn, block, influence. All four are in scope for V1.
- Agent self-adjustment is limited by human-set min/max bounds (PRD-FEAT-009). The agent can never switch a sense off.
- Language: code, README and commits in English; the PRD is in Danish.
- Event format got an optional `signals` field (lint/check problem count) so `smell` has data.
- Claude Code: failures come from the `PostToolUseFailure` hook; context usage from the transcript;
  exact window size only from the status line input. Plugins cannot register a status line.
- No runtime dependencies: the MCP server is hand-rolled JSON-RPC. `@std/assert` is test-only.

## Rejected

- Letting the agent approve its own setting changes. Rejected in favour of fixed min/max bounds.
- A separate database. JSON and JSONL are enough.

## Where we stopped

- 2026-10-19: PRD v0.2 written and repo scaffolded.
- 2026-10-20: Phase 0 and phase 1 features 001-007, 009.1-009.4 and 010 built on branch `feat/phase-1-v1`
  (not pushed). PRD v0.3.
- Next: PRD-FEAT-008 interventions and the rest of 009. A plan waits for Sten's answers:
  `development/plan-PRD-FEAT-008-009.md`.

## Open questions

See the last section of `development/PRD.md`.

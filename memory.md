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

## Rejected

- Letting the agent approve its own setting changes. Rejected in favour of fixed min/max bounds.
- A separate database. JSON and JSONL are enough.

## Where we stopped

- 2026-10-19: PRD v0.2 written and repo scaffolded. No implementation yet.
- Next: start phase 0 (event format, sensor interface, config schema, test data).

## Open questions

See the last section of `development/PRD.md`.

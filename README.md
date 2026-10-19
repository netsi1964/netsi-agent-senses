# netsi-agent-senses

Human-like senses for AI agents. Pain, interoception, a sense of time, smell and a gut feeling, measured as
sensors over what an agent harness does, readable by the agent and tunable by you.

> **Status: pre-alpha.** The PRD is written; the implementation has not started.
> The PRD is in Danish: [`development/PRD.md`](development/PRD.md).

## Why

An agent has no overall feel for its own state. A run of failed tool calls, a nearly full context or a very
long session is usually noticed too late. And you have no quick way to see how a session is "feeling".

Senses give both of you the same picture, and one shared configuration.

## What it will do (V1, Claude Code)

| Sense | Human analogue | What it measures |
|---|---|---|
| `pain` | Pain | Share of failed tool calls, exit codes, consecutive failures |
| `interoception` | Inner awareness | Context window fill, token budget |
| `time` | Sense of time | Time since your last message, session length |
| `smell` | Smell | Lint and anomaly signals ("code smells") |
| `gut` | Gut feeling | Weighted aggregate of the other senses |

Every reading is normalised to `0..1` and carries a `confidence`, so a guess never looks like a measurement.

- **MCP server** (`senses_read`, `senses_set`, `senses_history`) so the agent can read and tune its senses.
- **Dashboard** (single HTML file) with a gauge per sense, plus sliders for gain, threshold and window.
- **Claude Code plugin** with hooks, a `/senses` command, a status line and a skill with behaviour rules.
- **Intervention levels per sense:** inform, warn, block, influence.
- **Safety:** the agent can adjust a sense only inside bounds you set, and can never switch one off.

Codex support follows in phase 2. The core is harness-agnostic: only the adapter knows the harness.

## Repo layout

See [AGENTS.md](AGENTS.md) for the planned layout and design rules.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).

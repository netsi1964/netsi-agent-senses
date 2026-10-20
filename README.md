# netsi-agent-senses

Human-like senses for AI agents. Pain, interoception, a sense of time, smell and a gut feeling, measured as
sensors over what an agent harness does, readable by the agent and tunable by you.

**Feature tour:** [netsi1964.github.io/netsi-agent-senses](https://netsi1964.github.io/netsi-agent-senses/), one slide per feature, with examples and real output.

> **Status: alpha, unreleased.** Senses, MCP server, hooks, status line, dashboard and audit log work.
> Interventions beyond recording (warn, block, influence) are not built yet. The PRD is in Danish:
> [`development/PRD.md`](development/PRD.md).

## Why

An agent has no overall feel for its own state. A run of failed tool calls, a nearly full context or a very
long session is usually noticed too late. And you have no quick way to see how a session is "feeling".

Senses give both of you the same picture, and one shared configuration.

## The senses (V1, Claude Code)

| Sense | Human analogue | What it measures |
|---|---|---|
| `pain` | Pain | Share of failed tool calls in the window, weighted towards failures in a row |
| `interoception` | Inner awareness | Context window in use / window size |
| `time` | Sense of time | Session length, and time since you last wrote |
| `smell` | Smell | Problems reported by linters and type checkers the agent runs |
| `gut` | Gut feeling | Weighted average of the other senses |

Every reading is a value from `0` to `1` with a `confidence`, so a guess never looks like a measurement.
How each sense is computed: [docs/sensors.md](docs/sensors.md).

## Get started in 5 minutes

You need [Claude Code](https://claude.com/claude-code) and [Deno](https://deno.com) 2.x. No build step.

1. **Get the plugin**

   ```sh
   git clone https://github.com/netsi1964/netsi-agent-senses.git ~/netsi-agent-senses
   ```

2. **Start Claude Code with it** in the project you work on

   ```sh
   claude --plugin-dir ~/netsi-agent-senses
   ```

   This loads the hooks, the `senses` MCP server, the `/senses` command and the `senses` skill.
   Data is written to `.netsi-agent-senses/` in your project. Add that folder to your `.gitignore`.

3. **Look at your senses**: type `/senses`. You get a table and a link to the dashboard.

4. **Optional: status line.** Plugins cannot set a status line, so add it yourself in
   `~/.claude/settings.json` (or the project's `.claude/settings.json`):

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "~/netsi-agent-senses/bin/netsi-senses-statusline"
     }
   }
   ```

   It shows e.g. `pain 0.80! · ctx 0.42 · time 0.10 · smell – · gut 0.51` (`!` = over threshold,
   `–` = no data yet). It also gives `interoception` the exact context window size.

## What you get

- **MCP server** with `senses_read`, `senses_set` and `senses_history`, so the agent can read its senses and
  tune them within your bounds.
- **Dashboard**: a single local HTML page with a gauge per sense, history, all settings and a log of who
  changed what. Served on `127.0.0.1` only, behind a random token.
- **Hooks** that record metadata only: tool name, success, exit code, token counts. Never prompts, code or
  tool output.
- **Skill** with behaviour rules for the agent: what to do when a sense triggers.
- **Audit log** of every config change, with who (human or agent), when, from, to and why.

## Configuration

Everything lives in `.netsi-agent-senses/senses.json`, created with defaults on first dashboard start.
You may write a partial file; missing values come from the defaults. Edits apply without a restart, and an
invalid file is ignored in favour of the last valid one. See [docs/configuration.md](docs/configuration.md).

## Safety model

The agent may tune its own senses, but never blind itself:

- Through MCP it may change only `gain`, `threshold` and `window`, and only inside the `bounds` you set.
- It can never change `enabled`, `bounds` or `action`, so it can never switch a sense off.
- Every change is audited and shown in the dashboard.

The shipped bounds are narrow on purpose. Widen them in the dashboard if you want to give the agent more room.

## Building on it

- New senses: [docs/sensors.md](docs/sensors.md)
- New harnesses (Codex is next): [docs/adapters.md](docs/adapters.md)

```sh
deno task test   # run tests
deno task lint   # lint
deno task fmt    # format
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Security issues: [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).

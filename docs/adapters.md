# Adapters

An adapter is the only code that knows a harness. It turns the harness's native hooks or logs into
`HarnessEvent`s and appends them to the event log. Sensors, the MCP server and the dashboard never see a
harness-specific payload.

## The event format

```ts
// src/core/event.ts
type HarnessEvent = {
  schemaVersion: 1;
  ts: number; // ms since epoch
  session: string;
  kind: "prompt" | "tool_call" | "tool_result" | "token_usage" | "turn_end";
  tool?: string;
  ok?: boolean; // tool_result only
  exitCode?: number;
  tokens?: { used: number; limit?: number }; // context in use, window size
  signals?: number; // lint/check problems in a tool result (feeds smell)
  source: "claude-code" | "codex";
};
```

`parseEvent()` validates every event and drops unknown fields, so nothing un-vetted is stored.

## What an adapter must do

1. Map native events to `HarnessEvent`s. Keep the mapping a pure function (`normalize()`), so it can be
   tested against recorded payloads.
2. Write **metadata only**: tool name, success, exit code, token counts. Never prompt text, tool input,
   tool output or file contents. Tool output may be inspected in memory (e.g. to count lint problems),
   but only the count is stored.
3. Never break the harness session. Swallow errors, exit successfully, keep hooks fast.
4. Use `SenseStore` (`src/core/store.ts`) for all I/O: `appendEvent()`, then `record(current())` so the
   history has a row per event.
5. Be covered by recorded-session tests in `tests/fixtures/<harness>/`, including a test that no content
   leaks into the log.

## Claude Code (`src/adapters/claude-code/`)

| Hook | Event |
|---|---|
| `UserPromptSubmit` | `prompt` (+ `token_usage` from the transcript) |
| `PreToolUse` | `tool_call` |
| `PostToolUse` | `tool_result ok: true` (+ `signals` for lint/check commands) |
| `PostToolUseFailure` | `tool_result ok: false`, `exitCode` parsed from `Exit code N`. User interrupts are ignored. |
| `Stop` | `turn_end` (+ `token_usage` from the transcript) |
| status line | `token_usage` with the exact window size |

Context in use is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` of the latest
non-sidechain assistant message, the same formula Claude Code's status line uses.

Formats were verified against the Claude Code docs and a real transcript on 2026-10-19. They change between
versions: re-verify before changing the adapter.

## Codex (phase 2)

Planned: tail Codex's session log and its `notify` hook into the same events. No core changes should be
needed; if one is, the core is not harness-agnostic enough and that is a bug.

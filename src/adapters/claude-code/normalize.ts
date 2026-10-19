/**
 * Claude Code hook payload -> HarnessEvent (PRD-FEAT-007.1).
 *
 * The only place that knows Claude Code's hook format. Verified against the
 * Claude Code hooks docs on 2026-10-19:
 * - PostToolUse fires on success; PostToolUseFailure fires when a started tool
 *   fails, with `error` starting "Exit code N" for Bash, and `is_interrupt`.
 * - Bash `tool_response` has stdout/stderr/interrupted but no exit code.
 *
 * Only metadata leaves this file. Tool output is inspected in memory to count
 * lint signals, never stored.
 */

import { EVENT_SCHEMA_VERSION, type HarnessEvent } from "../../core/event.ts";

export type HookPayload = Record<string, unknown> & {
  hook_event_name?: string;
  session_id?: string;
  tool_name?: string;
};

/** Commands whose output we count as lint/check signals for `smell`. */
const CHECK_COMMAND =
  /\b(lint|eslint|biome|oxlint|ruff|flake8|pylint|mypy|pyright|tsc|clippy|shellcheck|stylelint|deno\s+(lint|check)|go\s+vet|rubocop|golangci-lint)\b/;
/** Lines that look like a problem report from a linter or type checker. */
const PROBLEM_LINE = /\b(error|warning|warn)\b|\(\w+[-/]\w[\w/-]*\)$|^\s*\d+:\d+\s/i;
/** Summary lines like "Found 3 problems" or "12 errors" that would double count. */
const SUMMARY_LINE = /\b(found|checked)\b|^\s*✖|\d+ (problems?|errors?|warnings?)\b/i;

export function countSignals(output: string): number {
  let n = 0;
  for (const line of output.split("\n")) {
    if (!line.trim() || SUMMARY_LINE.test(line)) continue;
    if (PROBLEM_LINE.test(line)) n++;
  }
  return n;
}

function bashCommand(p: HookPayload): string | undefined {
  const input = p.tool_input;
  if (typeof input === "object" && input !== null) {
    const cmd = (input as Record<string, unknown>).command;
    if (typeof cmd === "string") return cmd;
  }
  return undefined;
}

function bashOutput(p: HookPayload): string {
  const r = p.tool_response;
  if (typeof r !== "object" || r === null) return typeof r === "string" ? r : "";
  const { stdout, stderr } = r as Record<string, unknown>;
  return `${typeof stdout === "string" ? stdout : ""}\n${typeof stderr === "string" ? stderr : ""}`;
}

/** Parse the exit code from a PostToolUseFailure error ("Exit code 1\n..."). */
export function exitCodeFromError(error: unknown): number | undefined {
  if (typeof error !== "string") return undefined;
  const m = /^Exit code (-?\d+)/.exec(error);
  return m ? Number(m[1]) : undefined;
}

/**
 * Map one hook payload to zero or more events. `tokens` is the latest context
 * usage read from the transcript, when the caller has it.
 */
export function normalize(
  p: HookPayload,
  now: number,
  tokens?: { used: number; limit?: number },
): HarnessEvent[] {
  const session = typeof p.session_id === "string" && p.session_id ? p.session_id : "unknown";
  const tool = typeof p.tool_name === "string" ? p.tool_name.slice(0, 200) : undefined;
  const base = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    ts: now,
    session,
    source: "claude-code",
  } as const;
  const usage: HarnessEvent[] = tokens ? [{ ...base, kind: "token_usage", tokens }] : [];

  switch (p.hook_event_name) {
    case "UserPromptSubmit":
      return [{ ...base, kind: "prompt" }, ...usage];
    case "PreToolUse":
      return [{ ...base, kind: "tool_call", ...(tool ? { tool } : {}) }];
    case "PostToolUse": {
      const ev: HarnessEvent = {
        ...base,
        kind: "tool_result",
        ok: true,
        ...(tool ? { tool } : {}),
      };
      if (tool === "Bash") {
        const cmd = bashCommand(p);
        if (cmd && CHECK_COMMAND.test(cmd)) ev.signals = countSignals(bashOutput(p));
      }
      return [ev];
    }
    case "PostToolUseFailure": {
      // A user interrupt is not the agent failing.
      if (p.is_interrupt === true) return [];
      const ev: HarnessEvent = {
        ...base,
        kind: "tool_result",
        ok: false,
        ...(tool ? { tool } : {}),
      };
      const code = exitCodeFromError(p.error);
      if (code !== undefined) ev.exitCode = code;
      if (tool === "Bash") {
        const cmd = bashCommand(p);
        if (cmd && CHECK_COMMAND.test(cmd) && typeof p.error === "string") {
          ev.signals = countSignals(p.error.split("\n").slice(1).join("\n"));
        }
      }
      return [ev];
    }
    case "Stop":
      return [{ ...base, kind: "turn_end" }, ...usage];
    default:
      return [];
  }
}

/**
 * Claude Code adapter against recorded hook payloads (AGENTS.md: adapters are
 * covered by recorded-session tests).
 */

import { assert, assertEquals } from "@std/assert";
import {
  countSignals,
  exitCodeFromError,
  type HookPayload,
  normalize,
} from "../src/adapters/claude-code/normalize.ts";
import { lastContextUsage, usageFromLine } from "../src/adapters/claude-code/transcript.ts";
import { runHook } from "../src/adapters/claude-code/hook.ts";
import { contextFromStatus, runStatusLine } from "../src/adapters/claude-code/statusline.ts";
import { parseEvent } from "../src/core/event.ts";
import { SenseStore } from "../src/core/store.ts";
import { fixture, T0, tempDir } from "./helpers.ts";

async function payloads(): Promise<HookPayload[]> {
  const transcript = fixture("claude-code/transcript.jsonl");
  return (await Deno.readTextFile(fixture("claude-code/session.jsonl")))
    .trim().split("\n")
    .map((l) => ({ ...JSON.parse(l), transcript_path: transcript }));
}

Deno.test("recorded session normalises to the expected metadata-only events", async () => {
  const events = (await payloads()).flatMap((p, i) => normalize(p, T0 + i * 1000));
  for (const e of events) assert(parseEvent(e).ok, JSON.stringify(e));
  assertEquals(
    events.map((
      e,
    ) => [e.kind, e.tool ?? null, e.ok ?? null, e.exitCode ?? null, e.signals ?? null]),
    [
      ["prompt", null, null, null, null],
      ["tool_call", "Bash", null, null, null],
      ["tool_result", "Bash", true, null, 2], // deno lint: 2 problems
      ["tool_call", "Bash", null, null, null],
      ["tool_result", "Bash", false, 1, null],
      // user interrupt: no event
      ["tool_call", "Read", null, null, null],
      ["tool_result", "Read", true, null, null],
      ["turn_end", null, null, null, null],
      // SessionStart: no event
    ],
  );
  assert(events.every((e) => e.session === "cc-1" && e.source === "claude-code"));
});

Deno.test("no prompt text, tool input, tool output or answer ever reaches the event log", async () => {
  const dir = await tempDir();
  const store = new SenseStore(dir);
  let t = T0;
  for (const p of await payloads()) await runHook(p, store, t += 1000);
  for (const file of [store.paths.events, store.paths.readings]) {
    const text = await Deno.readTextFile(file);
    assert(!text.includes("SECRET"), `${file} leaked content`);
    assert(!text.includes("/tmp/p"), `${file} leaked a path`);
    assert(!text.includes("express"), `${file} leaked output`);
  }
});

Deno.test("runHook reads context usage from the transcript on prompt and stop", async () => {
  const dir = await tempDir();
  const store = new SenseStore(dir);
  let t = T0;
  for (const p of await payloads()) await runHook(p, store, t += 1000);
  const snap = await store.current(t, "cc-1");
  const ctx = snap.senses.find((s) => s.id === "interoception")!;
  assertEquals(ctx.label, "92k of 200k tokens (limit assumed)");
  assertEquals(ctx.confidence, 0.5);
  const pain = snap.senses.find((s) => s.id === "pain")!;
  assertEquals(pain.label, "1 of 3 calls failed");
  assert((await store.history()).length > 0);
});

Deno.test("transcript: sidechain and torn lines are ignored", async () => {
  assertEquals(await lastContextUsage(fixture("claude-code/transcript.jsonl")), 92427);
  assertEquals(await lastContextUsage("/nonexistent/x.jsonl"), undefined);
  assertEquals(usageFromLine('{"type":"user","usage":1}'), undefined);
});

Deno.test("exit codes and lint signals are parsed from tool output", () => {
  assertEquals(exitCodeFromError("Exit code 127\ncommand not found"), 127);
  assertEquals(exitCodeFromError("Interrupted"), undefined);
  assertEquals(countSignals("all good\nChecked 4 files"), 0);
  const eslint =
    "/a.ts\n  1:7  error  'x' is unused  no-unused-vars\n  2:1  warning  Unexpected console" +
    "  no-console\n\n✖ 2 problems (1 error, 1 warning)";
  assertEquals(countSignals(eslint), 2);
});

Deno.test("PRD-FEAT-007.4: status line logs exact context size once and prints the summary", async () => {
  const dir = await tempDir();
  const store = new SenseStore(dir);
  const input = {
    session_id: "cc-2",
    context_window: {
      context_window_size: 1_000_000,
      current_usage: {
        input_tokens: 10,
        cache_read_input_tokens: 499_990,
        cache_creation_input_tokens: 0,
      },
    },
  };
  assertEquals(contextFromStatus(input), { used: 500_000, limit: 1_000_000 });
  assertEquals(contextFromStatus({ context_window: { current_usage: null } }), undefined);

  const line = await runStatusLine(input, store, T0);
  await runStatusLine(input, store, T0 + 1000); // unchanged numbers: no new event
  assertEquals(line, "pain – · ctx 0.50 · time 0.00 · smell – · gut 0.33");
  const lines = (await Deno.readTextFile(store.paths.events)).trim().split("\n");
  assertEquals(lines.length, 1);
});

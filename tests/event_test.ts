import { assert, assertEquals, assertFalse } from "@std/assert";
import { EVENT_SCHEMA_VERSION, parseEvent } from "../src/core/event.ts";
import { appendEvent, readEvents } from "../src/core/eventlog.ts";
import { appendJsonl, readJsonl } from "../src/core/jsonl.ts";
import { ev, fixture, tempDir } from "./helpers.ts";

Deno.test("PRD-FEAT-001.3: events carry a schemaVersion and other versions are rejected", () => {
  assert(parseEvent(ev(0, "prompt")).ok);
  assertEquals(EVENT_SCHEMA_VERSION, 1);
  assertFalse(parseEvent({ ...ev(0, "prompt"), schemaVersion: 99 }).ok);
  const { schemaVersion: _, ...noVersion } = ev(0, "prompt");
  assertFalse(parseEvent(noVersion).ok);
});

Deno.test("PRD-FEAT-001.2: invalid or unknown events are rejected without throwing", () => {
  const bad: unknown[] = [
    null,
    "text",
    42,
    [],
    { ...ev(0, "prompt"), kind: "teleport" },
    { ...ev(0, "prompt"), source: "other" },
    { ...ev(0, "prompt"), ts: "yesterday" },
    { ...ev(0, "prompt"), ts: -1 },
    { ...ev(0, "prompt"), session: "" },
    { ...ev(0, "prompt"), ok: true }, // ok only on tool_result
    { ...ev(0, "tool_result"), ok: "yes" },
    { ...ev(0, "tool_result"), exitCode: 1.5 },
    { ...ev(0, "token_usage"), tokens: { used: -5 } },
    { ...ev(0, "token_usage"), tokens: { used: 5, limit: 0 } },
    { ...ev(0, "tool_result"), signals: -1 },
  ];
  for (const b of bad) {
    const r = parseEvent(b);
    assertFalse(r.ok, `should reject ${JSON.stringify(b)}`);
    if (!r.ok) assert(r.error.length > 0);
  }
});

Deno.test("unknown extra fields are dropped so no content can sneak into the log", () => {
  const r = parseEvent({
    ...ev(0, "tool_result", { ok: true }),
    prompt: "secret",
    tool_input: { a: 1 },
  });
  assert(r.ok);
  if (r.ok) {
    assertFalse("prompt" in r.event);
    assertFalse("tool_input" in r.event);
  }
});

Deno.test("PRD-FEAT-001.1: events are appended as JSONL and read back in order", async () => {
  const dir = await tempDir();
  const path = `${dir}/events.jsonl`;
  assert((await appendEvent(path, ev(2, "tool_call", { tool: "Bash" }))).ok);
  assert((await appendEvent(path, ev(1, "prompt"))).ok);
  const rejected = await appendEvent(path, { nonsense: true });
  assertFalse(rejected.ok);

  const lines = (await Deno.readTextFile(path)).trim().split("\n");
  assertEquals(lines.length, 2);
  const events = await readEvents(path);
  assertEquals(events.map((e) => e.kind), ["prompt", "tool_call"]);
});

Deno.test("a recorded session with corrupt lines is read without crashing", async () => {
  const events = await readEvents(fixture("spiral.jsonl"));
  assertEquals(events.length, 22);
  assert(events.every((e) => e.session === "fixture-spiral"));
});

Deno.test("PRD-FEAT-010.3: jsonl rotates when the file grows past maxBytes", async () => {
  const dir = await tempDir();
  const path = `${dir}/log.jsonl`;
  const rotation = { maxBytes: 100, keep: 2 };
  for (let i = 0; i < 30; i++) {
    await appendJsonl(path, { i, pad: "xxxxxxxxxxxxxxxxxxxx" }, rotation);
  }
  const files = [];
  for await (const f of Deno.readDir(dir)) files.push(f.name);
  files.sort();
  assertEquals(files, ["log.jsonl", "log.jsonl.1", "log.jsonl.2"]);
  const newest = await readJsonl(path);
  assertEquals((newest[newest.length - 1] as { i: number }).i, 29);
});

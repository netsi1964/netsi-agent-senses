import { assert, assertAlmostEquals, assertEquals, assertFalse } from "@std/assert";
import { defaultConfig } from "../src/core/config.ts";
import { SENSORS, snapshot, statusLine } from "../src/core/engine.ts";
import { readEvents } from "../src/core/eventlog.ts";
import { read } from "../src/core/sensor.ts";
import { pain } from "../src/core/sensors/pain.ts";
import { interoception } from "../src/core/sensors/interoception.ts";
import { time } from "../src/core/sensors/time.ts";
import { smell } from "../src/core/sensors/smell.ts";
import { gutFeeling } from "../src/core/gut.ts";
import { ev, fixture, T0 } from "./helpers.ts";

const cfg = defaultConfig();
const at = (s: number) => T0 + s * 1000;

Deno.test("PRD-FEAT-002.1: every reading has value, label, confidence and ts in range", async () => {
  const events = await readEvents(fixture("spiral.jsonl"));
  const now = events[events.length - 1].ts;
  for (const sensor of SENSORS) {
    const r = read(sensor, { events, config: cfg.senses[sensor.id], now });
    assertEquals(r.id, sensor.id);
    assert(r.value >= 0 && r.value <= 1, `${sensor.id} value ${r.value}`);
    assert(r.confidence >= 0 && r.confidence <= 1, `${sensor.id} confidence`);
    assert(r.label.length > 0);
    assertEquals(r.ts, now);
  }
});

Deno.test("PRD-FEAT-002.2: with no data every sensor reports zero confidence, not an invented value", () => {
  for (const sensor of SENSORS) {
    const r = read(sensor, { events: [], config: cfg.senses[sensor.id], now: at(0) });
    assertEquals(r.confidence, 0, sensor.id);
    assertEquals(r.value, 0, sensor.id);
    assertFalse(r.triggered, sensor.id);
  }
});

Deno.test("PRD-FEAT-002.3: sensors are pure (same input, same output, input untouched)", async () => {
  const events = await readEvents(fixture("spiral.jsonl"));
  const frozen = JSON.stringify(events);
  const now = events[events.length - 1].ts;
  for (const sensor of SENSORS) {
    const input = { events, config: cfg.senses[sensor.id], now };
    assertEquals(sensor.compute(input), sensor.compute(input));
  }
  assertEquals(JSON.stringify(events), frozen);
});

Deno.test("pain: a failure spiral hurts", async () => {
  const events = await readEvents(fixture("spiral.jsonl"));
  const r = read(pain, { events, config: cfg.senses.pain, now: at(100) });
  // 6 of 9 failed (0.667 * 0.6) + streak of 3 (1 * 0.4) = 0.8
  assertAlmostEquals(r.value, 0.8, 0.001);
  assertEquals(r.label, "6 of 9 calls failed, last 3 in a row");
  assertEquals(r.confidence, 1);
  assert(r.triggered);
});

Deno.test("pain: old failures fall out of the window", () => {
  const events = [ev(0, "tool_result", { ok: false }), ev(1000, "tool_result", { ok: true })];
  const r = read(pain, { events, config: cfg.senses.pain, now: at(1000) });
  assertEquals(r.value, 0);
  assertEquals(r.label, "0 of 1 calls failed");
});

Deno.test("pain: gain amplifies and the result is clamped to 1", () => {
  const events = [1, 2, 3, 4, 5].map((s) => ev(s, "tool_result", { ok: false }));
  const r = read(pain, { events, config: { ...cfg.senses.pain, gain: 1.5 }, now: at(5) });
  assertEquals(r.value, 1);
});

Deno.test("interoception: known limit is trusted, assumed limit is half trusted", () => {
  const known = read(interoception, {
    events: [ev(0, "token_usage", { tokens: { used: 150_000, limit: 200_000 } })],
    config: cfg.senses.interoception,
    now: at(1),
  });
  assertEquals(known.value, 0.75);
  assertEquals(known.confidence, 1);
  assertEquals(known.label, "150k of 200k tokens");

  const assumed = read(interoception, {
    events: [ev(0, "token_usage", { tokens: { used: 50_000 } })],
    config: cfg.senses.interoception,
    now: at(1),
  });
  assertEquals(assumed.value, 0.25);
  assertEquals(assumed.confidence, 0.5);
});

Deno.test("time: long idle since last prompt raises the value", () => {
  const events = [ev(0, "prompt"), ev(60, "tool_result", { ok: true })];
  // window 7200 s -> idle full at 1200 s
  const r = read(time, { events, config: cfg.senses.time, now: at(600) });
  assertEquals(r.value, 0.5);
  assertEquals(r.label, "session 10 min, 10 min since last prompt");
  assertEquals(r.confidence, 1);
});

Deno.test("time: without a prompt it falls back to session age with low confidence", () => {
  const r = read(time, { events: [ev(0, "tool_call")], config: cfg.senses.time, now: at(3600) });
  assertEquals(r.value, 0.5);
  assertEquals(r.confidence, 0.3);
});

Deno.test("smell: only measured results count, and the latest run per tool wins", () => {
  const events = [
    ev(0, "tool_result", { tool: "Bash", ok: true }), // no lint ran
    ev(10, "tool_result", { tool: "Bash", ok: true, signals: 10 }),
    ev(20, "tool_result", { tool: "Bash", ok: true, signals: 0 }), // fixed
  ];
  const r = read(smell, { events, config: cfg.senses.smell, now: at(30) });
  assertEquals(r.value, 0);
  assertAlmostEquals(r.confidence, 0.667, 0.001);
  assertEquals(r.label, "0 lint/check signals in latest runs");
});

Deno.test("PRD-FEAT-003.1/3.3: gut is a weighted average of enabled senses only", () => {
  const config = defaultConfig();
  config.senses.time.enabled = false;
  const events = [
    ev(0, "prompt"),
    ...[1, 2, 3, 4, 5].map((s) => ev(s, "tool_result", { ok: false })),
    ev(6, "token_usage", { tokens: { used: 100_000, limit: 200_000 } }),
  ];
  const snap = snapshot(events, config, at(6));
  assertEquals(snap.senses.find((s) => s.id === "time")?.label, "disabled");
  assertFalse(snap.gut.from.includes("time"));
  // pain 1.0 * 1.5 + ctx 0.5 * 1 over weight 2.5 (smell has no data)
  assertEquals(snap.gut.value, 0.8);
  assertEquals(snap.gut.from, ["pain", "interoception"]);
});

Deno.test("PRD-FEAT-003.2: a high gut value with low confidence is flagged", () => {
  const readings = [
    { id: "pain", value: 1, label: "", confidence: 0.2, ts: 0, triggered: true },
    { id: "smell", value: 0, label: "", confidence: 0, ts: 0, triggered: false },
  ];
  const gut = gutFeeling(readings, { weights: {}, threshold: 0.6 }, 0);
  assertEquals(gut.value, 1);
  assertEquals(gut.confidence, 0.1);
  assert(gut.uncertain);
  assert(gut.label.endsWith("(low confidence)"));
});

Deno.test("status line is compact and marks triggered senses", async () => {
  const events = await readEvents(fixture("spiral.jsonl"));
  const line = statusLine(snapshot(events, defaultConfig(), at(100)));
  assertEquals(line, "pain 0.80! · ctx 0.84! · time 0.08 · smell 0.75! · gut 0.71!");
});

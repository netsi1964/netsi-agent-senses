/**
 * Security invariants (PRD-FEAT-009, AGENTS.md). These tests must keep passing.
 */

import { assert, assertEquals, assertFalse } from "@std/assert";
import { defaultConfig, type SensesConfig, TUNABLE_FIELDS } from "../src/core/config.ts";
import { applyAgentChange } from "../src/core/policy.ts";
import { SenseStore } from "../src/core/store.ts";
import { tempDir } from "./helpers.ts";

Deno.test("PRD-FEAT-009.2: the agent can never change enabled, bounds or action", () => {
  const config = defaultConfig();
  const attempts: Record<string, unknown>[] = [
    { enabled: false },
    { action: "inform" },
    { bounds: { threshold: [0, 1] } },
    { threshold: 0.7, enabled: false }, // smuggled alongside a legal change
    { __proto__: { enabled: false } } as Record<string, unknown>,
    { constructor: { prototype: { enabled: false } } },
  ];
  for (const changes of attempts) {
    const r = applyAgentChange(config, { sense: "pain", changes });
    if (r.ok) {
      // Only possible when no forbidden key is an own key; state must be untouched.
      assertEquals(r.config.senses.pain.enabled, true);
      assertEquals(r.config.senses.pain.action, config.senses.pain.action);
      assertEquals(r.config.senses.pain.bounds, config.senses.pain.bounds);
    } else {
      assert(r.error.length > 0);
    }
  }
  assertFalse(applyAgentChange(config, { sense: "pain", changes: { enabled: false } }).ok);
  assertFalse(
    applyAgentChange(config, { sense: "pain", changes: { threshold: 0.7, enabled: false } }).ok,
  );
});

Deno.test("PRD-FEAT-005.1/009.1: values outside bounds are rejected with an explaining error", () => {
  const config = defaultConfig();
  const r = applyAgentChange(config, { sense: "pain", changes: { threshold: 0.99 } });
  assertFalse(r.ok);
  if (!r.ok) assert(r.error.includes("[0.4, 0.85]"), r.error);
  for (const bad of [NaN, Infinity, -1, "0.5", null]) {
    assertFalse(applyAgentChange(config, { sense: "pain", changes: { gain: bad } }).ok);
  }
});

Deno.test("legal changes inside bounds apply, all-or-nothing, without mutating the input", () => {
  const config = defaultConfig();
  const before = JSON.stringify(config);
  const ok = applyAgentChange(config, { sense: "pain", changes: { threshold: 0.7, window: 600 } });
  assert(ok.ok);
  if (ok.ok) {
    assertEquals(ok.config.senses.pain.threshold, 0.7);
    assertEquals(ok.applied.map((a) => a.field), ["threshold", "window"]);
  }
  const mixed = applyAgentChange(config, {
    sense: "pain",
    changes: { threshold: 0.7, window: 99999 },
  });
  assertFalse(mixed.ok);
  assertEquals(JSON.stringify(config), before);
});

Deno.test("PRD-FEAT-009 fuzz: no sequence of agent requests can blind a sense", () => {
  let config: SensesConfig = defaultConfig();
  const original = defaultConfig();
  const keys = ["gain", "threshold", "window", "enabled", "bounds", "action", "x"];
  const values = [0, 0.01, 0.5, 0.85, 1, 2, 10, 1e9, -5, false, true, "off", [0, 1], null];
  let seed = 42;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed % n;
  };
  const ids = Object.keys(config.senses);
  for (let i = 0; i < 5000; i++) {
    const changes: Record<string, unknown> = {};
    for (let k = 0; k <= rand(3); k++) {
      changes[keys[rand(keys.length)]] = values[rand(values.length)];
    }
    const r = applyAgentChange(config, { sense: ids[rand(ids.length)], changes });
    if (r.ok) config = r.config;
  }
  for (const id of ids) {
    const s = config.senses[id];
    const o = original.senses[id];
    assertEquals(s.enabled, true, id);
    assertEquals(s.action, o.action, id);
    assertEquals(s.bounds, o.bounds, id);
    for (const f of TUNABLE_FIELDS) {
      assert(s[f] >= o.bounds[f][0] && s[f] <= o.bounds[f][1], `${id}.${f} = ${s[f]}`);
    }
  }
});

Deno.test("PRD-FEAT-009.3: agent changes are audited with actor, reason, from and to; rejections write nothing", async () => {
  const dir = await tempDir();
  const store = new SenseStore(dir);
  const rejected = await store.agentSet("pain", { enabled: false }, "too noisy", 1);
  assertFalse(rejected.ok);
  assertEquals(await store.audit(), []);

  const ok = await store.agentSet("pain", { threshold: 0.7 }, "fewer false alarms", 2);
  assert(ok.ok);
  const audit = await store.audit();
  assertEquals(audit, [{
    ts: 2,
    actor: "agent",
    type: "config_change",
    sense: "pain",
    from: { threshold: 0.6 },
    to: { threshold: 0.7 },
    reason: "fewer false alarms",
  }]);
  assertEquals((await store.config.get()).senses.pain.threshold, 0.7);
});

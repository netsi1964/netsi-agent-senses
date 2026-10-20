import { assert, assertEquals, assertFalse } from "@std/assert";
import { ConfigStore, defaultConfig, resolveConfig, validateConfig } from "../src/core/config.ts";
import { tempDir } from "./helpers.ts";

Deno.test("PRD-FEAT-004.3: shipped defaults are valid", () => {
  assert(validateConfig(defaultConfig()).ok);
});

Deno.test("PRD-FEAT-009.4: default bounds never give the agent full freedom", () => {
  for (const [id, s] of Object.entries(defaultConfig().senses)) {
    assert(s.bounds.threshold[1] < 1, `${id}: agent must not be able to raise threshold to 1`);
    assert(s.bounds.gain[0] >= 0.5, `${id}: agent must not be able to mute via gain`);
  }
});

Deno.test("a partial user config is filled from defaults", () => {
  const r = resolveConfig({ senses: { pain: { threshold: 0.5 } } });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.config.senses.pain.threshold, 0.5);
    assertEquals(r.config.senses.pain.gain, 1);
    assertEquals(r.config.senses.time.window, 7200);
  }
});

Deno.test("invalid configs are rejected with reasons", () => {
  const cases: unknown[] = [
    { senses: { pain: { threshold: 2 } } },
    { senses: { pain: { gain: 0.1 } } }, // outside default bounds
    { senses: { pain: { action: "explode" } } },
    { senses: { pain: { bounds: { gain: [2, 1] } } } },
    { senses: { pain: { enabled: "yes" } } },
    { gut: { threshold: -1 } },
    { schemaVersion: 7 },
  ];
  for (const c of cases) {
    const r = resolveConfig(c);
    assertFalse(r.ok, JSON.stringify(c));
    if (!r.ok) assert(r.errors.length > 0);
  }
});

Deno.test("PRD-FEAT-004.1/4.2: edits apply without restart; invalid edits keep the last valid config", async () => {
  const dir = await tempDir();
  const path = `${dir}/senses.json`;
  const store = new ConfigStore(path);

  // No file yet -> defaults
  assertEquals((await store.get()).senses.pain.threshold, 0.6);

  await Deno.writeTextFile(path, JSON.stringify({ senses: { pain: { threshold: 0.5 } } }));
  assertEquals((await store.get()).senses.pain.threshold, 0.5);
  assertEquals(store.lastError, null);

  // Ensure a different mtime on fast filesystems
  await new Promise((r) => setTimeout(r, 20));
  await Deno.writeTextFile(path, "{ not json");
  assertEquals((await store.get()).senses.pain.threshold, 0.5);
  assert(store.lastError);

  await new Promise((r) => setTimeout(r, 20));
  await Deno.writeTextFile(path, JSON.stringify({ senses: { pain: { threshold: 5 } } }));
  assertEquals((await store.get()).senses.pain.threshold, 0.5);
  assert(store.lastError?.some((e) => e.includes("threshold")));
});

Deno.test("ConfigStore.write refuses invalid configs", async () => {
  const dir = await tempDir();
  const store = new ConfigStore(`${dir}/senses.json`);
  const bad = defaultConfig();
  bad.senses.pain.threshold = 3;
  let threw = false;
  try {
    await store.write(bad);
  } catch {
    threw = true;
  }
  assert(threw);
});

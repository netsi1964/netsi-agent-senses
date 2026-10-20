import { assert, assertEquals, assertFalse } from "@std/assert";
import { handle, SUPPORTED_PROTOCOL_VERSIONS } from "../src/mcp/server.ts";
import { SenseStore } from "../src/core/store.ts";
import { ev, T0, tempDir } from "./helpers.ts";

type Res = { result?: Record<string, unknown>; error?: { code: number; message: string } };

async function setup() {
  const store = new SenseStore(await tempDir());
  for (const e of [ev(0, "prompt"), ev(1, "tool_result", { ok: false })]) {
    await store.appendEvent(e);
  }
  let id = 0;
  const call = async (method: string, params?: unknown) =>
    (await handle(store, { jsonrpc: "2.0", id: ++id, method, params }, () => T0 + 2000)) as Res;
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await call("tools/call", { name, arguments: args });
    const result = r.result as { content: { text: string }[]; isError: boolean };
    return { isError: result.isError, text: result.content[0].text };
  };
  return { store, call, tool };
}

Deno.test("initialize negotiates a protocol version and declares tools", async () => {
  const { call } = await setup();
  const known = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {} });
  assertEquals(known.result?.protocolVersion, "2025-06-18");
  const unknown = await call("initialize", { protocolVersion: "1999-01-01" });
  assertEquals(unknown.result?.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
  assertEquals(unknown.result?.capabilities, { tools: {} });
});

Deno.test("notifications get no response; unknown methods and tools are errors", async () => {
  const { store, call } = await setup();
  assertEquals(await handle(store, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assertEquals((await call("nope")).error?.code, -32601);
  assertEquals((await call("tools/call", { name: "nope" })).error?.code, -32602);
  assertEquals((await handle(store, { foo: 1 }))?.jsonrpc, "2.0");
});

Deno.test("tools/list exposes exactly the three PRD tools", async () => {
  const { call } = await setup();
  const tools = (await call("tools/list")).result?.tools as { name: string }[];
  assertEquals(tools.map((t) => t.name), ["senses_read", "senses_set", "senses_history"]);
});

Deno.test("senses_read returns readings, gut and bounds", async () => {
  const { tool } = await setup();
  const r = await tool("senses_read");
  assertFalse(r.isError);
  const body = JSON.parse(r.text);
  assertEquals(body.session, "s1");
  const pain = body.senses.find((s: { id: string }) => s.id === "pain");
  assertEquals(pain.value, 0.733); // 1 of 1 failed, streak 1 of 3
  assertEquals(pain.tunable.bounds.threshold, [0.4, 0.85]);
  assert("gut" in body);
});

Deno.test("PRD-FEAT-005.1/005.2: senses_set rejects out-of-bounds values and forbidden fields", async () => {
  const { tool, store } = await setup();
  const out = await tool("senses_set", { sense: "pain", threshold: 0.99, reason: "x" });
  assert(out.isError);
  assert(out.text.includes("bounds"), out.text);

  for (const field of ["enabled", "bounds", "action"]) {
    const r = await tool("senses_set", { sense: "pain", [field]: false, reason: "x" });
    assert(r.isError, field);
    assert(r.text.includes("only the human"), r.text);
  }
  const noReason = await tool("senses_set", { sense: "pain", threshold: 0.7 });
  assert(noReason.isError);

  const cfg = await store.config.get();
  assertEquals(cfg.senses.pain.threshold, 0.6);
  assertEquals(cfg.senses.pain.enabled, true);
  assertEquals(await store.audit(), []);
});

Deno.test("senses_set applies a legal change and senses_history returns rows", async () => {
  const { tool, store } = await setup();
  const r = await tool("senses_set", { sense: "pain", threshold: 0.7, reason: "calmer" });
  assertFalse(r.isError, r.text);
  assertEquals((await store.config.get()).senses.pain.threshold, 0.7);
  assertEquals((await store.audit()).length, 1);

  await store.record(await store.current(T0 + 2000));
  const h = await tool("senses_history", { sense: "pain" });
  const rows = JSON.parse(h.text);
  assertEquals(rows.length, 1);
  assertEquals(Object.keys(rows[0].values), ["pain"]);
});

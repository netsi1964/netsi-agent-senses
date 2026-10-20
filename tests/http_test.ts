import { assert, assertEquals } from "@std/assert";
import { createHandler } from "../src/http/server.ts";
import { defaultConfig } from "../src/core/config.ts";
import { SenseStore } from "../src/core/store.ts";
import { ev, T0, tempDir } from "./helpers.ts";

const TOKEN = "t0k3n";

async function setup() {
  const store = new SenseStore(await tempDir());
  await store.appendEvent(ev(0, "prompt"));
  const handler = createHandler({
    store,
    token: TOKEN,
    html: () => Promise.resolve("<!doctype html><title>x</title>"),
    now: () => T0 + 1000,
  });
  const req = (path: string, init: RequestInit & { host?: string } = {}) =>
    handler(
      new Request(`http://127.0.0.1:9999${path}`, {
        ...init,
        headers: { host: init.host ?? "127.0.0.1:9999", ...(init.headers ?? {}) },
      }),
    );
  return { store, req };
}

Deno.test("PRD-SEC-007: requests without the token or from a foreign host are refused", async () => {
  const { req } = await setup();
  assertEquals((await req("/api/state")).status, 401);
  assertEquals((await req("/api/state?token=wrong")).status, 401);
  assertEquals((await req(`/api/state?token=${TOKEN}`, { host: "evil.example:9999" })).status, 403);
  const ok = await req(`/?token=${TOKEN}`);
  assertEquals(ok.status, 200);
  assert(ok.headers.get("content-security-policy")?.includes("default-src 'none'"));
});

Deno.test("GET /api/state returns snapshot, config and history", async () => {
  const { req } = await setup();
  const body = await (await req(`/api/state?token=${TOKEN}`)).json();
  assertEquals(body.session, "s1");
  assertEquals(body.snapshot.senses.length, 4);
  assertEquals(body.config.senses.pain.threshold, 0.6);
  assertEquals(body.configError, null);
});

Deno.test("PUT /api/config: the human may change anything valid, and it is audited as human", async () => {
  const { req, store } = await setup();
  const config = defaultConfig();
  config.senses.smell.enabled = false;
  config.senses.pain.action = "block";
  const res = await req(`/api/config?token=${TOKEN}`, {
    method: "PUT",
    body: JSON.stringify({ config, reason: "too noisy" }),
  });
  assertEquals(res.status, 200);
  assertEquals((await store.config.get()).senses.smell.enabled, false);
  const audit = await store.audit();
  assertEquals(audit.map((a) => [a.actor, a.sense, a.reason]), [
    ["human", "pain", "too noisy"],
    ["human", "smell", "too noisy"],
  ]);

  const bad = structuredClone(config);
  bad.senses.pain.threshold = 7;
  const rejected = await req(`/api/config?token=${TOKEN}`, {
    method: "PUT",
    body: JSON.stringify({ config: bad }),
  });
  assertEquals(rejected.status, 400);
  assertEquals((await store.config.get()).senses.pain.threshold, 0.6);
});

Deno.test("PRD-FEAT-010.2: the audit log can be exported", async () => {
  const { req, store } = await setup();
  await store.agentSet("pain", { threshold: 0.7 }, "test", T0);
  const res = await req(`/api/audit/export?token=${TOKEN}`);
  assert(res.headers.get("content-disposition")?.includes("attachment"));
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  assertEquals(lines[0].actor, "agent");
});

Deno.test("SSE sends the state as a data event", async () => {
  const { req } = await setup();
  const ac = new AbortController();
  const res = await req(`/api/events?token=${TOKEN}`, { signal: ac.signal });
  assertEquals(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert(text.startsWith("data: "));
  assertEquals(JSON.parse(text.slice(6)).session, "s1");
  ac.abort();
  await reader.cancel();
});

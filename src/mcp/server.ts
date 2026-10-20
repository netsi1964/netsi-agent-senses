/**
 * MCP server over stdio (PRD-FEAT-005). Hand-rolled JSON-RPC so the plugin
 * has no runtime dependencies. Logs go to stderr; stdout is the protocol.
 *
 * Tools: senses_read, senses_set, senses_history.
 */

import { resolveDataDir } from "../core/paths.ts";
import { SenseStore } from "../core/store.ts";

export const SERVER_INFO = { name: "netsi-agent-senses", version: "0.1.0" };
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = "Your senses: pain (failing tool calls), interoception (context fullness), " +
  "time (session length, time since the user last spoke), smell (lint/check signals) and gut " +
  "(weighted overall feeling). Values are 0..1 with a confidence; low confidence means little " +
  "data. Call senses_read when unsure how the session is going. You may tune gain, threshold " +
  "and window with senses_set, only within the human-set bounds, and you must give a reason.";

export const TOOLS = [
  {
    name: "senses_read",
    title: "Read senses",
    description:
      "Current reading of every sense plus the gut feeling, as JSON. Includes each sense's " +
      "tunable settings and the bounds you may move them within.",
    inputSchema: {
      type: "object",
      properties: {
        session: { type: "string", description: "Session id. Default: the latest session." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "senses_set",
    title: "Tune a sense",
    description: "Change gain, threshold and/or window of one sense, within its human-set " +
      "bounds. You cannot change enabled, bounds or action. Every change is audited.",
    inputSchema: {
      type: "object",
      properties: {
        sense: { type: "string", description: "Sense id, e.g. pain" },
        gain: { type: "number" },
        threshold: { type: "number", minimum: 0, maximum: 1 },
        window: { type: "number", description: "Seconds" },
        reason: { type: "string", description: "Why you are changing it (shown to the human)" },
      },
      required: ["sense", "reason"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  {
    name: "senses_history",
    title: "Sense history",
    description: "Recent readings for trends, oldest first. Values are {v: value, c: confidence}.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max rows (default 30, max 500)" },
        sense: { type: "string", description: "Only this sense id" },
        session: { type: "string", description: "Only this session" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
];

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const text = (value: unknown, isError = false) => ({
  content: [{
    type: "text",
    text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
  }],
  isError,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export async function callTool(
  store: SenseStore,
  name: string,
  args: Record<string, unknown>,
  now: number,
) {
  switch (name) {
    case "senses_read": {
      const session = typeof args.session === "string" ? args.session : undefined;
      const snap = await store.current(now, session);
      const config = await store.config.get();
      return text({
        ts: snap.ts,
        session: snap.session,
        gut: snap.gut,
        senses: snap.senses.map((s) => {
          const c = config.senses[s.id];
          return {
            ...s,
            tunable: { gain: c.gain, threshold: c.threshold, window: c.window, bounds: c.bounds },
          };
        }),
      });
    }
    case "senses_set": {
      const { sense, reason, ...changes } = args;
      if (typeof sense !== "string") return text("sense is required", true);
      if (typeof reason !== "string" || !reason.trim()) return text("reason is required", true);
      const result = await store.agentSet(sense, changes, reason.trim().slice(0, 500), now);
      if (!result.ok) return text(`Rejected: ${result.error}`, true);
      if (result.applied.length === 0) return text("No change: values were already set.");
      return text({ changed: result.applied, sense });
    }
    case "senses_history": {
      const limit = Math.min(Math.max(Number(args.limit ?? 30) || 30, 1), 500);
      const session = typeof args.session === "string" ? args.session : undefined;
      let rows = await store.history({ limit, session });
      if (typeof args.sense === "string") {
        const id = args.sense;
        rows = rows.map((r) => ({ ...r, values: id in r.values ? { [id]: r.values[id] } : {} }));
      }
      return text(rows);
    }
    default:
      return null;
  }
}

/** Handle one JSON-RPC message. Returns null for notifications. */
export async function handle(
  store: SenseStore,
  msg: unknown,
  now: () => number = Date.now,
): Promise<JsonRpcResponse | null> {
  if (!isObject(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  }
  const req = msg as JsonRpcRequest;
  const isNotification = req.id === undefined;
  const id = req.id ?? null;
  const params = isObject(req.params) ? req.params : {};
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });

  switch (req.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
        ? asked
        : SUPPORTED_PROTOCOL_VERSIONS[0];
      return ok({
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const args = isObject(params.arguments) ? params.arguments : {};
      try {
        const result = await callTool(store, name, args, now());
        return result ? ok(result) : fail(-32602, `Unknown tool: ${name}`);
      } catch (err) {
        return ok(text(`Internal error: ${(err as Error).message}`, true));
      }
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized
      return fail(-32601, `Method not found: ${req.method}`);
  }
}

async function main() {
  const store = new SenseStore(resolveDataDir());
  const encoder = new TextEncoder();
  const write = (obj: unknown) => Deno.stdout.write(encoder.encode(JSON.stringify(obj) + "\n"));

  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        await write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      const res = await handle(store, msg);
      if (res) await write(res);
    }
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`[netsi-agent-senses mcp] ${err?.stack ?? err}`);
    Deno.exit(1);
  });
}

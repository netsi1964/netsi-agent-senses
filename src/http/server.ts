/**
 * Local dashboard server (PRD-FEAT-006.5, PRD-SEC-007).
 *
 * - Binds to 127.0.0.1 only, with a random token required on every request.
 * - Rejects foreign Host headers (DNS rebinding).
 * - Serves dashboard/index.html, a state API, SSE updates and audit export.
 * - Writes `dashboard.json` (url, pid) into the data folder for `/senses`.
 */

import { readEvents } from "../core/eventlog.ts";
import { resolveDataDir } from "../core/paths.ts";
import { SenseStore } from "../core/store.ts";

const HISTORY_ROWS = 120;
const AUDIT_ROWS = 50;
/** How often SSE checks for changes. Keeps dashboard and agent within 2 s (PRD-SEC-001 #3). */
const SSE_TICK_MS = 1000;
/** Send at least this often so time-based values move and proxies keep the stream. */
const SSE_HEARTBEAT_MS = 5000;

export type ServerOptions = {
  store: SenseStore;
  token: string;
  html: () => Promise<string>;
  now?: () => number;
};

export async function buildState(store: SenseStore, now: number) {
  const events = await readEvents(store.paths.events);
  const session = events.length ? events[events.length - 1].session : null;
  const snapshot = await store.current(now, session ?? undefined);
  const config = await store.config.get();
  return {
    now,
    session,
    snapshot,
    config,
    configError: store.config.lastError,
    history: await store.history({ limit: HISTORY_ROWS, session: session ?? undefined }),
    audit: await store.audit(AUDIT_ROWS),
  };
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
};

export function createHandler(opts: ServerOptions) {
  const now = opts.now ?? Date.now;
  const { store, token } = opts;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
    if (host !== "127.0.0.1" && host !== "localhost") {
      return new Response("forbidden host", { status: 403 });
    }
    if (!safeEqual(url.searchParams.get("token") ?? "", token)) {
      return new Response("missing or wrong token", { status: 401 });
    }

    if (req.method === "GET" && url.pathname === "/") {
      return new Response(await opts.html(), {
        headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
      });
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      return json(await buildState(store, now()));
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      return sse(store, now, req.signal);
    }
    if (req.method === "PUT" && url.pathname === "/api/config") {
      let body: { config?: unknown; reason?: unknown };
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, errors: ["body must be JSON"] }, 400);
      }
      const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";
      const result = await store.humanSet(body.config, reason, now());
      return json(result, result.ok ? 200 : 400);
    }
    if (req.method === "GET" && url.pathname === "/api/audit/export") {
      const entries = await store.audit();
      return new Response(entries.map((e) => JSON.stringify(e)).join("\n") + "\n", {
        headers: {
          "content-type": "application/x-ndjson",
          "content-disposition": `attachment; filename="senses-audit-${now()}.jsonl"`,
        },
      });
    }
    return new Response("not found", { status: 404 });
  };
}

function sse(store: SenseStore, now: () => number, signal: AbortSignal): Response {
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let last = "";
      let lastSent = 0;
      const tick = async () => {
        try {
          const state = await buildState(store, now());
          // Compare without `now` and ts so unchanged data is not resent every tick.
          const key = JSON.stringify({ ...state, now: 0, snapshot: { ...state.snapshot, ts: 0 } });
          const t = Date.now();
          if (key !== last || t - lastSent >= SSE_HEARTBEAT_MS) {
            last = key;
            lastSent = t;
            controller.enqueue(enc.encode(`data: ${JSON.stringify(state)}\n\n`));
          }
        } catch (err) {
          console.error(`[netsi-agent-senses dashboard] ${(err as Error).message}`);
        }
        if (!signal.aborted) timer = setTimeout(tick, SSE_TICK_MS);
      };
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        try {
          controller.close();
        } catch { /* already closed */ }
      });
      tick();
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

if (import.meta.main) {
  const store = new SenseStore(resolveDataDir());
  await store.config.ensureFile();
  const token = randomToken();
  const htmlPath = new URL("../../dashboard/index.html", import.meta.url);
  const port = Number(Deno.env.get("NETSI_SENSES_PORT") ?? 0);
  const server = Deno.serve(
    {
      hostname: "127.0.0.1",
      port,
      onListen: async ({ port }) => {
        const url = `http://127.0.0.1:${port}/?token=${token}`;
        await Deno.writeTextFile(
          `${store.paths.dir}/dashboard.json`,
          JSON.stringify({ url, port, pid: Deno.pid, started: Date.now() }, null, 2) + "\n",
        );
        console.log(url);
      },
    },
    createHandler({ store, token, html: () => Deno.readTextFile(htmlPath) }),
  );
  await server.finished;
}

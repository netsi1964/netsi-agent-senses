/**
 * Status line command for Claude Code (PRD-FEAT-007.4).
 *
 * Plugins cannot register a status line, so the user points `statusLine` in
 * their settings at this script (see README). The status line input carries the
 * exact context window size, which makes `interoception` fully confident.
 *
 * Prints e.g. `pain 0.80! · ctx 0.42 · time 0.10 · smell – · gut 0.51`.
 */

import { EVENT_SCHEMA_VERSION } from "../../core/event.ts";
import { resolveDataDir } from "../../core/paths.ts";
import { SenseStore } from "../../core/store.ts";
import { statusLine } from "../../core/engine.ts";
import { readEvents } from "../../core/eventlog.ts";

type StatusInput = {
  session_id?: string;
  context_window?: {
    context_window_size?: number;
    total_input_tokens?: number;
    current_usage?: {
      input_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | null;
  };
};

/** Context in use and window size from status line input, if present. */
export function contextFromStatus(
  input: StatusInput,
): { used: number; limit?: number } | undefined {
  const cw = input.context_window;
  const cu = cw?.current_usage;
  if (!cw || !cu || typeof cu.input_tokens !== "number") return undefined;
  const used = cu.input_tokens + (cu.cache_creation_input_tokens ?? 0) +
    (cu.cache_read_input_tokens ?? 0);
  const limit = typeof cw.context_window_size === "number" && cw.context_window_size > 0
    ? cw.context_window_size
    : undefined;
  return limit ? { used, limit } : { used };
}

export async function runStatusLine(input: StatusInput, store: SenseStore, now: number) {
  const session = typeof input.session_id === "string" && input.session_id
    ? input.session_id
    : undefined;
  const tokens = contextFromStatus(input);
  if (session && tokens) {
    // The status line refreshes often; only log when the numbers change.
    const events = await readEvents(store.paths.events, { session });
    const last = events.filter((e) => e.kind === "token_usage").pop();
    if (last?.tokens?.used !== tokens.used || last?.tokens?.limit !== tokens.limit) {
      await store.appendEvent({
        schemaVersion: EVENT_SCHEMA_VERSION,
        ts: now,
        session,
        kind: "token_usage",
        tokens,
        source: "claude-code",
      });
    }
  }
  return statusLine(await store.current(now, session));
}

if (import.meta.main) {
  let line = "senses –";
  try {
    const input = JSON.parse(await new Response(Deno.stdin.readable).text()) as StatusInput;
    line = await runStatusLine(input, new SenseStore(resolveDataDir()), Date.now());
  } catch (err) {
    console.error(`[netsi-agent-senses statusline] ${(err as Error)?.message ?? err}`);
  }
  console.log(line);
}

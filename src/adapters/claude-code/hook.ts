/**
 * Hook entry point for Claude Code (PRD-FEAT-007.1).
 *
 * Reads one hook payload on stdin, appends normalised events and a snapshot row.
 * It must never break the agent's session: every error is swallowed to stderr
 * and the process exits 0 with no output (interventions come with PRD-FEAT-008).
 */

import { resolveDataDir } from "../../core/paths.ts";
import { SenseStore } from "../../core/store.ts";
import { type HookPayload, normalize } from "./normalize.ts";
import { lastContextUsage } from "./transcript.ts";

/** Events after which the transcript is read for context usage. */
const READ_USAGE_ON = new Set(["UserPromptSubmit", "Stop"]);

export async function runHook(
  payload: HookPayload,
  store: SenseStore,
  now: number,
): Promise<void> {
  let tokens: { used: number } | undefined;
  if (
    READ_USAGE_ON.has(payload.hook_event_name ?? "") && typeof payload.transcript_path === "string"
  ) {
    const used = await lastContextUsage(payload.transcript_path);
    if (used !== undefined) tokens = { used };
  }
  const events = normalize(payload, now, tokens);
  if (events.length === 0) return;
  for (const e of events) await store.appendEvent(e);
  await store.record(await store.current(now, events[0].session));
}

async function main() {
  const raw = await new Response(Deno.stdin.readable).text();
  const payload = JSON.parse(raw) as HookPayload;
  await runHook(payload, new SenseStore(resolveDataDir()), Date.now());
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error(`[netsi-agent-senses hook] ${(err as Error)?.message ?? err}`);
  }
  Deno.exit(0);
}

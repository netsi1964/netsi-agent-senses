/**
 * Event log: validated append-only JSONL (PRD-FEAT-001.1, PRD-FEAT-001.2).
 */

import { type HarnessEvent, parseEvent } from "./event.ts";
import { appendJsonl, readJsonl, type RotationOptions } from "./jsonl.ts";

export type AppendResult = { ok: true } | { ok: false; error: string };

/** Validate and append. Invalid events are rejected with a reason, never thrown. */
export async function appendEvent(
  path: string,
  raw: unknown,
  rotation?: RotationOptions,
): Promise<AppendResult> {
  const parsed = parseEvent(raw);
  if (!parsed.ok) return parsed;
  await appendJsonl(path, parsed.event, rotation);
  return { ok: true };
}

/**
 * Read valid events in time order. Includes the most recent rotated file so a
 * rotation does not empty the sensors' sliding windows.
 */
export async function readEvents(
  path: string,
  opts: { session?: string; since?: number } = {},
): Promise<HarnessEvent[]> {
  const raw = [...await readJsonl(`${path}.1`), ...await readJsonl(path)];
  const out: HarnessEvent[] = [];
  for (const r of raw) {
    const p = parseEvent(r);
    if (!p.ok) continue;
    if (opts.session !== undefined && p.event.session !== opts.session) continue;
    if (opts.since !== undefined && p.event.ts < opts.since) continue;
    out.push(p.event);
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** The session of the most recent event, if any. */
export function latestSession(events: HarnessEvent[]): string | undefined {
  return events.length ? events[events.length - 1].session : undefined;
}

/**
 * Audit log (PRD-FEAT-010): who changed what, when and why.
 */

import { appendJsonl, readJsonl, type RotationOptions } from "./jsonl.ts";

export type Actor = "human" | "agent" | "system";
export type AuditType = "config_change" | "action" | "threshold_crossed";

export type AuditEntry = {
  ts: number;
  actor: Actor;
  type: AuditType;
  sense: string;
  from?: unknown;
  to?: unknown;
  reason: string;
};

export async function appendAudit(
  path: string,
  entry: AuditEntry,
  rotation?: RotationOptions,
): Promise<void> {
  await appendJsonl(path, entry, rotation);
}

const ACTORS = new Set(["human", "agent", "system"]);
const TYPES = new Set(["config_change", "action", "threshold_crossed"]);

function isEntry(v: unknown): v is AuditEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.ts === "number" && ACTORS.has(e.actor as string) &&
    TYPES.has(e.type as string) && typeof e.sense === "string" && typeof e.reason === "string";
}

/** Read audit entries, newest last, including the most recent rotated file. */
export async function readAudit(
  path: string,
  opts: { limit?: number } = {},
): Promise<AuditEntry[]> {
  const raw = [...await readJsonl(`${path}.1`), ...await readJsonl(path)];
  const entries = raw.filter(isEntry).sort((a, b) => a.ts - b.ts);
  return opts.limit ? entries.slice(-opts.limit) : entries;
}

/**
 * Normalised harness event format (PRD-FEAT-001).
 *
 * Every harness adapter turns its native hook/log payloads into this shape.
 * Sensors only ever see `HarnessEvent`, never a harness-specific payload.
 * Only metadata is carried: never prompt text, tool input or tool output.
 */

/** Bumped whenever the event shape changes incompatibly (PRD-FEAT-001.3). */
export const EVENT_SCHEMA_VERSION = 1;

export const EVENT_KINDS = [
  "prompt",
  "tool_call",
  "tool_result",
  "token_usage",
  "turn_end",
] as const;
export type EventKind = typeof EVENT_KINDS[number];

export const EVENT_SOURCES = ["claude-code", "codex"] as const;
export type EventSource = typeof EVENT_SOURCES[number];

export type HarnessEvent = {
  schemaVersion: number;
  /** Milliseconds since epoch. */
  ts: number;
  session: string;
  kind: EventKind;
  tool?: string;
  /** Only on `tool_result`. */
  ok?: boolean;
  exitCode?: number;
  tokens?: { used: number; limit?: number };
  /** Count of lint/anomaly signals seen in a tool result (feeds `smell`). */
  signals?: number;
  source: EventSource;
};

export type ParseResult =
  | { ok: true; event: HarnessEvent }
  | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Validate an unknown value as a `HarnessEvent` (PRD-FEAT-001.2).
 * Never throws. Unknown extra fields are dropped so nothing un-vetted is stored.
 */
export function parseEvent(raw: unknown): ParseResult {
  if (!isObject(raw)) return { ok: false, error: "event is not an object" };

  const { schemaVersion, ts, session, kind, tool, ok, exitCode, tokens, signals, source } = raw;

  if (schemaVersion !== EVENT_SCHEMA_VERSION) {
    return { ok: false, error: `unsupported schemaVersion: ${String(schemaVersion)}` };
  }
  if (!isFiniteNumber(ts) || ts < 0) {
    return { ok: false, error: "ts must be a non-negative number" };
  }
  if (typeof session !== "string" || session.length === 0 || session.length > 200) {
    return { ok: false, error: "session must be a non-empty string (max 200 chars)" };
  }
  if (typeof kind !== "string" || !(EVENT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: `unknown kind: ${String(kind)}` };
  }
  if (typeof source !== "string" || !(EVENT_SOURCES as readonly string[]).includes(source)) {
    return { ok: false, error: `unknown source: ${String(source)}` };
  }

  const event: HarnessEvent = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    ts,
    session,
    kind: kind as EventKind,
    source: source as EventSource,
  };

  if (tool !== undefined) {
    if (typeof tool !== "string" || tool.length > 200) {
      return { ok: false, error: "tool must be a string (max 200 chars)" };
    }
    event.tool = tool;
  }
  if (ok !== undefined) {
    if (typeof ok !== "boolean") return { ok: false, error: "ok must be a boolean" };
    if (kind !== "tool_result") return { ok: false, error: "ok is only allowed on tool_result" };
    event.ok = ok;
  }
  if (exitCode !== undefined) {
    if (!Number.isInteger(exitCode)) return { ok: false, error: "exitCode must be an integer" };
    event.exitCode = exitCode as number;
  }
  if (tokens !== undefined) {
    if (!isObject(tokens) || !isFiniteNumber(tokens.used) || tokens.used < 0) {
      return { ok: false, error: "tokens.used must be a non-negative number" };
    }
    if (tokens.limit !== undefined && (!isFiniteNumber(tokens.limit) || tokens.limit <= 0)) {
      return { ok: false, error: "tokens.limit must be a positive number" };
    }
    event.tokens = tokens.limit === undefined
      ? { used: tokens.used }
      : { used: tokens.used, limit: tokens.limit as number };
  }
  if (signals !== undefined) {
    if (!Number.isInteger(signals) || (signals as number) < 0) {
      return { ok: false, error: "signals must be a non-negative integer" };
    }
    event.signals = signals as number;
  }

  return { ok: true, event };
}

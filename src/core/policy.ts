/**
 * What the agent may change (PRD-FEAT-005.1, 005.2, PRD-FEAT-009.1, 009.2).
 *
 * SECURITY INVARIANT — never weaken:
 * - the agent may change only `gain`, `threshold` and `window`,
 * - only to values inside the human-set `bounds`,
 * - never `enabled`, `bounds` or `action`, so it can never switch a sense off.
 * Every relaxation of this file needs a test proving the invariant still holds.
 */

import { type SensesConfig, TUNABLE_FIELDS, type TunableField, validateConfig } from "./config.ts";

export type AgentChangeRequest = {
  sense: string;
  /** Any fields; anything other than a tunable field is rejected. */
  changes: Record<string, unknown>;
};

export type FieldChange = { field: TunableField; from: number; to: number };

export type AgentChangeResult =
  | { ok: true; config: SensesConfig; applied: FieldChange[] }
  | { ok: false; error: string };

/**
 * Apply an agent's change to a copy of `config`. Returns the new config or a
 * human-readable reason for rejection. The input config is never mutated.
 * All-or-nothing: one invalid field rejects the whole request.
 */
export function applyAgentChange(config: SensesConfig, req: AgentChangeRequest): AgentChangeResult {
  const current = config.senses[req.sense];
  if (!current) return { ok: false, error: `unknown sense: ${req.sense}` };

  const keys = Object.keys(req.changes ?? {});
  if (keys.length === 0) return { ok: false, error: "no changes given" };

  const forbidden = keys.filter((k) => !(TUNABLE_FIELDS as readonly string[]).includes(k));
  if (forbidden.length) {
    return {
      ok: false,
      error: `the agent may only change ${TUNABLE_FIELDS.join(", ")}; ` +
        `not allowed: ${forbidden.join(", ")} (only the human can change these)`,
    };
  }

  const applied: FieldChange[] = [];
  for (const key of keys as TunableField[]) {
    const to = req.changes[key];
    if (typeof to !== "number" || !Number.isFinite(to)) {
      return { ok: false, error: `${key} must be a finite number` };
    }
    const [min, max] = current.bounds[key];
    if (to < min || to > max) {
      return {
        ok: false,
        error: `${req.sense}.${key} = ${to} is outside the human-set bounds [${min}, ${max}]`,
      };
    }
    if (to !== current[key]) applied.push({ field: key, from: current[key], to });
  }

  const next = structuredClone(config);
  for (const c of applied) next.senses[req.sense][c.field] = c.to;

  const check = validateConfig(next);
  if (!check.ok) return { ok: false, error: check.errors.join("; ") };
  return { ok: true, config: next, applied };
}

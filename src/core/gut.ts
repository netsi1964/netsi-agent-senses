/**
 * `gut`: gut feeling, a weighted aggregate of the other senses (PRD-FEAT-003).
 */

import type { GutConfig } from "./config.ts";
import { clamp01, type Reading, round } from "./sensor.ts";

/** Below this confidence a high gut value is flagged as a guess (PRD-FEAT-003.2). */
export const LOW_CONFIDENCE = 0.5;

export type GutReading = Reading & {
  /** True when the value is at/over threshold but confidence is low. */
  uncertain: boolean;
  /** Ids of the senses that contributed to the value. */
  from: string[];
};

/**
 * @param readings readings of the enabled senses only (PRD-FEAT-003.3)
 */
export function gutFeeling(readings: Reading[], config: GutConfig, now: number): GutReading {
  const weightOf = (id: string) => config.weights[id] ?? 1;
  const all = readings.filter((r) => weightOf(r.id) > 0);
  // Senses with no data say nothing about the value; they only lower confidence.
  const measured = all.filter((r) => r.confidence > 0);

  const totalWeight = all.reduce((s, r) => s + weightOf(r.id), 0);
  const measuredWeight = measured.reduce((s, r) => s + weightOf(r.id), 0);

  const value = measuredWeight > 0
    ? measured.reduce((s, r) => s + r.value * weightOf(r.id), 0) / measuredWeight
    : 0;
  const confidence = totalWeight > 0
    ? all.reduce((s, r) => s + r.confidence * weightOf(r.id), 0) / totalWeight
    : 0;

  const v = round(clamp01(value));
  const c = round(clamp01(confidence));
  const over = c > 0 && v >= config.threshold;
  const uncertain = over && c < LOW_CONFIDENCE;

  const top = [...measured].sort((a, b) => b.value * weightOf(b.id) - a.value * weightOf(a.id))[0];
  let label: string;
  if (measured.length === 0) label = "no sense has data yet";
  else if (v < 0.3) label = "all calm";
  else if (v < config.threshold) label = `uneasy, mostly ${top.id}`;
  else label = `something is wrong, mostly ${top.id}`;
  if (uncertain) label += " (low confidence)";

  return {
    id: "gut",
    value: v,
    label,
    confidence: c,
    ts: now,
    triggered: over,
    uncertain,
    from: measured.map((r) => r.id),
  };
}

/**
 * Sensor interface (PRD-FEAT-002).
 *
 * A sensor is a pure function of the event list, its config and `now`.
 * No I/O and no clock reads inside a sensor.
 */

import type { HarnessEvent } from "./event.ts";
import type { SenseConfig } from "./config.ts";

export type Category = "classic" | "bodily" | "social" | "temporal";

export type Reading = {
  id: string;
  /** Normalised 0..1. */
  value: number;
  /** Short human-readable explanation, e.g. "3 of 5 calls failed". */
  label: string;
  /** 0..1. Missing data means low confidence, never an invented value. */
  confidence: number;
  ts: number;
  /** `value >= threshold` for an enabled sense. */
  triggered: boolean;
};

export type SensorInput = {
  /** Events of one session, in time order. */
  events: HarnessEvent[];
  config: SenseConfig;
  /** Milliseconds since epoch, passed in so sensors stay pure. */
  now: number;
};

export type SensorOutput = Pick<Reading, "value" | "label" | "confidence">;

export type Sensor = {
  id: string;
  /** The human sense it borrows from, e.g. "pain". */
  human: string;
  category: Category;
  compute(input: SensorInput): SensorOutput;
};

export const clamp01 = (
  n: number,
): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Round for stable output and readable JSON. */
export const round = (n: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/** Events within the sense's sliding window. */
export function inWindow(events: HarnessEvent[], config: SenseConfig, now: number): HarnessEvent[] {
  const since = now - config.window * 1000;
  return events.filter((e) => e.ts >= since && e.ts <= now);
}

/** Run a sensor and wrap its output as a full reading. */
export function read(sensor: Sensor, input: SensorInput): Reading {
  const out = sensor.compute(input);
  const value = round(clamp01(out.value));
  const confidence = round(clamp01(out.confidence));
  return {
    id: sensor.id,
    value,
    label: out.label,
    confidence,
    ts: input.now,
    triggered: input.config.enabled && confidence > 0 && value >= input.config.threshold,
  };
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

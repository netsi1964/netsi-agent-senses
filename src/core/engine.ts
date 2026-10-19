/**
 * Turns events + config into one snapshot of all senses. Pure; callers do the I/O.
 */

import type { HarnessEvent } from "./event.ts";
import type { SensesConfig } from "./config.ts";
import { type Category, read, type Reading, type Sensor } from "./sensor.ts";
import { gutFeeling, type GutReading } from "./gut.ts";
import { pain } from "./sensors/pain.ts";
import { interoception } from "./sensors/interoception.ts";
import { time } from "./sensors/time.ts";
import { smell } from "./sensors/smell.ts";

/** The V1 senses. Phase 3 senses are added here. */
export const SENSORS: Sensor[] = [pain, interoception, time, smell];

export type SenseState = Reading & {
  enabled: boolean;
  category: Category;
  human: string;
  threshold: number;
  action: SensesConfig["senses"][string]["action"];
};

export type Snapshot = {
  ts: number;
  session: string | null;
  senses: SenseState[];
  gut: GutReading;
};

/**
 * @param events events of the session to read (callers filter by session)
 */
export function snapshot(
  events: HarnessEvent[],
  config: SensesConfig,
  now: number,
  sensors: Sensor[] = SENSORS,
): Snapshot {
  const senses: SenseState[] = [];
  for (const sensor of sensors) {
    const cfg = config.senses[sensor.id];
    if (!cfg) continue;
    const reading = cfg.enabled
      ? read(sensor, { events, config: cfg, now })
      : { id: sensor.id, value: 0, label: "disabled", confidence: 0, ts: now, triggered: false };
    senses.push({
      ...reading,
      enabled: cfg.enabled,
      category: sensor.category,
      human: sensor.human,
      threshold: cfg.threshold,
      action: cfg.action,
    });
  }
  return {
    ts: now,
    session: events.length ? events[events.length - 1].session : null,
    senses,
    gut: gutFeeling(senses.filter((s) => s.enabled), config.gut, now),
  };
}

/** Compact one-line status, e.g. `pain 0.80 · ctx 0.90 · time 0.20 · gut 0.55`. */
export function statusLine(snap: Snapshot): string {
  const short: Record<string, string> = { interoception: "ctx" };
  const fmt = (r: { value: number; confidence: number; triggered: boolean }) =>
    r.confidence === 0 ? "–" : `${r.value.toFixed(2)}${r.triggered ? "!" : ""}`;
  const parts = snap.senses
    .filter((s) => s.enabled)
    .map((s) => `${short[s.id] ?? s.id} ${fmt(s)}`);
  parts.push(`gut ${fmt(snap.gut)}`);
  return parts.join(" · ");
}

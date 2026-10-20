/**
 * `smell`: lint and anomaly signals in recent tool results.
 * Only results that carry a `signals` count (i.e. where a linter or checker
 * ran) are measured; without them the sense has no confidence.
 */

import { inWindow, type Sensor } from "../sensor.ts";

/** Total signals at which the raw value reaches about 0.63 (1 - 1/e). */
const SIGNAL_SCALE = 5;
/** Measured results needed for full confidence. */
const RESULTS_FOR_FULL_CONFIDENCE = 3;

export const smell: Sensor = {
  id: "smell",
  human: "smell",
  category: "classic",
  compute({ events, config, now }) {
    const measured = inWindow(events, config, now).filter(
      (e) => e.kind === "tool_result" && e.signals !== undefined,
    );
    if (measured.length === 0) {
      return { value: 0, label: "no lint or checks in window", confidence: 0 };
    }
    // Only the latest run per tool counts, so fixing issues clears the smell.
    const latestPerTool = new Map<string, number>();
    for (const e of measured) latestPerTool.set(e.tool ?? "?", e.signals ?? 0);
    const total = [...latestPerTool.values()].reduce((a, b) => a + b, 0);
    return {
      value: (1 - Math.exp(-total / SIGNAL_SCALE)) * config.gain,
      label: `${total} lint/check signal${total === 1 ? "" : "s"} in latest runs`,
      confidence: Math.min(measured.length / RESULTS_FOR_FULL_CONFIDENCE, 1),
    };
  },
};

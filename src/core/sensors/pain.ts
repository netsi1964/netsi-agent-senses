/**
 * `pain`: share of failed tool results in the window, weighted towards
 * consecutive failures (a failure spiral hurts more than scattered errors).
 */

import { inWindow, type Sensor } from "../sensor.ts";

/** Consecutive trailing failures at which the streak part is at full strength. */
const STREAK_FULL = 3;
/** Results needed in the window for full confidence. */
const RESULTS_FOR_FULL_CONFIDENCE = 5;

export const pain: Sensor = {
  id: "pain",
  human: "pain",
  category: "bodily",
  compute({ events, config, now }) {
    const results = inWindow(events, config, now).filter(
      (e) => e.kind === "tool_result" && e.ok !== undefined,
    );
    if (results.length === 0) {
      return { value: 0, label: "no tool results in window", confidence: 0 };
    }
    const failed = results.filter((e) => !e.ok).length;
    let streak = 0;
    for (let i = results.length - 1; i >= 0 && !results[i].ok; i--) streak++;

    const rate = failed / results.length;
    const raw = 0.6 * rate + 0.4 * Math.min(streak / STREAK_FULL, 1);
    const streakText = streak > 1 ? `, last ${streak} in a row` : "";
    return {
      value: raw * config.gain,
      label: `${failed} of ${results.length} calls failed${streakText}`,
      confidence: Math.min(results.length / RESULTS_FOR_FULL_CONFIDENCE, 1),
    };
  },
};

/**
 * `interoception`: how full the context window is (used / limit).
 * Uses the most recent `token_usage` event in the window.
 */

import { inWindow, type Sensor } from "../sensor.ts";

/** Assumed limit when the harness reports usage but not the window size. */
export const ASSUMED_LIMIT = 200_000;

export const interoception: Sensor = {
  id: "interoception",
  human: "interoception",
  category: "bodily",
  compute({ events, config, now }) {
    const usage = inWindow(events, config, now).filter((e) => e.kind === "token_usage" && e.tokens);
    const last = usage[usage.length - 1];
    if (!last?.tokens) return { value: 0, label: "no token usage reported", confidence: 0 };

    const known = last.tokens.limit !== undefined;
    const limit = last.tokens.limit ?? ASSUMED_LIMIT;
    const ratio = last.tokens.used / limit;
    const kTokens = (n: number) => `${Math.round(n / 1000)}k`;
    return {
      value: ratio * config.gain,
      label: `${kTokens(last.tokens.used)} of ${kTokens(limit)} tokens${
        known ? "" : " (limit assumed)"
      }`,
      // An assumed limit may be wrong (e.g. 1M context), so it is only half trusted.
      confidence: known ? 1 : 0.5,
    };
  },
};

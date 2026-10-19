/**
 * `interoception`: how full the context window is (used / limit).
 * Uses the most recent `token_usage` event in the window. If that event has no
 * limit, the most recent known limit in the window is borrowed.
 */

import { inWindow, type Sensor } from "../sensor.ts";

/** Assumed limit when the harness never reports the window size. */
export const ASSUMED_LIMIT = 200_000;

export const interoception: Sensor = {
  id: "interoception",
  human: "interoception",
  category: "bodily",
  compute({ events, config, now }) {
    const usage = inWindow(events, config, now).filter((e) => e.kind === "token_usage" && e.tokens);
    const last = usage[usage.length - 1];
    if (!last?.tokens) return { value: 0, label: "no token usage reported", confidence: 0 };

    const knownLimit = last.tokens.limit ??
      usage.findLast((e) => e.tokens?.limit !== undefined)?.tokens?.limit;
    const limit = knownLimit ?? ASSUMED_LIMIT;
    // Reported now: fully trusted. Borrowed from earlier: the window size rarely
    // changes mid-session. Assumed: may be wrong (e.g. 1M context).
    const confidence = last.tokens.limit !== undefined ? 1 : knownLimit !== undefined ? 0.9 : 0.5;
    const kTokens = (n: number) => `${Math.round(n / 1000)}k`;
    const note = knownLimit === undefined ? " (limit assumed)" : "";
    return {
      value: (last.tokens.used / limit) * config.gain,
      label: `${kTokens(last.tokens.used)} of ${kTokens(limit)} tokens${note}`,
      confidence,
    };
  },
};

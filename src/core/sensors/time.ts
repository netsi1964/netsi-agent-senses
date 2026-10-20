/**
 * `time`: session length and time since the last user prompt.
 *
 * `window` is the session length that counts as "long" (value 1). Working
 * alone for a sixth of that since the last prompt also counts as "long".
 * Unlike the other senses, `time` looks at the whole session, not a window.
 */

import { formatDuration, type Sensor } from "../sensor.ts";

/** Fraction of `window` without a user prompt that counts as fully "long". */
const IDLE_FRACTION = 1 / 6;

export const time: Sensor = {
  id: "time",
  human: "sense of time",
  category: "temporal",
  compute({ events, config, now }) {
    const past = events.filter((e) => e.ts <= now);
    if (past.length === 0) return { value: 0, label: "no session activity", confidence: 0 };

    const age = now - past[0].ts;
    const prompts = past.filter((e) => e.kind === "prompt");
    const lastPrompt = prompts[prompts.length - 1];
    const windowMs = config.window * 1000;

    const ageRatio = age / windowMs;
    if (!lastPrompt) {
      return {
        value: ageRatio * config.gain,
        label: `session ${formatDuration(age)}, no user prompt seen`,
        confidence: 0.3,
      };
    }
    const idle = now - lastPrompt.ts;
    const idleRatio = idle / (windowMs * IDLE_FRACTION);
    return {
      value: Math.max(ageRatio, idleRatio) * config.gain,
      label: `session ${formatDuration(age)}, ${formatDuration(idle)} since last prompt`,
      confidence: 1,
    };
  },
};

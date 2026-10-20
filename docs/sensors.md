# Sensors

A sensor turns the event list of one session into a reading. Sensors are pure functions: no I/O and no
clock reads. `now` is passed in, which makes them testable without a harness.

## The interface

```ts
// src/core/sensor.ts
type Sensor = {
  id: string; // e.g. "pain"; also the key in senses.json
  human: string; // the human sense it borrows from
  category: "classic" | "bodily" | "social" | "temporal";
  compute(input: { events: HarnessEvent[]; config: SenseConfig; now: number }): {
    value: number; // raw; clamped to 0..1 for you
    label: string; // short, e.g. "3 of 5 calls failed"
    confidence: number; // 0..1
  };
};
```

`read(sensor, input)` wraps the output into a full `Reading` (`id`, `value`, `label`, `confidence`, `ts`,
`triggered`). A reading is `triggered` when the sense is enabled, has some confidence, and
`value >= threshold`.

Rules:

1. **Missing data means low confidence, never an invented value.** No events: `value 0, confidence 0`.
2. Apply `config.gain` to the raw value. Use `config.window` (seconds) through `inWindow()` unless the sense
   is about the whole session.
3. Labels are short and contain no content from the session (no paths, no commands).

## The V1 senses

| Sense | Value | Confidence |
|---|---|---|
| `pain` | `gain × (0.6 × failed/total + 0.4 × min(streak/3, 1))` over `tool_result` events in the window. `streak` = failures in a row at the end. | `min(results/5, 1)` |
| `interoception` | `gain × used / limit` from the latest `token_usage`. If the limit is unknown, the latest known limit in the window is borrowed, else 200k is assumed. | 1 reported, 0.9 borrowed, 0.5 assumed |
| `time` | `gain × max(age / window, idle / (window / 6))`. `age` = session length, `idle` = time since the last prompt. With the default 2 h window, 20 min alone also counts as "long". | 1 with a prompt, 0.3 without |
| `smell` | `gain × (1 − e^(−signals/5))`, where `signals` is the sum of the latest lint/check run per tool in the window | `min(measured results/3, 1)` |
| `gut` | Weighted average of the enabled senses that have data; weights in `gut.weights` | Weighted average of all enabled senses' confidence. A value over threshold with confidence < 0.5 is flagged `uncertain`. |

## Adding a sense

1. Create `src/core/sensors/<id>.ts` exporting a `Sensor`.
2. Add it to `SENSORS` in `src/core/engine.ts`.
3. Add defaults (with narrow bounds) to `defaultConfig()` in `src/core/config.ts`.
4. If it needs new data, add an optional field to `HarnessEvent` (bump `EVENT_SCHEMA_VERSION` only for
   incompatible changes) and teach each adapter to fill it.
5. Write tests: no-data confidence, purity, and a recorded scenario in `tests/fixtures/`.

import type { HarnessEvent } from "../src/core/event.ts";

export const T0 = 1760900000000;

/** Build a valid event at `T0 + seconds`. */
export function ev(
  seconds: number,
  kind: HarnessEvent["kind"],
  extra: Partial<HarnessEvent> = {},
): HarnessEvent {
  return {
    schemaVersion: 1,
    ts: T0 + seconds * 1000,
    session: "s1",
    kind,
    source: "claude-code",
    ...extra,
  };
}

/** Temp dir inside the only folder tests may write to. */
export async function tempDir(): Promise<string> {
  await Deno.mkdir(".netsi-agent-senses", { recursive: true });
  return await Deno.makeTempDir({ dir: ".netsi-agent-senses", prefix: "test-" });
}

export const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

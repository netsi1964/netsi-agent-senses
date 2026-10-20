/**
 * Read context usage from a Claude Code transcript (JSONL).
 *
 * Verified on 2026-10-19 against a real transcript: assistant lines carry
 * `message.usage.{input_tokens, cache_read_input_tokens, cache_creation_input_tokens}`.
 * Context in use = input + cache read + cache creation (output excluded),
 * the same formula the status line uses. Only the numbers are read.
 */

/** Only the tail is read; usage is on recent lines. */
const TAIL_BYTES = 512 * 1024;

type Usage = {
  input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

export function usageFromLine(line: string): number | undefined {
  // Cheap pre-filter before parsing.
  if (!line.includes('"usage"') || !line.includes('"assistant"')) return undefined;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (d.type !== "assistant" || d.isSidechain === true) return undefined;
  const usage = (d.message as { usage?: Usage } | undefined)?.usage;
  if (!usage || typeof usage.input_tokens !== "number") return undefined;
  return usage.input_tokens + (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
}

/** Latest context usage in the transcript, or undefined if none found. */
export async function lastContextUsage(path: string): Promise<number | undefined> {
  let file: Deno.FsFile;
  try {
    file = await Deno.open(path, { read: true });
  } catch {
    return undefined;
  }
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - TAIL_BYTES);
    await file.seek(start, Deno.SeekMode.Start);
    const buf = new Uint8Array(size - start);
    let read = 0;
    while (read < buf.length) {
      const n = await file.read(buf.subarray(read));
      if (n === null) break;
      read += n;
    }
    const lines = new TextDecoder().decode(buf.subarray(0, read)).split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const used = usageFromLine(lines[i]);
      if (used !== undefined) return used;
    }
    return undefined;
  } finally {
    file.close();
  }
}

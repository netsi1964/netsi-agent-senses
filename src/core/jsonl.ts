/**
 * Append-only JSONL files with size-based rotation (PRD-FEAT-001.1, PRD-FEAT-010.3).
 */

export type RotationOptions = {
  /** Rotate when the file is larger than this many bytes before an append. */
  maxBytes: number;
  /** How many rotated files (`file.1` .. `file.N`) to keep. */
  keep: number;
};

export const DEFAULT_ROTATION: RotationOptions = { maxBytes: 5 * 1024 * 1024, keep: 3 };

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    throw err;
  }
}

async function ensureDirFor(path: string): Promise<void> {
  const slash = path.lastIndexOf("/");
  if (slash > 0) await Deno.mkdir(path.slice(0, slash), { recursive: true });
}

/** Rotate `path` to `path.1`, shifting older files up and dropping the oldest. */
export async function rotate(path: string, keep: number): Promise<void> {
  if (keep < 1) {
    await Deno.remove(path).catch(() => {});
    return;
  }
  await Deno.remove(`${path}.${keep}`).catch(() => {});
  for (let i = keep - 1; i >= 1; i--) {
    if (await exists(`${path}.${i}`)) await Deno.rename(`${path}.${i}`, `${path}.${i + 1}`);
  }
  if (await exists(path)) await Deno.rename(path, `${path}.1`);
}

/** Append one record as a single JSON line, rotating first if the file is too big. */
export async function appendJsonl(
  path: string,
  record: unknown,
  rotation: RotationOptions = DEFAULT_ROTATION,
): Promise<void> {
  await ensureDirFor(path);
  try {
    const { size } = await Deno.stat(path);
    if (size > rotation.maxBytes) await rotate(path, rotation.keep);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  // One write call per line with O_APPEND keeps concurrent hook writers from interleaving.
  await Deno.writeTextFile(path, JSON.stringify(record) + "\n", { append: true, create: true });
}

/**
 * Read every parseable JSON line. Broken lines (e.g. a torn write) are skipped,
 * never thrown, so one bad line cannot take the core down.
 */
export async function readJsonl(path: string): Promise<unknown[]> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return [];
    throw err;
  }
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // skip torn or corrupt line
    }
  }
  return out;
}

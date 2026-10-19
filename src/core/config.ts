/**
 * Sense configuration, `senses.json` (PRD-FEAT-004).
 *
 * One file is the source of truth for hooks, the MCP server and the dashboard.
 * A user file may be partial: missing senses and fields fall back to defaults.
 */

export const CONFIG_SCHEMA_VERSION = 1;

export const ACTIONS = ["inform", "warn", "block", "influence"] as const;
export type Action = typeof ACTIONS[number];

/** The fields the agent may tune, within bounds (PRD-FEAT-009.1). */
export const TUNABLE_FIELDS = ["gain", "threshold", "window"] as const;
export type TunableField = typeof TUNABLE_FIELDS[number];

export type Range = [number, number];

export type SenseConfig = {
  enabled: boolean;
  /** Amplification applied to the raw value before clamping to 0..1. */
  gain: number;
  /** 0..1, the value at which the sense triggers. */
  threshold: number;
  /** Sliding window in seconds. */
  window: number;
  /** Set by the human only (PRD-FEAT-009). */
  bounds: Record<TunableField, Range>;
  action: Action;
};

export type GutConfig = {
  /** Relative weight per sense id. Missing ids weigh 1. */
  weights: Record<string, number>;
  threshold: number;
};

export type SensesConfig = {
  schemaVersion: number;
  senses: Record<string, SenseConfig>;
  gut: GutConfig;
};

/**
 * Shipped defaults (PRD-FEAT-004.3). Bounds are deliberately narrow so a fresh
 * install does not give the agent full freedom (PRD-FEAT-009.4).
 */
export function defaultConfig(): SensesConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    senses: {
      pain: {
        enabled: true,
        gain: 1,
        threshold: 0.6,
        window: 300,
        bounds: { gain: [0.75, 1.5], threshold: [0.4, 0.85], window: [120, 900] },
        action: "warn",
      },
      interoception: {
        enabled: true,
        gain: 1,
        threshold: 0.8,
        window: 3600,
        bounds: { gain: [0.9, 1.25], threshold: [0.65, 0.9], window: [600, 7200] },
        action: "warn",
      },
      time: {
        enabled: true,
        gain: 1,
        threshold: 0.75,
        window: 7200,
        bounds: { gain: [0.75, 1.5], threshold: [0.5, 0.9], window: [1800, 14400] },
        action: "inform",
      },
      smell: {
        enabled: true,
        gain: 1,
        threshold: 0.5,
        window: 900,
        bounds: { gain: [0.75, 1.5], threshold: [0.3, 0.8], window: [300, 3600] },
        action: "inform",
      },
    },
    gut: {
      weights: { pain: 1.5, interoception: 1, time: 0.5, smell: 1 },
      threshold: 0.6,
    },
  };
}

export type ValidationResult =
  | { ok: true; config: SensesConfig }
  | { ok: false; errors: string[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function validateRange(v: unknown, where: string, errors: string[]): v is Range {
  if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) {
    errors.push(`${where} must be [min, max]`);
    return false;
  }
  if (v[0] > v[1]) {
    errors.push(`${where} min must be <= max`);
    return false;
  }
  return true;
}

function validateSense(id: string, s: unknown, errors: string[]): s is SenseConfig {
  const at = `senses.${id}`;
  const before = errors.length;
  if (!isObject(s)) {
    errors.push(`${at} must be an object`);
    return false;
  }
  if (typeof s.enabled !== "boolean") errors.push(`${at}.enabled must be a boolean`);
  if (!isNum(s.gain) || s.gain <= 0 || s.gain > 10) errors.push(`${at}.gain must be in (0, 10]`);
  if (!isNum(s.threshold) || s.threshold < 0 || s.threshold > 1) {
    errors.push(`${at}.threshold must be in [0, 1]`);
  }
  if (!isNum(s.window) || s.window <= 0 || s.window > 7 * 24 * 3600) {
    errors.push(`${at}.window must be seconds in (0, 604800]`);
  }
  if (typeof s.action !== "string" || !(ACTIONS as readonly string[]).includes(s.action)) {
    errors.push(`${at}.action must be one of ${ACTIONS.join(", ")}`);
  }
  if (!isObject(s.bounds)) {
    errors.push(`${at}.bounds must be an object`);
  } else {
    for (const f of TUNABLE_FIELDS) {
      const r = s.bounds[f];
      if (validateRange(r, `${at}.bounds.${f}`, errors) && isNum(s[f])) {
        if ((s[f] as number) < r[0] || (s[f] as number) > r[1]) {
          errors.push(`${at}.${f} (${s[f]}) is outside its bounds [${r[0]}, ${r[1]}]`);
        }
      }
    }
  }
  return errors.length === before;
}

/** Validate a complete config object. */
export function validateConfig(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) return { ok: false, errors: ["config must be an object"] };
  if (raw.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion: ${String(raw.schemaVersion)}`);
  }
  if (!isObject(raw.senses)) {
    errors.push("senses must be an object");
  } else {
    for (const [id, s] of Object.entries(raw.senses)) validateSense(id, s, errors);
  }
  if (!isObject(raw.gut)) {
    errors.push("gut must be an object");
  } else {
    if (!isObject(raw.gut.weights)) errors.push("gut.weights must be an object");
    else {
      for (const [id, w] of Object.entries(raw.gut.weights)) {
        if (!isNum(w) || w < 0) errors.push(`gut.weights.${id} must be a non-negative number`);
      }
    }
    if (!isNum(raw.gut.threshold) || raw.gut.threshold < 0 || raw.gut.threshold > 1) {
      errors.push("gut.threshold must be in [0, 1]");
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, config: raw as SensesConfig };
}

/** Fill a partial user config from defaults, then validate (PRD-FEAT-004.3). */
export function resolveConfig(raw: unknown): ValidationResult {
  if (!isObject(raw)) return { ok: false, errors: ["config must be an object"] };
  const d = defaultConfig();
  const senses: Record<string, unknown> = { ...d.senses };
  if (raw.senses !== undefined) {
    if (!isObject(raw.senses)) return { ok: false, errors: ["senses must be an object"] };
    for (const [id, s] of Object.entries(raw.senses)) {
      const base = d.senses[id];
      if (base && isObject(s)) {
        senses[id] = {
          ...base,
          ...s,
          bounds: { ...base.bounds, ...(isObject(s.bounds) ? s.bounds : {}) },
        };
      } else {
        senses[id] = s;
      }
    }
  }
  const gutRaw = isObject(raw.gut) ? raw.gut : {};
  const merged = {
    schemaVersion: raw.schemaVersion ?? d.schemaVersion,
    senses,
    gut: {
      ...d.gut,
      ...gutRaw,
      weights: { ...d.gut.weights, ...(isObject(gutRaw.weights) ? gutRaw.weights : {}) },
    },
  };
  return validateConfig(merged);
}

/**
 * Loads `senses.json` and picks up edits without a restart (PRD-FEAT-004.1).
 * An invalid file never replaces the last valid config (PRD-FEAT-004.2).
 */
export class ConfigStore {
  #path: string;
  #config: SensesConfig = defaultConfig();
  #mtime: number | null = null;
  #lastError: string[] | null = null;

  constructor(path: string) {
    this.#path = path;
  }

  get path(): string {
    return this.#path;
  }

  /** Errors from the most recent load attempt, or null if it was valid. */
  get lastError(): string[] | null {
    return this.#lastError;
  }

  /** Current config, reloading from disk if the file changed. */
  async get(): Promise<SensesConfig> {
    let stat: Deno.FileInfo;
    try {
      stat = await Deno.stat(this.#path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        // No file yet: defaults, or the last valid config if the file was removed.
        return structuredClone(this.#config);
      }
      throw err;
    }
    const mtime = stat.mtime?.getTime() ?? 0;
    if (mtime !== this.#mtime) {
      this.#mtime = mtime;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await Deno.readTextFile(this.#path));
      } catch (err) {
        this.#lastError = [`could not parse ${this.#path}: ${(err as Error).message}`];
        return structuredClone(this.#config);
      }
      const result = resolveConfig(parsed);
      if (result.ok) {
        this.#config = result.config;
        this.#lastError = null;
      } else {
        this.#lastError = result.errors;
      }
    }
    return structuredClone(this.#config);
  }

  /** Write a full, valid config atomically (temp file + rename). */
  async write(config: SensesConfig): Promise<void> {
    const result = validateConfig(config);
    if (!result.ok) {
      throw new Error(`refusing to write invalid config: ${result.errors.join("; ")}`);
    }
    const dir = this.#path.slice(0, this.#path.lastIndexOf("/"));
    if (dir) await Deno.mkdir(dir, { recursive: true });
    const tmp = `${this.#path}.${crypto.randomUUID()}.tmp`;
    await Deno.writeTextFile(tmp, JSON.stringify(config, null, 2) + "\n");
    await Deno.rename(tmp, this.#path);
    this.#config = structuredClone(config);
    this.#mtime = (await Deno.stat(this.#path)).mtime?.getTime() ?? null;
    this.#lastError = null;
  }

  /** Create the file with defaults if it does not exist yet. */
  async ensureFile(): Promise<void> {
    try {
      await Deno.stat(this.#path);
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err;
      await this.write(defaultConfig());
    }
  }
}

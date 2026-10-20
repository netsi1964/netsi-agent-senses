/**
 * I/O facade shared by hooks, the MCP server and the dashboard server.
 * Everything that touches disk goes through here; sensors stay pure.
 */

import { appendAudit, readAudit } from "./audit.ts";
import { ConfigStore, type SensesConfig, validateConfig } from "./config.ts";
import { type Snapshot, snapshot } from "./engine.ts";
import { appendEvent, type AppendResult, latestSession, readEvents } from "./eventlog.ts";
import { appendJsonl, readJsonl } from "./jsonl.ts";
import { type DataPaths, dataPaths } from "./paths.ts";
import { applyAgentChange, type FieldChange } from "./policy.ts";

/** One row of `readings.jsonl`: values only, keyed by sense id. */
export type HistoryRow = {
  ts: number;
  session: string | null;
  values: Record<string, { v: number; c: number }>;
};

export type SetResult = { ok: true; applied: FieldChange[] } | { ok: false; error: string };

export class SenseStore {
  readonly paths: DataPaths;
  readonly config: ConfigStore;

  constructor(dir: string) {
    this.paths = dataPaths(dir);
    this.config = new ConfigStore(this.paths.config);
  }

  appendEvent(raw: unknown): Promise<AppendResult> {
    return appendEvent(this.paths.events, raw);
  }

  /** Snapshot of one session (default: the session with the latest event). */
  async current(now: number, session?: string): Promise<Snapshot> {
    const config = await this.config.get();
    const all = await readEvents(this.paths.events);
    const sid = session ?? latestSession(all);
    const events = sid === undefined ? [] : all.filter((e) => e.session === sid);
    return snapshot(events, config, now);
  }

  /** Append a compact snapshot row for trends (PRD-FEAT-010.1). */
  async record(snap: Snapshot): Promise<void> {
    const values: HistoryRow["values"] = {};
    for (const s of snap.senses) if (s.enabled) values[s.id] = { v: s.value, c: s.confidence };
    values.gut = { v: snap.gut.value, c: snap.gut.confidence };
    const row: HistoryRow = { ts: snap.ts, session: snap.session, values };
    await appendJsonl(this.paths.readings, row);
  }

  async history(opts: { limit?: number; session?: string } = {}): Promise<HistoryRow[]> {
    const raw = [
      ...await readJsonl(`${this.paths.readings}.1`),
      ...await readJsonl(this.paths.readings),
    ];
    let rows = raw.filter((r): r is HistoryRow =>
      typeof r === "object" && r !== null && typeof (r as HistoryRow).ts === "number" &&
      typeof (r as HistoryRow).values === "object"
    );
    if (opts.session !== undefined) rows = rows.filter((r) => r.session === opts.session);
    rows.sort((a, b) => a.ts - b.ts);
    return opts.limit ? rows.slice(-opts.limit) : rows;
  }

  audit(limit?: number) {
    return readAudit(this.paths.audit, { limit });
  }

  /**
   * Agent self-adjustment via MCP. Enforced by `applyAgentChange`
   * (PRD-FEAT-009); every applied change is audited.
   */
  async agentSet(
    sense: string,
    changes: Record<string, unknown>,
    reason: string,
    now: number,
  ): Promise<SetResult> {
    const config = await this.config.get();
    const result = applyAgentChange(config, { sense, changes });
    if (!result.ok) return result;
    if (result.applied.length) {
      await this.config.write(result.config);
      for (const c of result.applied) {
        await appendAudit(this.paths.audit, {
          ts: now,
          actor: "agent",
          type: "config_change",
          sense,
          from: { [c.field]: c.from },
          to: { [c.field]: c.to },
          reason: reason || "no reason given",
        });
      }
    }
    return { ok: true, applied: result.applied };
  }

  /**
   * Human change from the dashboard: any field may change, but the result must
   * be valid. Each changed field is audited with actor "human".
   */
  async humanSet(
    next: unknown,
    reason: string,
    now: number,
  ): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    const check = validateConfig(next);
    if (!check.ok) return check;
    const before = await this.config.get();
    await this.config.write(check.config);
    for (const d of diffConfig(before, check.config)) {
      await appendAudit(this.paths.audit, {
        ts: now,
        actor: "human",
        type: "config_change",
        sense: d.sense,
        from: { [d.field]: d.from },
        to: { [d.field]: d.to },
        reason: reason || "changed in dashboard",
      });
    }
    return { ok: true };
  }
}

type Diff = { sense: string; field: string; from: unknown; to: unknown };

/** Field-level differences between two configs (per sense, plus `gut`). */
export function diffConfig(a: SensesConfig, b: SensesConfig): Diff[] {
  const out: Diff[] = [];
  const ids = new Set([...Object.keys(a.senses), ...Object.keys(b.senses)]);
  for (const id of ids) {
    const x = a.senses[id] as Record<string, unknown> | undefined;
    const y = b.senses[id] as Record<string, unknown> | undefined;
    const fields = new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})]);
    for (const f of fields) {
      if (JSON.stringify(x?.[f]) !== JSON.stringify(y?.[f])) {
        out.push({ sense: id, field: f, from: x?.[f], to: y?.[f] });
      }
    }
  }
  if (JSON.stringify(a.gut) !== JSON.stringify(b.gut)) {
    out.push({ sense: "gut", field: "gut", from: a.gut, to: b.gut });
  }
  return out;
}

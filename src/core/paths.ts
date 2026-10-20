/**
 * Where runtime data lives. Everything sits in one folder per project:
 * `<project>/.netsi-agent-senses/` (git-ignored), or `$NETSI_SENSES_DIR` if set.
 */

export type DataPaths = {
  dir: string;
  events: string;
  audit: string;
  /** Compact snapshot history for trends and sparklines. */
  readings: string;
  config: string;
  /** Pending human override for `block` (PRD-FEAT-008.2). */
  override: string;
};

export function dataPaths(dir: string): DataPaths {
  const d = dir.replace(/\/+$/, "");
  return {
    dir: d,
    events: `${d}/events.jsonl`,
    audit: `${d}/audit.jsonl`,
    readings: `${d}/readings.jsonl`,
    config: `${d}/senses.json`,
    override: `${d}/override.json`,
  };
}

/** Resolve the data folder from the environment (hooks, MCP server and dashboard all agree). */
export function resolveDataDir(env: { get(key: string): string | undefined } = Deno.env): string {
  const explicit = env.get("NETSI_SENSES_DIR");
  if (explicit) return explicit;
  const project = env.get("CLAUDE_PROJECT_DIR") ?? Deno.cwd();
  return `${project.replace(/\/+$/, "")}/.netsi-agent-senses`;
}

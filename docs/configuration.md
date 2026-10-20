# Configuration

`.netsi-agent-senses/senses.json` in your project is the single source of truth for hooks, the MCP server
and the dashboard. Set `NETSI_SENSES_DIR` to keep the data somewhere else.

## Fields per sense

| Field | Who may change it | Meaning |
|---|---|---|
| `enabled` | human | Off means no reading and no part in `gut` |
| `gain` | human, agent within bounds | Multiplies the raw value before it is clamped to 0..1 |
| `threshold` | human, agent within bounds | Value at which the sense triggers |
| `window` | human, agent within bounds | Sliding window in seconds (`time`: the session length that counts as long) |
| `bounds` | human | `[min, max]` for `gain`, `threshold` and `window`: the agent's room |
| `action` | human | `inform`, `warn`, `block` or `influence` (interventions are not built yet) |

`gut` has `weights` (per sense id, default 1) and a `threshold`.

## Examples

A partial file is enough. This makes `pain` more sensitive and gives the agent more room on it:

```json
{
  "senses": {
    "pain": {
      "threshold": 0.5,
      "bounds": { "threshold": [0.3, 0.9] }
    }
  }
}
```

Turn `smell` off for a project without linters, and weigh context more in the gut feeling:

```json
{
  "senses": { "smell": { "enabled": false } },
  "gut": { "weights": { "interoception": 2 } }
}
```

## Validation

- Values must sit inside their own bounds, and `min <= max`.
- `threshold` is 0..1, `gain` is in (0, 10], `window` is in (0, 7 days].
- An invalid file is ignored and the last valid config stays in use. The dashboard shows why.

## Files in `.netsi-agent-senses/`

| File | Content |
|---|---|
| `senses.json` | Config |
| `events.jsonl` | Normalised events (metadata only) |
| `readings.jsonl` | One snapshot row per event, for history |
| `audit.jsonl` | Config changes: who, when, from, to, why |
| `dashboard.json` | URL and pid of the running dashboard |

JSONL files rotate at 5 MB and keep three old files.

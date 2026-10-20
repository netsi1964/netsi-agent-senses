---
description: Show how the session feels (pain, context, time, smell, gut) and open the senses dashboard
allowed-tools: Bash(netsi-senses-dashboard), mcp__plugin_netsi-agent-senses_senses__senses_read
---

Show the user the current state of the netsi-agent-senses senses.

1. Call the `senses_read` MCP tool.
2. Run `netsi-senses-dashboard` with Bash. It prints the local dashboard URL (it starts the server if needed).
3. Reply with:
   - a real markdown table with one row per sense: sense, value (2 decimals), confidence, label, and "over threshold" when `triggered` is true,
   - a final row for `gut`, noting "low confidence" when `uncertain` is true,
   - the dashboard URL as a clickable link.

Keep it short. Do not change any setting from this command.

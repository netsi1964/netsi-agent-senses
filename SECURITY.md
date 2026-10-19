# Security Policy

This project can inject text into an agent's context, block tool calls and adjust agent settings, so
security reports are taken seriously.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
(Security tab, "Report a vulnerability") for this repository.

## In scope

- The agent changing `enabled`, `bounds` or `action`, or exceeding `bounds` through MCP
- A `block` action that cannot be overridden
- Prompt injection through injected status text or logs
- The dashboard server reachable from outside `127.0.0.1`
- Sensitive content (prompts, file contents, paths) ending up in logs

## Not in scope

Vulnerabilities in the underlying harness (Claude Code, Codex) itself. Report those to their vendors.

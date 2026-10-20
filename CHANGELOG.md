# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- Event format with `schemaVersion`, validation and append-only JSONL log with rotation (PRD-FEAT-001, 010.3).
- Sensor interface and the four V1 senses `pain`, `interoception`, `time`, `smell` (PRD-FEAT-002).
- `gut` aggregator with confidence and an `uncertain` flag (PRD-FEAT-003).
- `senses.json` with defaults, partial files, hot reload and last-valid fallback (PRD-FEAT-004).
- Stdio MCP server: `senses_read`, `senses_set`, `senses_history` (PRD-FEAT-005).
- Local dashboard server (127.0.0.1, token, SSE) and single-file dashboard (PRD-FEAT-006).
- Claude Code hooks adapter, status line script, `/senses` command and `senses` skill (PRD-FEAT-007).
- Agent self-adjustment limited to human-set bounds, with audit log and export (PRD-FEAT-009, 010).
- Docs: sensors, adapters, configuration.
- Feature tour slides in `site/`, published to GitHub Pages by `.github/workflows/pages.yml`.
- PRD v0.3: `signals` event field, `time` formula, status line note.
- PRD v0.2 in `development/PRD.md`.
- Repo scaffolding: licence, contributor and security docs, AI-agent instructions, plugin manifest, CI.

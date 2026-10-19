# Contributing

Thanks for helping. This project is pre-alpha, so the most useful contributions right now are
feedback on the PRD and small, focused changes.

1. Read `development/PRD.md` and `AGENTS.md` first.
2. Open an issue before large changes, so we agree on scope against the PRD.
3. Keep PRs small and reference the PRD ID, e.g. `feat(PRD-FEAT-002): add pain sensor`.
4. Add tests. Sensors are pure functions and must be testable without a harness.
5. Run `deno task lint` and `deno task test` before pushing.
6. Changes to the security invariants (PRD-FEAT-009) need a test that proves they still hold.

By contributing you agree that your contribution is licensed under Apache-2.0.

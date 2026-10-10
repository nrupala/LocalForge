# Changelog

All notable changes to LocalForge are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Portfolio certification rollout: NOTICE (attribution) added; AGPL-3.0
  SPDX license headers added to source files; version bumped to 0.2.1
  (patch); PR-flow discipline section in CONTRIBUTING.md (no direct pushes
  to master; CHANGELOG entry under Unreleased per PR; merge commits
  reference PR numbers; releases tagged vX.Y.Z).
- Editions as license flags (`src/edition.ts`): Founder Workshop, LocalForge
  Complete (bundle), Air-gap Enterprise, Perpetual — one codebase, no forks.
  Resolved from `LOCALFORGE_EDITION` / `LOCALFORGE_VERIFICATION`.
- Verification layer (`src/verification.ts`): the Tester step mints a
  hash-chained proof certificate per workflow run, with honest scope labeling
  and `verifyCertificate()` for independent re-checks.
- Agent-native endpoints on the Web UI server: `/.well-known/localforge.json`
  capability document, `/llms.txt`, `GET /api/edition`; `GET /api/health` now
  reports version, edition, and verification status.
- `localforge edition` CLI command listing the active edition and commercial tiers.
- Benchmark suite (`npm run benchmark`, `scripts/benchmark/run.js`) enforcing
  the Muse-quality bar in `BENCHMARK.md` (compiles clean, tests produced, no
  placeholders, edge cases handled, certificate chain verifies); CI gates on it.
- `HANDSHAKE.md`: API/MCP/ACP interop design for sibling AIMLDS tools
  (AxiomCode, SAIC, KalaBodha, Research Analyst).
- New pricing: Self-Hosted $0 · Pro $30/mo · Complete $45/mo ·
  Enterprise $60/user/mo · Perpetual $375 · Verification add-on $15/mo.

### Changed
- `src/Workflow.ts`: `WorkflowResult` gains an optional `certificate`.
- `src/providers/DemoProvider.ts`: role-specific demo branches are matched
  before generic keywords (workflow context carries prior agent outputs);
  deterministic writer fixture.
- `src/server.ts`: edition in the startup banner; `EADDRINUSE` handled with a
  clear message instead of a stack trace.
- `README.md` and `docs/index.html`: pricing tables, editions, verification,
  and agent-endpoint sections refreshed.

## [0.1.0] - 2026-05-17

### Added
- Initial public release: VS Code extension, CLI, Web UI server, multi-agent
  workflow (Planner → Writer → Reviewer → Tester), provider abstraction
  (demo/local/opencode/openai), AES-256-GCM conversation encryption, sandbox
  executor with destructive-command blocklist.

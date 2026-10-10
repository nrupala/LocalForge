# LocalForge

> **Local-first AI development platform** — VS Code extension · CLI · Web UI  
> Multi-agent workflow: Planner → Writer → Reviewer → Tester  
> **Proudly Made in Canada.** 🇨🇦

<p align="center">
  <a href="https://github.com/nrupala/LocalForge/actions"><img src="https://github.com/nrupala/LocalForge/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/local-forge"><img src="https://img.shields.io/npm/v/local-forge" alt="npm"></a>
  <a href="https://github.com/nrupala/LocalForge/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License"></a>
  <a href="https://nrupala.github.io/LocalForge"><img src="https://img.shields.io/badge/website-localforge.dev-blue" alt="Website"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#modes">Modes</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#editions">Editions</a> •
  <a href="#pricing">Pricing</a> •
  <a href="#license">License</a>
</p>

---

## Features

| Capability | LocalForge | Copilot | Cursor | Claude Code |
|---|---|---|---|---|
| Fully offline | ✅ | ❌ | ❌ | ❌ |
| Any LLM provider (75+) | ✅ | ❌ (1) | ⚠️ (limited) | ❌ (1) |
| **Multi-agent workflow** | ✅ | ❌ | ❌ | ❌ |
| CLI + Web UI | ✅ | ❌ | ❌ | ✅ |
| Self-hosted server | ✅ | ❌ | ❌ | ❌ |
| Zero data leaving your machine | ✅ | ❌ | ❌ | ❌ |
| AES-256-GCM encryption | ✅ | ❌ | ❌ | ❌ |
| Price | **$0-$60/mo** | $10-39/mo | $20/mo | $20/mo |
| Proof certificates | ✅ (paid tiers) | ❌ | ❌ | ❌ |
| Agent-native endpoints | ✅ | ❌ | ❌ | ❌ |

## Quick Start

### Prerequisites

- **Node.js 20+**
- **For local models:** [llama.cpp](https://github.com/ggml-org/llama.cpp) server + GGUF file
- **For cloud models:** `opencode` CLI (`npm i -g opencode`) or an OpenAI API key

### VS Code Extension

```bash
npm install
npm run build
# Press F5 in VS Code → click "LocalForge" in status bar
```

### CLI

```bash
# Interactive
npm start

# One-shot
npm run run "add input validation to my Express API"

# Multi-agent workflow (the killer feature)
npm run workflow "build a REST API with CRUD endpoints"

# Plan mode
npm run plan "design auth system architecture"

# Demo mode (no LLM needed)
$env:LOCALFORGE_DEMO = "1"; npm start
```

### Web UI

```bash
npm run server
# Open http://127.0.0.1:3096

# With API key auth
$env:LOCALFORGE_API_KEY = "your-secret"; npm run server
```

### Providers

| Variable | Default | Description |
|---|---|---|
| `LOCALFORGE_PROVIDER` | `local` | `demo`, `local`, `opencode`, `openai` |
| `LOCALFORGE_ENDPOINT` | `http://127.0.0.1:11434/v1` | API endpoint |
| `LOCALFORGE_MODEL` | `qwen2.5-coder-7b-instruct-q4_k_m` | Model name |
| `LOCALFORGE_API_KEY` | — | API key for auth |
| `LOCALFORGE_EDITION` | `workshop` | `workshop`, `complete`, `enterprise`, `perpetual` — license flags, one codebase, no forks |
| `LOCALFORGE_VERIFICATION` | — | Set to `1` to enable the verification layer on Pro ($15/mo add-on) |

## Editions

One core, three editions as **license flags** — never forks, never duplicated
code paths. Everything edition-specific is decided in `src/edition.ts`.

| Edition | What it is |
|---|---|
| **Founder Workshop** | CLI + VS Code extension + Web UI. Five-minute local start, demo mode with no LLM needed, llama.cpp default, multi-agent workflow. |
| **Air-gap Enterprise** | Same core, hardened packaging: single binary, sealed updates, SSO, private deploy. For regulated and IP-sensitive teams. |
| **Verification layer** | The Tester agent mints a **proof certificate** per build — a hash-chained record of the observed run (agent order, statuses, output hashes). Included in Complete/Enterprise/Perpetual; $15/mo add-on to Pro. Honest scope: it attests to the run, not a formal proof of correctness (see `src/verification.ts`). |

Check your setup any time: `localforge edition`.

## For agents and humans

Every edition serves both. Humans use the CLI, VS Code extension, and Web UI.
AI agents are first-class users:

- `/.well-known/localforge.json` — machine-readable capability document
- `/llms.txt` — plain-text brief for agents
- `POST /api/chat`, `POST /api/workflow`, `GET /api/health`, `GET /api/edition`

Interop with sibling AIMLDS tools (AxiomCode, SAIC, KalaBodha, Research
Analyst) via API / MCP / ACP is mapped in [HANDSHAKE.md](HANDSHAKE.md)
(design stage — any OpenAI-compatible sibling already works as a provider).

## Quality bar

If someone is paying, the product has to be good — so the bar is enforced,
not marketed. `npm run benchmark` runs the Planner → Writer → Reviewer →
Tester workflow on reference tasks (refactor, greenfield CRUD, bug hunt) and
scores each against [BENCHMARK.md](BENCHMARK.md): compiles clean, tests
produced, no placeholders, edge cases handled, certificate chain verifies.
CI gates on it.

## Modes

| Mode | Description |
|---|---|
| **Chat** | Conversational AI with code context and optional mode switching (`@plan`, `@build`) |
| **Agent** | Autonomous: plans, executes, iterates up to 5 rounds with task feedback |
| **Plan** | Architecture analysis with structured JSON output and mode recommendations |
| **Build** | Multi-agent workflow: Planner → Writer → Reviewer → Tester pipeline |

## Architecture

```
src/
├── extension.ts            VS Code extension (webview sidebar)
├── cli.ts                  CLI entry point (stdin/stdout, one-shot)
├── server.ts               Standalone web UI server (port 3096)
├── AgentTask.ts            Core engine: modes, conversation, agent loop
├── Workflow.ts             Multi-agent workflow pipeline
├── Mode.ts                 Mode definitions and system prompts
├── edition.ts              Edition/license flags — one codebase, no forks
├── verification.ts         Proof certificates: hash-chained run attestation
├── providers/
│   ├── ProviderManager.ts  LLM abstraction: demo/local/opencode/openai
│   └── DemoProvider.ts     Zero-dependency demo responses
└── sandbox/
    └── Executor.ts         File write, terminal exec, test runner, git auto-commit
```

## Security

- **Zero-knowledge architecture** — no LocalForge cloud server
- **AES-256-GCM encryption** for conversations (optional)
- **Command approval** — granular control over file/terminal/test operations
- **Destructive command blocklist** — prevents `rm -rf /` and similar
- **Binary file protection** — blocks arbitrary binary writes
- **Configurable** via `SecurityConfig` interface (`encryptConversations`, `commandApproval`)

## Pricing

Priced at 1.5× verified market rates (Oct 2026: Cursor/Claude Code $20/mo
entry, Cursor Teams $40/user/mo). If someone is paying, the product has to
earn it — see the [quality bar](#quality-bar).

| Tier | Price | Best for |
|---|---|---|
| **Self-Hosted** | **$0** forever | Open source, hobbyists, offline use |
| **Pro** (Workshop) | **$30/mo** | Professional developers needing 75+ providers |
| **Complete** (all three editions) | **$45/mo** | The bundle: workshop + air-gap packaging + verification, one license |
| **Enterprise** (air-gap team) | **$60**/user/mo | Teams needing SSO, private deployment, support |
| **Perpetual** | **$375** one-time | Air-gapped environments, 1 year updates |
| **Verification add-on** | **$15/mo** | Proof certificates on a Pro seat (included in Complete/Enterprise/Perpetual) |

## Contributing

Pull requests welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

- `master` is protected — all PRs need review + passing CI
- Use issue templates for bugs and feature requests
- Questions? Start a [GitHub Discussion](https://github.com/nrupala/LocalForge/discussions)

## License

Copyright (C) 2026 **Nrupal Akolkar**. Proudly Made in Canada.

The LocalForge source code is licensed under the **GNU Affero General Public License v3** with a **Commercial License Exception**.

- **Open source use** (personal, non-commercial, or AGPL-compatible): Free under AGPL v3
- **Commercial use** (for-profit entity, proprietary software): Requires a commercial license
- See [LICENSE](LICENSE) for full terms

Commercial licenses available at [localforge.dev/pricing](https://localforge.dev/pricing).  
[Support on Buy Me a Coffee ☕](https://buymeacoffee.com/nrupalakolt) — Payments via Stripe.

---

<p align="center">Proudly Made in Canada 🇨🇦</p>

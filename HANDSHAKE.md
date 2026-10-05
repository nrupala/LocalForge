# LocalForge Handshake — interop with sibling AIMLDS tools

Status: **design document, not an implementation.** It maps how LocalForge
plugs into the AIMLDS portfolio via API / MCP / ACP. Nothing here is built
yet; each integration is a converged work item on its own.

Principle: LocalForge is the workshop. Sibling tools plug in as **providers**
(supplying intelligence) and **verifiers** (checking the work). All interop
is local-first — no sibling call may require data to leave the machine.

## Transport options

| Transport | Use for | LocalForge surface |
|---|---|---|
| API (HTTP, OpenAI-compatible) | Any sibling exposing an HTTP endpoint | `LOCALFORGE_PROVIDER` + `LOCALFORGE_ENDPOINT` already accept any OpenAI-compatible base URL — a sibling tool is just another provider entry |
| MCP (Model Context Protocol) | Tool/function exposure in both directions | Planned: LocalForge exposes workflow operations (plan, build, certify) as MCP tools; consumes sibling MCP servers as providers |
| ACP (Agent Client Protocol) | Agent-to-agent session handoff | Planned: hand a workflow session to a sibling agent and receive the result plus its own proof artifact |

## Sibling map

### AxiomCode — proof engine (verifier)
- **Direction:** LocalForge → AxiomCode → LocalForge.
- **Design:** the verification layer's `ProofCertificate` (see
  `src/verification.ts`) adopts AxiomCode's HMAC certificate envelope when
  available: same serial/issuer/validity semantics, AxiomCode as the signer.
  The hash-chained local log stays as the tamper-evident transport; AxiomCode
  upgrades "attested run" toward "proven artifact".
- **Interface:** `POST /certify {certificate}` → signed certificate; `POST
  /verify {certificate}` → verdict. MCP tool: `axiomcode.certify`.
- **Status:** design only. Current certificates are self-signed by the local chain.

### SAIC — deterministic reasoning (verifier)
- **Direction:** LocalForge → SAIC → LocalForge.
- **Design:** the Planner step submits its structured plan to SAIC for a
  determinism/consistency check (no probabilistic hedging — in-scope or
  out-of-scope, with a proof trace). SAIC's verdict becomes an additional
  gate before the Writer runs.
- **Interface:** `POST /check {plan}` → `{verdict, trace}`. MCP tool:
  `saic.verify-plan`.
- **Status:** design only.

### KalaBodha — personal AI assistant (provider + consumer)
- **Direction:** both.
- **Design:** KalaBodha can drive LocalForge as a coding backend
  ("build this for me" → workflow run → certificate back). Conversely,
  LocalForge can use KalaBodha as a provider for conversational tasks.
- **Interface:** OpenAI-compatible endpoint swap; ACP session handoff for
  long-running builds.
- **Status:** design only.

### Research Analyst — multi-source research (provider)
- **Direction:** Research Analyst → LocalForge.
- **Design:** the Planner enriches its context with RA briefings
  (API/library docs, breaking-change reports) before planning — "research,
  then build" as a pipeline.
- **Interface:** `POST /brief {topic}` → briefing document injected as
  workflow context.
- **Status:** design only.

## What exists today

- Any OpenAI-compatible sibling works **now** as a provider via
  `LOCALFORGE_PROVIDER=openai` + `LOCALFORGE_ENDPOINT=<sibling-url>`.
- Agent discovery: `/.well-known/localforge.json` and `/llms.txt` on the
  Web UI server describe capabilities for both human and machine consumers.
- Proof certificates exist locally (`src/verification.ts`) with honest scope
  labeling; the AxiomCode upgrade path is mapped above.

## Non-goals

- No cloud-mediated handshake: if a sibling requires a vendor cloud round-trip,
  it does not plug into the local-first editions.
- No silent data sharing: every cross-tool call is explicit, logged, and
  subject to the same command-approval and encryption posture as everything
  else in LocalForge.

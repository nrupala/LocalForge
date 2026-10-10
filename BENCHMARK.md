# LocalForge Benchmark — the Muse-Quality Bar

> "If someone is paying, our product better be really good." — Nrupal, 2026-10-05
>
> This bar is enforced, not documented: `npm run benchmark` runs it, CI gates
> on it, and the score is reported honestly in every release PR.

## The bar

A reference task is green only when the Planner → Writer → Reviewer → Tester
run satisfies **all** of these:

1. **All four agents complete.** Planner, Writer, Reviewer, Tester each reach
   `completed` status. A failed agent fails the task.
2. **Writer produces complete file blocks.** At least one ` ```file:path `
   block with substantive content (>50 chars). No empty scaffolds.
3. **No placeholder markers.** Writer output must not contain TODO, FIXME,
   XXX, HACK, PLACEHOLDER, "your code here", lorem ipsum, or "not implemented".
4. **Edge-case handling present.** Writer output shows evidence of edge-case
   thinking (invalid/missing/null/empty inputs handled).
5. **Generated TypeScript compiles clean** under `tsc --noEmit --strict`.
   (Skipped, not failed, when tsc is unavailable.)
6. **Tester produces real test cases.** At least 2 test-case markers
   (`it(`/`describe(`) in the tester output.
7. **Reviewer produces findings.** Non-trivial review output (≥20 chars) —
   a review that says nothing reviewed nothing.
8. **Proof certificate minted and chain-verified.** With the verification
   layer on, the run must produce a certificate whose hash chain recomputes
   cleanly (see `src/verification.ts`).

## What the modes actually prove

| Mode | Command | What it validates |
|---|---|---|
| demo | `npm run benchmark` | Harness, pipeline plumbing, output-completeness signals, certificate chain. Deterministic — same result every run. |
| local | `npm run benchmark -- --provider local` | The full bar against a real model on llama.cpp (default `http://127.0.0.1:11434/v1`). This is where model quality is judged. |

Demo mode cannot judge model quality — it runs canned fixtures. That is
stated here and in the benchmark output so the score is never misread.
CI runs demo mode (no GPU on runners); the local-model run is done on
maintainer hardware before paid-tier releases.

## Reference tasks

1. **Multi-file refactor** — extract input validation into `utils/validate.ts`
   and wire it into the request handlers.
2. **Greenfield CRUD feature** — REST API resource with CRUD endpoints,
   input validation, and tests.
3. **Bug hunt** — expired tokens accepted by the auth middleware; find and fix.

## Reading the score

`Score: 3/3 tasks green` means the bar held. Anything less means the bar did
not hold — say so plainly, fix the ✗ lines, and do not ship a green claim on
red evidence.

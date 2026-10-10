#!/usr/bin/env node
// Copyright (c) 2026 Nrupal Akolkar
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * LocalForge benchmark — the Muse-quality bar, enforced not documented.
 *
 * Runs the real Planner -> Writer -> Reviewer -> Tester workflow on a set of
 * small reference tasks and scores each against the bar defined in
 * BENCHMARK.md. Exits non-zero when any task fails; CI runs this gate.
 *
 * Modes:
 *   demo  (default, LOCALFORGE_DEMO=1): zero-dependency. Validates the
 *           harness, the pipeline plumbing, output completeness signals, and
 *           the proof-certificate chain. Deterministic.
 *   local (--provider local): runs against a real llama.cpp server. This is
 *           where the quality bar bites on actual model output.
 *
 * Usage: node scripts/benchmark/run.js [--provider demo|local]
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const OUT = path.join(__dirname, '..', '..', 'out');

function requireOut(p) {
  try {
    return require(path.join(OUT, p));
  } catch (e) {
    console.error(`FATAL: cannot load ${p} — run "npm run build" first. (${e.message})`);
    process.exit(2);
  }
}

const { WorkflowEngine } = requireOut('Workflow');
const { ProviderManager } = requireOut('providers/ProviderManager');
const edition = requireOut('edition');
const verification = requireOut('verification');

// The benchmark always exercises the verification layer: if the product
// charges for proof, the proof machinery must be under test.
process.env.LOCALFORGE_VERIFICATION = '1';

const TASKS = [
  {
    id: 'refactor-validation',
    name: 'Multi-file refactor',
    goal: 'Refactor: extract input validation into utils/validate.ts and wire it into the request handlers',
  },
  {
    id: 'crud-feature',
    name: 'Greenfield CRUD feature',
    goal: 'Build a REST API resource with CRUD endpoints, input validation, and tests',
  },
  {
    id: 'bug-hunt',
    name: 'Bug hunt',
    goal: 'Find and fix the login bug: expired tokens are accepted by the auth middleware',
  },
];

const BANNED_MARKERS = /\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b|PLACEHOLDER|YOUR CODE HERE|LOREM IPSUM|NOT IMPLEMENTED/i;
const EDGE_SIGNALS = /edge|invalid|missing|null|empty|wrong type/i;

function extractCodeBlocks(text) {
  const blocks = [];
  const re = /```file:([^\n]+)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    blocks.push({ path: m[1].trim(), content: m[2] });
  }
  return blocks;
}

function tscBin() {
  // Resolve tsc from this repo's own node_modules — deterministic in CI
  // (npm ci) and local dev. Never rely on npx shims or a temp-dir PATH.
  const bin = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'tsc');
  return fs.existsSync(bin) ? bin : null;
}

function checkCompiles(blocks) {
  const tsBlocks = blocks.filter(b => b.path.endsWith('.ts') && b.content.trim().length > 0);
  if (tsBlocks.length === 0) return { pass: null, detail: 'no .ts blocks to compile' };
  const tsc = tscBin();
  if (!tsc) return { pass: null, detail: 'tsc not installed — skipped' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-bench-'));
  try {
    const files = [];
    for (const b of tsBlocks) {
      const safe = b.path.replace(/[^a-zA-Z0-9._-]/g, '_');
      fs.writeFileSync(path.join(dir, safe), b.content, 'utf8');
      files.push(safe);
    }
    // Explicit tsconfig: robust across tsc versions (6.x changed bare-cli behavior).
    fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, skipLibCheck: true, noEmit: true, target: 'ES2022', module: 'commonjs' },
      files,
    }));
    execSync(`"${tsc}" -p "${dir}"`, { stdio: 'pipe', timeout: 60000 });
    return { pass: true, detail: `${tsBlocks.length} file(s) compile clean under --strict` };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    return { pass: false, detail: 'tsc errors: ' + String(out).split('\n').slice(0, 5).join(' | ').substring(0, 300) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function countTests(text) {
  const its = (text.match(/\bit\s*\(/g) || []).length;
  const describes = (text.match(/\bdescribe\s*\(/g) || []).length;
  return its + describes;
}

async function runTask(task, pm) {
  const wf = new WorkflowEngine();
  wf.onConsole = () => {}; // keep benchmark output clean
  verification.resetChain();
  const prevHead = verification.chainHead();

  const result = await wf.runWorkflow(
    task.goal,
    '',
    (messages, temp, maxTok, stream) => pm.query(messages, temp, maxTok, stream)
  );

  const checks = [];
  const step = (role) => result.steps.find(s => s.role === role);
  const writer = step('writer');
  const reviewer = step('reviewer');
  const tester = step('tester');

  const allCompleted = result.steps.length === 4 && result.steps.every(s => s.status === 'completed');
  checks.push({ name: 'all 4 agents completed', pass: allCompleted, detail: result.summary });

  const blocks = writer && writer.output ? extractCodeBlocks(writer.output) : [];
  const hasCode = blocks.length > 0 && blocks.every(b => b.content.trim().length > 50);
  checks.push({ name: 'writer produced complete file blocks', pass: hasCode, detail: `${blocks.length} file block(s)` });

  const writerText = writer && writer.output ? writer.output : '';
  const noMarkers = !BANNED_MARKERS.test(writerText);
  checks.push({ name: 'no TODO/placeholder/stub markers', pass: noMarkers, detail: noMarkers ? 'clean' : 'banned marker found' });

  const edge = EDGE_SIGNALS.test(writerText);
  checks.push({ name: 'edge-case handling present', pass: edge, detail: edge ? 'signal found' : 'no edge-case signal in writer output' });

  const compiled = checkCompiles(blocks);
  checks.push({ name: 'generated .ts compiles clean (--strict)', ...compiled });

  const testerText = tester && tester.output ? tester.output : '';
  const nTests = countTests(testerText);
  checks.push({ name: 'tester produced test cases', pass: nTests >= 2, detail: `${nTests} test-case marker(s)` });

  const reviewerText = reviewer && reviewer.output ? reviewer.output : '';
  checks.push({ name: 'reviewer produced findings', pass: reviewerText.trim().length >= 20, detail: `${reviewerText.trim().length} chars` });

  const cert = result.certificate;
  const certOk = !!cert && verification.verifyCertificate(cert, prevHead) && verification.chainHead() === cert.chainHash;
  checks.push({
    name: 'proof certificate minted + chain verifies',
    pass: certOk,
    detail: cert ? `${cert.serial} chain ${cert.chainHash.substring(0, 12)}…` : 'no certificate (verification layer off?)',
  });

  return { task, checks, pass: checks.every(c => c.pass !== false) };
}

async function main() {
  const providerArg = process.argv.includes('--provider')
    ? process.argv[process.argv.indexOf('--provider') + 1]
    : 'demo';

  const pm = new ProviderManager(process.cwd());
  if (providerArg === 'demo') {
    pm.setConfig({ type: 'demo', label: 'Demo Mode (benchmark)', endpoint: '', model: '' });
  }
  // 'local' falls through to ProviderManager defaults (llama.cpp on 127.0.0.1:11434).

  console.log(`\nLocalForge benchmark — provider: ${providerArg} | edition: ${edition.describeActiveEdition()}`);
  console.log(`Bar: BENCHMARK.md (compiles clean, tests produced, no placeholders, edge cases, certificate chain)\n`);

  let allPass = true;
  const rows = [];
  for (const task of TASKS) {
    let r;
    try {
      r = await runTask(task, pm);
    } catch (e) {
      r = { task, checks: [{ name: 'workflow ran without exception', pass: false, detail: e.message }], pass: false };
    }
    allPass = allPass && r.pass;
    rows.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${task.name} (${task.id})`);
    for (const c of r.checks) {
      const icon = c.pass === true ? '  ✓' : c.pass === false ? '  ✗' : '  ○';
      console.log(`${icon} ${c.name} — ${c.detail}`);
    }
    console.log('');
  }

  const passed = rows.filter(r => r.pass).length;
  console.log(`Score: ${passed}/${rows.length} tasks green.\n`);
  if (!allPass) {
    console.log('Benchmark FAILED — see ✗ lines above. Do not claim the bar is met until they are green.');
    process.exit(1);
  }
  console.log('Benchmark green. (Demo mode validates harness + plumbing + certificate chain;');
  console.log(' run with --provider local against llama.cpp for the full model-quality bar.)');
}

main().catch(e => { console.error('Benchmark crashed:', e.message); process.exit(2); });

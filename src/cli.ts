import * as readline from 'readline';
import { ProviderManager } from './providers/ProviderManager';
import { LocalForgeEngine } from './AgentTask';
import { Mode } from './Mode';
import { WorkflowEngine } from './Workflow';

const [, , cmd, ...args] = process.argv;

function printHelp() {
  console.log(`
LocalForge CLI — Local-first AI development engine

USAGE:
  localforge                      Start interactive chat mode
  localforge run "<prompt>"       One-shot mode
  localforge plan "<goal>"        Generate a plan
  localforge workflow "<goal>"    Run multi-agent workflow
  localforge --help               Show this help

PROVIDERS:
  Set these env vars to configure providers:
  LOCALFORGE_PROVIDER=local|opencode|openai   (default: local)
  LOCALFORGE_ENDPOINT=http://...              (default: http://127.0.0.1:11434/v1)
  LOCALFORGE_MODEL=model-name                 (default: qwen2.5-coder-7b-instruct-q4_k_m)
  LOCALFORGE_API_KEY=sk-...                   (optional)
  `.trim());
}

function getProviderFromEnv() {
  const pm = new ProviderManager(process.cwd());
  const type = (process.env.LOCALFORGE_PROVIDER || (process.env.LOCALFORGE_DEMO === '1' ? 'demo' : 'local')) as 'local' | 'opencode' | 'openai' | 'demo';
  const labels: Record<string, string> = {
    demo: 'Demo Mode (no LLM needed)',
    local: 'llama.cpp (Local)',
    opencode: 'OpenCode (75+ providers)',
    openai: 'OpenAI-Compatible API'
  };
  pm.setConfig({
    type,
    label: labels[type] || type,
    endpoint: process.env.LOCALFORGE_ENDPOINT || (type === 'local' ? 'http://127.0.0.1:11434/v1' : type === 'opencode' ? 'http://127.0.0.1:4096' : ''),
    model: process.env.LOCALFORGE_MODEL || 'qwen2.5-coder-7b-instruct-q4_k_m',
    apiKey: process.env.LOCALFORGE_API_KEY || undefined,
  });
  return pm;
}

async function runOneShot(prompt: string) {
  const pm = getProviderFromEnv();
  const engine = new LocalForgeEngine(pm);

  try {
    const result = await engine.processRequest(Mode.Chat, prompt, '');
    if (result.message) {
      console.log(result.message);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function runWorkflowMode(goal: string) {
  const pm = getProviderFromEnv();
  const wf = new WorkflowEngine();
  wf.onConsole = (entry) => {
    const prefix = entry.level === 'error' ? '✖' : entry.level === 'success' ? '✓' : entry.level === 'warn' ? '⚠' : '•';
    console.log(`  ${prefix} ${entry.text}`);
  };

  console.log(`\n  Workflow: ${goal.substring(0, 80)}\n`);
  const result = await wf.runWorkflow(
    goal,
    '',
    (messages, temp, maxTok, stream) => pm.query(messages, temp, maxTok, stream)
  );

  console.log(`\n  Result: ${result.success ? '✓ All steps passed' : '⚠ Some steps failed'}`);
  for (const step of result.steps) {
    const icon = step.status === 'completed' ? '✓' : step.status === 'failed' ? '✖' : '•';
    console.log(`  ${icon} [${step.role}] ${step.status}${step.retries > 0 ? ` (${step.retries} retries)` : ''}`);
    if (step.output) {
      const lines = step.output.split('\n').filter(l => l.trim());
      const preview = lines.slice(0, 3).join('\n    ');
      console.log(`    ${preview}`);
    }
    if (step.error) console.log(`    Error: ${step.error}`);
  }

  if (!result.success) process.exit(1);
}

async function runPlanMode(goal: string) {
  const pm = getProviderFromEnv();
  const engine = new LocalForgeEngine(pm);
  const result = await engine.processRequest(Mode.Plan, goal, '');
  if (result.plan) {
    console.log(JSON.stringify(result.plan, null, 2));
  } else if (result.message) {
    console.log(result.message);
  }
}

async function runInteractive() {
  const pm = getProviderFromEnv();
  const engine = new LocalForgeEngine(pm);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'lf> ' });

  const cfg = pm.getConfig();
  console.log(`\n  LocalForge CLI — ${cfg.label} | Model: ${cfg.model}`);
  console.log(`  Type /help for commands, /workflow for multi-agent mode, /plan for planning\n`);

  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input.startsWith('/')) {
      const [cmd, ...rest] = input.slice(1).split(' ');
      switch (cmd) {
        case 'help':
          console.log(`\n  Commands:
  /help          Show this help
  /workflow <g>  Run multi-agent workflow
  /plan <g>      Generate a plan
  /reset         Clear conversation
  /model <name>  Switch model
  /provider <t>  Switch provider (local|opencode|openai)
  /config        Show current config
  /exit          Quit\n`);
          break;
        case 'workflow':
          rl.pause();
          await runWorkflowMode(rest.join(' ') || input);
          rl.prompt();
          rl.resume();
          break;
        case 'plan':
          rl.pause();
          await runPlanMode(rest.join(' ') || input);
          rl.prompt();
          rl.resume();
          break;
        case 'reset':
          engine.resetConversation();
          console.log('  Conversation reset');
          break;
        case 'model':
          if (rest.length) {
            const c = pm.getConfig();
            c.model = rest.join(' ');
            pm.setConfig(c);
            console.log(`  Model: ${c.model}`);
          }
          break;
        case 'provider':
          if (rest.length) {
            const type = rest[0] as 'local' | 'opencode' | 'openai';
            const labels: Record<string, string> = { local: 'llama.cpp (Local)', opencode: 'OpenCode (75+ providers)', openai: 'OpenAI-Compatible API' };
            const ep = type === 'local' ? 'http://127.0.0.1:11434/v1' : type === 'opencode' ? 'http://127.0.0.1:4096' : 'https://api.openai.com/v1';
            pm.setConfig({ type, label: labels[type] || type, endpoint: ep, model: pm.getConfig().model });
            console.log(`  Provider: ${labels[type]}`);
          }
          break;
        case 'config':
          console.log(`  ${JSON.stringify(pm.getConfig(), null, 2)}`);
          break;
        case 'exit':
        case 'quit':
          rl.close();
          return;
        default:
          console.log(`  Unknown command: /${cmd}. Try /help`);
      }
      rl.prompt();
      return;
    }

    try {
      rl.pause();
      const result = await engine.processRequest(Mode.Chat, input, '');
      if (result.message) {
        console.log('\n' + result.message);
      }
    } catch (err: any) {
      console.error(`\n  Error: ${err.message}`);
    } finally {
      rl.prompt();
      rl.resume();
    }
  });

  rl.on('close', () => {
    console.log('\n  Goodbye!');
    process.exit(0);
  });
}

async function main() {
  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  if (cmd === 'run') {
    const prompt = args.join(' ') || '';
    if (!prompt) { console.error('Usage: localforge run "<prompt>"'); process.exit(1); }
    await runOneShot(prompt);
  } else if (cmd === 'workflow') {
    const goal = args.join(' ') || '';
    if (!goal) { console.error('Usage: localforge workflow "<goal>"'); process.exit(1); }
    await runWorkflowMode(goal);
  } else if (cmd === 'plan') {
    const goal = args.join(' ') || '';
    await runPlanMode(goal);
  } else {
    const prompt = [cmd, ...args].join(' ');
    await runOneShot(prompt);
  }
}

if (require.main === module || process.argv[1]?.endsWith('cli.js')) {
  if (!cmd || cmd === '--interactive' || cmd === '-i') {
    runInteractive().catch(err => { console.error(err); process.exit(1); });
  } else {
    main().catch(err => { console.error(err); process.exit(1); });
  }
}

export { getProviderFromEnv, runOneShot, runInteractive, runWorkflowMode };

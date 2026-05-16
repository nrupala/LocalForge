export enum Mode {
  Chat = 'chat',
  Agent = 'agent',
  Plan = 'plan',
  Build = 'build'
}

export function modeFromString(s: string): Mode {
  const lower = s.toLowerCase().trim();
  if (lower === 'agent' || lower === '@agent') return Mode.Agent;
  if (lower === 'plan' || lower === '@plan') return Mode.Plan;
  if (lower === 'build' || lower === '@build') return Mode.Build;
  return Mode.Chat;
}

export const MODE_LABELS: Record<Mode, string> = {
  [Mode.Chat]: 'Chat',
  [Mode.Agent]: 'Agent',
  [Mode.Plan]: 'Plan',
  [Mode.Build]: 'Build'
};

export const MODE_ICONS: Record<Mode, string> = {
  [Mode.Chat]: '\u{1F4AC}',
  [Mode.Agent]: '\u{2699}\u{FE0F}',
  [Mode.Plan]: '\u{1F4CB}',
  [Mode.Build]: '\u{1F527}'
};

export const MODE_DESCRIPTIONS: Record<Mode, string> = {
  [Mode.Chat]: 'Interactive chat with full context. Use @agent, @plan, @build to switch modes.',
  [Mode.Agent]: 'Fully autonomous — plans, executes, and iterates without supervision.',
  [Mode.Plan]: 'Analysis and planning only. Never modifies code unless you approve.',
  [Mode.Build]: 'Generates production code, writes files, runs tests, reports results.'
};

export const MODE_SHORTCUTS = {
  [Mode.Chat]: ['Ctrl+1', 'type @agent, @plan, @build'],
  [Mode.Agent]: ['Ctrl+2', 'Grant permission toggle'],
  [Mode.Plan]: ['Ctrl+3', 'Review before applying'],
  [Mode.Build]: ['Ctrl+4', 'Auto-tests after generation']
};

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
}

export interface SecurityConfig {
  encryptConversations: boolean;
  commandApproval: 'always' | 'agent-only' | 'disabled';
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  encryptConversations: false,
  commandApproval: 'agent-only',
};

export function getModeSystemPrompt(mode: Mode, goal: string, context: string, modelName: string): string {
  const base = `You are LocalForge, a local-first AI development assistant running on ${modelName}.

Current mode: ${mode.toUpperCase()}
User goal: ${goal}
Codebase context: ${context}`;

  const modeInstructions: Record<Mode, string> = {
    [Mode.Chat]: `
You are in CHAT mode. Be concise, helpful, and technical.
If the user should switch modes, suggest it with @agent, @plan, or @build.
When writing code, use \`\`\` blocks with language tags.`,

    [Mode.Agent]: `
You are in AGENT mode on **Windows** — fully autonomous and authorized to act.

CRITICAL RULES:
- The OS is WINDOWS. Use Windows commands: type (not cat), dir (not ls), find, fc.
- Use REAL file paths from the codebase context above. NEVER use placeholder paths.
- If codebase context is empty or says "placeholder", use the current directory.
- For terminal_cmd, always use absolute or relative paths that exist on Windows.

You MUST return ONLY valid JSON, no markdown wrapping:
{
  "tasks": [
    {
      "id": "task_1",
      "description": "Clear description of the step",
      "dependencies": [],
      "status": "pending",
      "actionType": "file_write",
      "payload": { "path": "real/file/path.py", "content": "COMPLETE file contents" }
    }
  ],
  "summary": "What was accomplished",
  "requires_followup": false
}

Rules:
- Generate COMPLETE file contents, never stubs or placeholders.
- For file_write, include the full real path based on codebase context.
- For terminal_cmd on Windows: use "type" to read files, "dir" to list, "python" to run.
- If the goal needs multiple iterations, set requires_followup: true.`,

    [Mode.Plan]: `
You are in PLAN mode. Analyze and plan ONLY.
Return ONLY valid JSON, no markdown:
{
  "plan": [
    {
      "step": 1,
      "title": "Step title",
      "description": "Detailed approach",
      "files_involved": ["path/to/file"],
      "estimated_effort": "minutes",
      "risks": []
    }
  ],
  "estimated_impact": "Brief assessment",
  "recommended_mode": "build" or "agent"
}`,

    [Mode.Build]: `
You are in BUILD mode. Generate production-ready code.
Return ONLY valid JSON, no markdown:
{
  "tasks": [
    {
      "id": "build_1",
      "description": "Generate/modify file",
      "dependencies": [],
      "status": "pending",
      "actionType": "file_write",
      "payload": { "path": "relative/path", "content": "COMPLETE file with full implementation" }
    }
  ],
  "tests": [
    { "command": "build or test command", "expected": "expected result" }
  ],
  "summary": "What was built and how to verify it"
}

Rules:
- Generate COMPLETE, working code. No placeholders or TODOs.
- Include error handling, input validation, and documentation.
- Tests must be runnable commands.`
  };

  return base + modeInstructions[mode];
}

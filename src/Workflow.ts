import { ConsoleEntry } from './AgentTask';

export enum AgentRole {
  Planner = 'planner',
  Writer = 'writer',
  Reviewer = 'reviewer',
  Tester = 'tester',
  Executor = 'executor'
}

export interface WorkflowStep {
  role: AgentRole;
  input: string;
  output: string;
  context: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
  retries: number;
}

export interface WorkflowResult {
  steps: WorkflowStep[];
  summary: string;
  success: boolean;
}

export class WorkflowEngine {
  private maxRetries = 2;
  public onConsole?: (entry: ConsoleEntry) => void;

  private log(level: ConsoleEntry['level'], text: string) {
    this.onConsole?.({ timestamp: new Date().toLocaleTimeString(), level, text });
  }

  async runWorkflow(
    goal: string,
    context: string,
    queryFn: (messages: { role: string; content: string }[], temperature: number, maxTokens: number, stream: boolean) => Promise<string>,
    onStep?: (step: WorkflowStep) => void
  ): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [];
    const mode = 'plan';

    this.log('info', `Workflow: starting for "${goal.substring(0, 80)}"`);

    const plannerResult = await this.runStep(AgentRole.Planner, goal, context, queryFn, onStep);
    steps.push(plannerResult);
    if (plannerResult.status === 'failed') {
      this.log('error', 'Planner failed — aborting workflow');
      return { steps, summary: 'Failed at planner stage', success: false };
    }

    const writerResult = await this.runStep(AgentRole.Writer, goal, plannerResult.output, queryFn, onStep);
    steps.push(writerResult);
    if (writerResult.status === 'failed') {
      this.log('warn', 'Writer failed — attempting reviewer anyway');
    }

    const reviewerContext = [plannerResult.output, writerResult.output].join('\n\n---\n\n');
    const reviewerResult = await this.runStep(AgentRole.Reviewer, goal, reviewerContext, queryFn, onStep);
    steps.push(reviewerResult);

    const testerContext = [reviewerContext, reviewerResult.output].join('\n\n---\n\n');
    const testerResult = await this.runStep(AgentRole.Tester, goal, testerContext, queryFn, onStep);
    steps.push(testerResult);

    const success = steps.every(s => s.status === 'completed');
    this.log(success ? 'success' : 'warn', `Workflow: ${success ? 'completed' : 'completed with issues'}`);

    return {
      steps,
      summary: steps.map(s => `[${s.role}] ${s.status}${s.retries > 0 ? ` (${s.retries} retries)` : ''}`).join(' → '),
      success
    };
  }

  private async runStep(
    role: AgentRole,
    goal: string,
    context: string,
    queryFn: (messages: { role: string; content: string }[], temperature: number, maxTokens: number, stream: boolean) => Promise<string>,
    onStep?: (step: WorkflowStep) => void
  ): Promise<WorkflowStep> {
    const systemPrompt = this.getRolePrompt(role, goal, context);
    const step: WorkflowStep = { role, input: goal, output: '', context, status: 'running', retries: 0 };
    this.log('info', `[${role}] starting...`);
    onStep?.({ ...step });

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const response = await queryFn(
          [{ role: 'system', content: systemPrompt }],
          role === AgentRole.Planner ? 0.4 : 0.2,
          8192,
          false
        );
        step.output = response;
        step.status = 'completed';
        step.retries = attempt - 1;
        this.log('success', `[${role}] completed${step.retries > 0 ? ` (after ${step.retries} retries)` : ''}`);
        onStep?.({ ...step });
        return step;
      } catch (err: any) {
        step.error = err.message;
        this.log('warn', `[${role}] attempt ${attempt} failed: ${err.message}`);
        if (attempt <= this.maxRetries + 1) {
          const delay = 1000 * attempt;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    step.status = 'failed';
    this.log('error', `[${role}] failed after ${this.maxRetries + 1} attempts`);
    onStep?.({ ...step });
    return step;
  }

  private getRolePrompt(role: AgentRole, goal: string, context: string): string {
    const base = `Goal: ${goal}\n\nPrevious context:\n${context}`;

    const prompts: Record<AgentRole, string> = {
      [AgentRole.Planner]: `You are a PLANNER. Analyze the goal and existing context. Create a detailed, step-by-step implementation plan covering architecture, files to create/modify, dependencies, and order of operations. Be specific about file paths and changes needed.

Return your plan as structured text:

## Plan
1. Step one...
2. Step two...

## Files
- path/to/file1: purpose
- path/to/file2: purpose

## Dependencies
- Any libraries, tools, or commands needed`,

      [AgentRole.Writer]: `You are a CODE WRITER running on WINDOWS. Generate complete, production-ready code based on the plan above.

CRITICAL RULES:
- Every file MUST be complete with full implementation — no stubs, placeholders, or TODOs
- Include proper error handling, input validation, and edge cases
- Use Windows-compatible paths and commands
- Return code blocks with language tags and file paths

Format:
\`\`\`file:path/to/file.ext
// complete code here
\`\`\``,

      [AgentRole.Reviewer]: `You are a CODE REVIEWER. Review the code above for:
1. Bugs and logic errors
2. Security vulnerabilities
3. Performance issues
4. Code style and maintainability
5. Windows compatibility

For each issue found, state severity (critical/major/minor) and provide the corrected code.

If no issues found, state: "No issues found."`,

      [AgentRole.Tester]: `You are a TESTER on WINDOWS. Create and describe tests for the code above:

1. What test framework to use
2. Test cases covering: normal cases, edge cases, error cases
3. Runable test commands
4. Expected results

Return test code in \`\`\` blocks with file paths.`,

      [AgentRole.Executor]: `You are an EXECUTOR on WINDOWS. Given the plan, code, and tests above, specify:

1. Build/compile commands (Windows-compatible)
2. Test execution commands
3. Verification steps
4. Expected outputs

Only use commands that work on Windows PowerShell or CMD.`
    };

    return `${prompts[role]}\n\n${base}`;
  }
}

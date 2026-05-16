const DEMO_PLANS = [
  {
    goal: 'add input validation',
    output: `## Plan
1. Add validation function in utils/validate.ts
2. Update handler to call validation before processing
3. Add tests for edge cases

## Files
- utils/validate.ts: input validation with type checking and sanitization
- handlers/process.ts: integrate validation before main logic
- tests/validate.test.ts: test cases for valid, invalid, and edge inputs`,
  },
  {
    goal: 'fix login bug',
    output: `## Plan
1. Identify the token expiry check is missing in auth middleware
2. Add JWT expiry verification before route handlers
3. Add error response for expired tokens

## Files
- middleware/auth.ts: add token expiry check
- utils/jwt.ts: add verifyWithExpiry helper`,
  },
];

const DEMO_WRITES = [
  `\`\`\`file:src/utils/validate.ts
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateInput(data: unknown, schema: Record<string, string>): ValidationResult {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }
  const obj = data as Record<string, unknown>;
  for (const [field, type] of Object.entries(schema)) {
    if (!(field in obj)) {
      errors.push(\`Missing field: \${field}\`);
      continue;
    }
    const val = obj[field];
    if (type === 'string' && typeof val !== 'string') {
      errors.push(\`\${field} must be a string\`);
    } else if (type === 'number' && typeof val !== 'number') {
      errors.push(\`\${field} must be a number\`);
    } else if (type === 'boolean' && typeof val !== 'boolean') {
      errors.push(\`\${field} must be a boolean\`);
    }
  }
  return { valid: errors.length === 0, errors };
}
\`\`\``,
  `\`\`\`file:src/middleware/auth.ts
import { verifyWithExpiry } from '../utils/jwt';

export function authMiddleware(req: any, res: any, next: () => void) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const decoded = verifyWithExpiry(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
  req.user = decoded;
  next();
}
\`\`\``,
];

const DEMO_REVIEWS = [
  '**No issues found.** Code follows project conventions, includes proper error handling, and has complete type coverage.',
  '**Minor:** Consider adding a try-catch around the JWT verification call. The `verifyWithExpiry` function could throw on malformed tokens.\n\n**Suggestion:**\n```\ntry {\n  const decoded = verifyWithExpiry(token);\n} catch (err) {\n  return res.status(401).json({ error: \'Invalid token format\' });\n}\n```',
];

const DEMO_TESTS = [
  `\`\`\`file:tests/validate.test.ts
import { validateInput } from '../src/utils/validate';

describe('validateInput', () => {
  it('passes valid input', () => {
    const result = validateInput({ name: 'test', age: 25 }, { name: 'string', age: 'number' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing fields', () => {
    const result = validateInput({ name: 'test' }, { name: 'string', age: 'number' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing field: age');
  });

  it('rejects wrong types', () => {
    const result = validateInput({ name: 123, age: '25' }, { name: 'string', age: 'number' });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(2);
  });

  it('rejects non-object input', () => {
    const result = validateInput(null, {});
    expect(result.valid).toBe(false);
  });
});
\`\`\``,
];

let demoIndex = 0;

export function getDemoResponse(messages: { role: string; content: string }[]): string {
  const lastMsg = (messages[messages.length - 1]?.content || '').toLowerCase();

  if (lastMsg.includes('ping')) return 'pong';

  if (lastMsg.includes('plan') || lastMsg.includes('architecture') || lastMsg.includes('design')) {
    const plan = DEMO_PLANS[demoIndex % DEMO_PLANS.length];
    demoIndex++;
    return JSON.stringify({
      plan: plan.output.split('\n').filter(l => l.startsWith('1.') || l.startsWith('2.') || l.startsWith('3.')).map(l => ({
        step: parseInt(l[0]),
        title: l.replace(/^\d+\.\s*/, '').trim(),
        description: l.replace(/^\d+\.\s*/, '').trim(),
        files_involved: [],
        estimated_effort: '15 min',
        risks: [],
      })),
      estimated_impact: 'Low risk, well-scoped change',
      recommended_mode: 'build',
    });
  }

  if (lastMsg.includes('workflow') || lastMsg.includes('multi-agent')) {
    return JSON.stringify({
      steps: [
        { role: 'planner', status: 'completed', output: DEMO_PLANS[0].output },
        { role: 'writer', status: 'completed', output: DEMO_WRITES[0] },
        { role: 'reviewer', status: 'completed', output: DEMO_REVIEWS[0] },
        { role: 'tester', status: 'completed', output: DEMO_TESTS[0] },
      ],
      summary: 'All steps completed successfully',
      success: true,
    });
  }

  if (lastMsg.includes('test') || lastMsg.includes('spec')) {
    return DEMO_TESTS[demoIndex % DEMO_TESTS.length];
  }

  if (lastMsg.includes('review') || lastMsg.includes('audit')) {
    return DEMO_REVIEWS[demoIndex % DEMO_REVIEWS.length];
  }

  const topics: Record<string, string> = {
    hello: 'Hello! I\'m LocalForge. I can help you code with local or cloud AI models. Try **Plan** mode for architecture or **Build** mode for multi-agent code generation.',
    help: 'Available modes:\n- **Chat**: Conversational AI\n- **Agent**: Autonomous code generation\n- **Plan**: Architecture planning\n- **Build**: Multi-agent code pipeline\n\nTry: "plan a REST API" or "build a validation function"',
    api: 'I can design APIs, generate code, review implementations, and write tests. What would you like to build?',
    bug: 'I can help debug issues. Share the error message or describe the unexpected behavior, and I\'ll analyze the code. For a full workflow, switch to **Build** mode and describe the bug.',
    security: 'LocalForge includes built-in security:\n- AES-256-GCM conversation encryption\n- Configurable command approval\n- Destructive command blocklists\n- Binary file protection\n\nConfigure via `encryptConversations` and `commandApproval` flags.',
  };

  for (const [key, val] of Object.entries(topics)) {
    if (lastMsg.includes(key)) return val;
  }

  return [
    'I understand how to work with that. Could you provide more detail about what you\'d like to build or fix? Try mentioning "plan", "build", or "test" for specific workflows.',
    'Got it. Would you like me to analyze this further? I can switch to **Plan** mode for architecture or **Build** mode for a full multi-agent pipeline.',
    'I can help with that. For a comprehensive solution, try the multi-agent workflow which plans, writes, reviews, and tests your code automatically.',
  ][Math.floor(Math.random() * 3)];
}

export function getDemoStreamChunk(): string {
  const words = ['Here', ' is', ' a', ' demo', ' response', ' from', ' LocalForge', '.', ' The', ' multi-agent', ' workflow', ' can', ' plan', ',', ' write', ',', ' review', ',', ' and', ' test', ' your', ' code', ' automatically', '.'];
  return words[Math.floor(Math.random() * words.length)] + ' ';
}

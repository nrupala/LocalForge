import { Mode, getModeSystemPrompt, ModelInfo, SecurityConfig, DEFAULT_SECURITY_CONFIG } from './Mode';
import { ProviderManager, ProviderConfig, ProviderType } from './providers/ProviderManager';
import * as crypto from 'crypto';

export interface AgentTask {
    id: string;
    description: string;
    dependencies: string[];
    status: 'pending' | 'running' | 'completed' | 'failed';
    actionType: 'file_write' | 'terminal_cmd';
    payload: any;
}

export interface ModeResult {
    tasks?: AgentTask[];
    plan?: any[];
    summary?: string;
    tests?: { command: string; expected: string }[];
    message?: string;
    requires_followup?: boolean;
    recommended_mode?: string;
}

export interface ConsoleEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug' | 'success';
    text: string;
}

export class LocalForgeEngine {
    private providerManager: ProviderManager;
    private conversationHistory: { role: string; content: string }[] = [];
    private maxAgentIterations = 5;
    private securityConfig: SecurityConfig = { ...DEFAULT_SECURITY_CONFIG };
    private encryptionKey?: Buffer;
    public onConsole?: (entry: ConsoleEntry) => void;
    public onToken?: (token: string) => void;
    public onStreamStart?: () => void;
    public onStreamEnd?: () => void;

    constructor(providerManager: ProviderManager) {
        this.providerManager = providerManager;
        this.providerManager.onConsole = (entry) => this.onConsole?.(entry);
    }

    getProviderConfig(): ProviderConfig { return this.providerManager.getConfig(); }
    setProviderConfig(cfg: ProviderConfig) { this.providerManager.setConfig(cfg); }
    getProviderManager(): ProviderManager { return this.providerManager; }
    getSecurityConfig(): SecurityConfig { return { ...this.securityConfig }; }
    setSecurityConfig(cfg: Partial<SecurityConfig>) {
        Object.assign(this.securityConfig, cfg);
        if (this.securityConfig.encryptConversations && !this.encryptionKey) {
            this.encryptionKey = crypto.randomBytes(32);
            this.log('info', 'Conversation encryption enabled (session key generated)');
        }
    }

    private encryptEntry(entry: { role: string; content: string }): { role: string; content: string } {
        if (!this.encryptionKey) return entry;
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
        let encrypted = cipher.update(entry.content, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag().toString('hex');
        return { role: entry.role, content: `$encrypted:${iv.toString('hex')}:${tag}:${encrypted}` };
    }

    private decryptEntry(entry: { role: string; content: string }): { role: string; content: string } {
        if (!entry.content.startsWith('$encrypted:') || !this.encryptionKey) return entry;
        try {
            const parts = entry.content.slice(11).split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const tag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return { role: entry.role, content: decrypted };
        } catch {
            return entry;
        }
    }

    private pushConversation(entry: { role: string; content: string }) {
        this.conversationHistory.push(this.encryptEntry(entry));
    }

    private getConversation(n: number): { role: string; content: string }[] {
        return this.conversationHistory.slice(-n).map(e => this.decryptEntry(e));
    }

    private log(level: ConsoleEntry['level'], text: string) {
        this.onConsole?.({ timestamp: new Date().toLocaleTimeString(), level, text });
    }

    listLocalModels(): ModelInfo[] {
        return this.providerManager.listLocalModels();
    }

    async scanForRunningServers(): Promise<string[]> {
        const ports = [11434, 8080, 8081, 8082];
        const found: string[] = [];
        for (const port of ports) {
            try {
                await this.queryLLM([{ role: 'user', content: 'ping' }], 0, 5, false);
                found.push(`http://127.0.0.1:${port}/v1`);
            } catch { }
        }
        return found;
    }

    async processRequest(mode: Mode, userInput: string, codebaseContext: string): Promise<ModeResult> {
        this.log('info', `[${mode.toUpperCase()}] ${userInput.substring(0, 100)}`);

        switch (mode) {
            case Mode.Chat: return this.handleChat(userInput, codebaseContext);
            case Mode.Agent: return this.handleAgent(userInput, codebaseContext);
            case Mode.Plan: return this.handlePlan(userInput, codebaseContext);
            case Mode.Build: return this.handleBuild(userInput, codebaseContext);
        }
        return { message: `Unknown mode: ${mode}` };
    }

    private async handleChat(input: string, context: string): Promise<ModeResult> {
        const systemPrompt = getModeSystemPrompt(Mode.Chat, input, context, this.providerManager.getConfig().model);
        this.pushConversation({ role: 'user', content: input });
        const messages = [
            { role: 'system', content: systemPrompt },
            ...this.getConversation(20)
        ];

        const reply = await this.queryLLM(messages, 0.7, 4096, true);
        this.pushConversation({ role: 'assistant', content: reply });

        const modeSwitch = reply.match(/@(agent|plan|build)/i);
        if (modeSwitch) this.log('info', `Switch detected: @${modeSwitch[1]}`);

        return { message: reply };
    }

    private async handleAgent(input: string, context: string): Promise<ModeResult> {
        const systemPrompt = getModeSystemPrompt(Mode.Agent, input, context, this.providerManager.getConfig().model);
        this.log('info', 'Agent: generating plan...');

        const reply = await this.queryLLM(
            [{ role: 'system', content: systemPrompt }], 0.2, 8192, false
        );
        const result = this.parseJSON(reply);

        if (result.tasks) {
            this.log('success', `Agent: ${result.tasks.length} tasks generated`);
            result.tasks.forEach(t =>
                this.log('debug', `  ${t.id}: [${t.actionType}] ${t.description.substring(0, 80)}`)
            );
        }

        if (result.requires_followup) {
            this.log('info', 'Agent: follow-up iteration needed');
        }

        return result;
    }

    async runAgentLoop(input: string, context: string, executeTasks: (tasks: AgentTask[]) => Promise<void>): Promise<void> {
        const systemPrompt = getModeSystemPrompt(Mode.Agent, input, context, this.providerManager.getConfig().model);
        let iteration = 0;
        let fullContext = input;
        let taskLog = '';

        while (iteration < this.maxAgentIterations) {
            iteration++;
            this.log('info', `Agent iteration ${iteration}/${this.maxAgentIterations}`);

            const messages = [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Goal: ${input}\n\nPrevious work:\n${taskLog}\n\nContinue. Return JSON tasks.` }
            ];

            try {
                const reply = await this.queryLLM(messages, 0.2, 8192, false);
                const result = this.parseJSON(reply);

                if (result.tasks && result.tasks.length > 0) {
                    this.log('info', `Agent: executing ${result.tasks.length} tasks...`);
                    await executeTasks(result.tasks);

                    result.tasks.forEach(t => {
                        taskLog += `[${t.id}] ${t.actionType}: ${t.payload?.path || t.payload?.command || ''}\n`;
                    });
                }

                if (!result.requires_followup || iteration >= this.maxAgentIterations) {
                    this.log('success', `Agent: completed after ${iteration} iteration(s)`);
                    return;
                }

                this.log('info', 'Agent: continuing to next iteration...');
            } catch (err: any) {
                this.log('error', `Agent iteration ${iteration} failed: ${err.message}`);
                throw err;
            }
        }
    }

    private async handlePlan(input: string, context: string): Promise<ModeResult> {
        const systemPrompt = getModeSystemPrompt(Mode.Plan, input, context, this.providerManager.getConfig().model);
        this.log('info', 'Generating plan...');
        const reply = await this.queryLLM(
            [{ role: 'system', content: systemPrompt }], 0.3, 4096, false
        );
        const result = this.parseJSON(reply);
        if (result.plan) this.log('info', `Plan: ${result.plan.length} steps`);
        if (result.recommended_mode) this.log('info', `Recommends: ${result.recommended_mode} mode`);
        return result;
    }

    private async handleBuild(input: string, context: string): Promise<ModeResult> {
        const systemPrompt = getModeSystemPrompt(Mode.Build, input, context, this.providerManager.getConfig().model);
        this.log('info', 'Building...');
        const reply = await this.queryLLM(
            [{ role: 'system', content: systemPrompt }], 0.2, 8192, false
        );
        const result = this.parseJSON(reply);
        if (result.tasks) {
            this.log('success', `Build: ${result.tasks.length} files`);
            result.tasks.forEach(t => this.log('debug', `  ${t.id}: ${t.payload?.path}`));
        }
        if (result.tests) this.log('info', `Build: ${result.tests.length} tests`);
        return result;
    }

    async generateImplementationPlan(goal: string, summary: string): Promise<AgentTask[]> {
        const result = await this.handlePlan(goal, summary);
        return (result.tasks as AgentTask[]) || [];
    }

    async downloadModel(modelKey: string, onProgress?: (pct: number) => void): Promise<string> {
        return this.providerManager.downloadModel(modelKey, this.providerManager.getModelsDir(), onProgress);
    }

    getDownloadUrl(modelName: string): string {
        return this.providerManager.getDownloadUrl(modelName);
    }

    private async queryLLM(
        messages: { role: string; content: string }[],
        temperature: number,
        maxTokens: number,
        stream: boolean
    ): Promise<string> {
        if (stream) this.onStreamStart?.();

        const result = await this.providerManager.query(messages, temperature, maxTokens, stream);

        if (stream) this.onStreamEnd?.();
        return result;
    }

    private parseJSON(text: string): ModeResult {
        const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
        try {
            return JSON.parse(cleaned);
        } catch {
            return { message: cleaned };
        }
    }

    resetConversation() {
        this.conversationHistory = [];
        this.log('info', 'Conversation reset');
    }
}

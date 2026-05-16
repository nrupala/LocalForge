import * as vscode from 'vscode';
import { PolyglotContextEngine } from './parsers/ContextEngine';
import { SandboxExecutor } from './sandbox/Executor';
import { LocalForgeEngine, AgentTask, ConsoleEntry } from './AgentTask';
import { Mode, MODE_LABELS, MODE_DESCRIPTIONS, ModelInfo } from './Mode';
import { ProviderManager, ProviderConfig } from './providers/ProviderManager';
import { WorkflowEngine, WorkflowStep } from './Workflow';

export function activate(context: vscode.ExtensionContext) {
    const contextEngine = new PolyglotContextEngine();
    const sandboxExecutor = new SandboxExecutor();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || context.extensionPath;
    const providerManager = new ProviderManager(workspaceRoot);
    const agentEngine = new LocalForgeEngine(providerManager);

    const provider = new LocalForgeSidebarProvider(agentEngine, sandboxExecutor, contextEngine, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('localforge.taskManagerView', provider)
    );

    let captureCommand = vscode.commands.registerCommand('localForge.analyzeContext', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open a source file to analyze context.');
            return;
        }
        const minimizedContext = await contextEngine.extractSkeletalContext(editor.document);
        provider.sendContextToView(minimizedContext);
    });

    let focusCommand = vscode.commands.registerCommand('localForge.focusTasks', () => {
        vscode.commands.executeCommand('workbench.view.extension.localforge-sidebar');
    });

    let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'localForge.focusTasks';
    statusBarItem.text = '$(tools) LocalForge';
    statusBarItem.tooltip = 'Open LocalForge';
    statusBarItem.show();

    context.subscriptions.push(captureCommand, focusCommand, statusBarItem);
}

class LocalForgeSidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _currentMode: Mode = Mode.Chat;
    private _permissionGranted = false;
    private _consoleBuffer: ConsoleEntry[] = [];
    private _workflowEngine: WorkflowEngine;

    constructor(
        private readonly _engine: LocalForgeEngine,
        private readonly _executor: SandboxExecutor,
        private readonly _contextEngine: PolyglotContextEngine,
        private readonly _extensionContext: vscode.ExtensionContext
    ) {
        this._workflowEngine = new WorkflowEngine();
        this._engine.onConsole = (entry) => {
            this._consoleBuffer.push(entry);
            this._view?.webview.postMessage({ type: 'console', entry });
        };
        this._engine.onToken = (token) => {
            this._view?.webview.postMessage({ type: 'streamToken', token });
        };
        this._engine.onStreamStart = () => {
            this._view?.webview.postMessage({ type: 'streamStart' });
        };
        this._engine.onStreamEnd = () => {
            this._view?.webview.postMessage({ type: 'streamEnd' });
        };
        this._workflowEngine.onConsole = (entry) => {
            this._consoleBuffer.push(entry);
            this._view?.webview.postMessage({ type: 'console', entry });
        };
    }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'setMode':
                    this._currentMode = message.mode as Mode;
                    this._engine.onConsole?.({ timestamp: '', level: 'info', text: `Switched to ${MODE_LABELS[this._currentMode]}` });
                    this._view?.webview.postMessage({ type: 'modeChanged', mode: this._currentMode });
                    break;

                case 'sendMessage':
                    await this._handleSend(message.text, message.context);
                    break;

                case 'executeTasks':
                    await this._handleExecuteTasks(message.tasks);
                    break;

                case 'setPermission':
                    this._permissionGranted = message.granted;
                    this._engine.onConsole?.({ timestamp: '', level: message.granted ? 'success' : 'warn', text: `Permission ${message.granted ? 'GRANTED' : 'REVOKED'}` });
                    break;

                case 'resetSession':
                    this._engine.resetConversation();
                    this._view?.webview.postMessage({ type: 'clearChat' });
                    break;

                case 'listModels':
                    const models = this._engine.listLocalModels();
                    this._view?.webview.postMessage({ type: 'modelList', models });
                    break;

                case 'selectModel':
                    {
                        const cfg = this._engine.getProviderConfig();
                        cfg.model = message.modelName;
                        this._engine.setProviderConfig(cfg);
                        this._engine.onConsole?.({ timestamp: '', level: 'info', text: `Model: ${message.modelName}` });
                    }
                    break;

                case 'setProvider':
                    {
                        const pm = this._engine.getProviderManager();
                        const cfg = message.config as ProviderConfig;
                        pm.setConfig(cfg);
                        this._engine.onConsole?.({ timestamp: '', level: 'info', text: `Provider: ${cfg.label} (${cfg.model})` });
                        this._sendProviderUpdate();
                    }
                    break;

                case 'getProviders':
                    this._sendProviderUpdate();
                    break;

                case 'testProviderConnection':
                    try {
                        const pm = this._engine.getProviderManager();
                        const result = await pm.testConnection();
                        this._engine.onConsole?.({ timestamp: '', level: result.ok ? 'success' : 'error', text: result.message });
                        if (!result.ok) vscode.window.showWarningMessage(result.message);
                    } catch (err: any) {
                        this._engine.onConsole?.({ timestamp: '', level: 'error', text: `Connection test failed: ${err.message}` });
                    }
                    break;

                case 'downloadModel':
                    try {
                        this._engine.onConsole?.({ timestamp: '', level: 'info', text: `Downloading ${message.modelKey}...` });
                        const path = await this._engine.downloadModel(message.modelKey, (pct) => {
                            this._view?.webview.postMessage({ type: 'downloadProgress', pct, key: message.modelKey });
                        });
                        this._engine.onConsole?.({ timestamp: '', level: 'success', text: `Downloaded to ${path}` });
                        const modelList = this._engine.listLocalModels();
                        this._view?.webview.postMessage({ type: 'modelList', models: modelList });
                    } catch (err: any) {
                        this._engine.onConsole?.({ timestamp: '', level: 'error', text: `Download failed: ${err.message}` });
                    }
                    break;

                case 'runAgentLoop':
                    try {
                        this._engine.onConsole?.({ timestamp: '', level: 'info', text: 'Agent loop starting...' });
                        await this._engine.runAgentLoop(message.goal, message.context, async (tasks) => {
                            this._view?.webview.postMessage({ type: 'renderTasks', tasks });
                            await this._handleExecuteTasks(tasks);
                        });
                        this._engine.onConsole?.({ timestamp: '', level: 'success', text: 'Agent loop complete' });
                    } catch (err: any) {
                        this._engine.onConsole?.({ timestamp: '', level: 'error', text: `Agent loop failed: ${err.message}` });
                        vscode.window.showErrorMessage(err.message);
                    }
                    break;

                case 'runWorkflow':
                    try {
                        this._engine.onConsole?.({ timestamp: '', level: 'info', text: 'Workflow starting...' });
                        const pm = this._engine.getProviderManager();
                        const result = await this._workflowEngine.runWorkflow(
                            message.goal,
                            message.context,
                            (messages, temp, maxTok, stream) => pm.query(messages, temp, maxTok, stream),
                            (step) => this._view?.webview.postMessage({ type: 'workflowStep', step })
                        );
                        this._view?.webview.postMessage({ type: 'workflowResult', result });
                        this._engine.onConsole?.({ timestamp: '', level: result.success ? 'success' : 'warn', text: result.summary });
                    } catch (err: any) {
                        this._engine.onConsole?.({ timestamp: '', level: 'error', text: `Workflow failed: ${err.message}` });
                        vscode.window.showErrorMessage(err.message);
                    }
                    break;

                case 'openFile':
                    vscode.workspace.openTextDocument(vscode.Uri.file(message.path)).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                    break;

                case 'showHelp':
                    this._showHelp();
                    break;

                case 'getConsole':
                    for (const entry of this._consoleBuffer) {
                        this._view?.webview.postMessage({ type: 'console', entry });
                    }
                    break;
            }
        });
    }

    private _sendProviderUpdate() {
        const pm = this._engine.getProviderManager();
        const providers = pm.getBuiltinProviders();
        const active = pm.getConfig();
        this._view?.webview.postMessage({ type: 'providerList', providers, active });
    }

    private async _handleSend(text: string, context: string) {
        const mode = this._currentMode;

        try {
            const result = await this._engine.processRequest(mode, text, context);

            if (result.message) {
                this._view?.webview.postMessage({ type: 'aiMessage', text: result.message, mode });
            }
            if (result.tasks) {
                this._view?.webview.postMessage({ type: 'renderTasks', tasks: result.tasks });
                if (mode === Mode.Agent && this._permissionGranted) {
                    await this._handleExecuteTasks(result.tasks);
                    if (result.requires_followup) {
                        this._engine.onConsole?.({ timestamp: '', level: 'info', text: 'Follow-up iteration...' });
                        await this._engine.runAgentLoop(text, context, async (tasks) => {
                            this._view?.webview.postMessage({ type: 'renderTasks', tasks });
                            await this._handleExecuteTasks(tasks);
                        });
                    }
                }
            }
            if (result.plan) {
                this._view?.webview.postMessage({ type: 'renderPlan', plan: result.plan, summary: result.summary });
            }
            if (result.tests) {
                this._view?.webview.postMessage({ type: 'renderTests', tests: result.tests });
            }
        } catch (err: any) {
            this._view?.webview.postMessage({ type: 'aiMessage', text: `Error: ${err.message}`, mode: 'error' });
            vscode.window.showErrorMessage(err.message);
        }
    }

    private async _handleExecuteTasks(tasks: AgentTask[]) {
        for (const task of tasks) {
            this._view?.webview.postMessage({ type: 'updateStatus', id: task.id, status: 'running' });

            try {
                const result = await this._executor.runPayload(task.actionType, task.payload);
                this._view?.webview.postMessage({
                    type: 'updateStatus', id: task.id,
                    status: result.success ? 'completed' : 'failed',
                    log: result.log
                });
                this._engine.onConsole?.({
                    timestamp: '',
                    level: result.success ? 'success' : 'warn',
                    text: `${task.id}: ${result.log.substring(0, 160)}`
                });
            } catch (err: any) {
                this._view?.webview.postMessage({ type: 'updateStatus', id: task.id, status: 'failed', log: err.message });
                this._engine.onConsole?.({ timestamp: '', level: 'error', text: `${task.id}: ${err.message}` });
            }
        }
    }

    private _showHelp() {
        const help = `# LocalForge Help

## Modes
- **Chat** (Ctrl+1): Conversational AI with code context. Type @agent, @plan, @build to switch.
- **Agent** (Ctrl+2): Autonomous mode. Plans, executes, iterates. Requires permission grant.
- **Plan** (Ctrl+3): Planning only. Analyzes and structures work. No code changes.
- **Build** (Ctrl+4): Generates code, writes files, runs tests.

## Quick Start
1. Start llama-server with your GGUF model
2. Press F5 in VS Code with this project
3. Click "LocalForge" in the status bar
4. Type your goal and press Enter

## Agent Mode
In Agent mode, LocalForge autonomously:
- Analyzes your codebase
- Generates implementation plans
- Writes files and runs commands
- Iterates until the goal is met

Toggle "Grant autonomous permission" to enable execution.

## Keyboard Shortcuts
- **Enter**: Send message
- **Ctrl+1/2/3/4**: Switch modes
- **Ctrl+L**: Clear conversation
- **?**: Show this help

## Model Management
- Models are loaded from the project directory
- Click the model dropdown to switch
- Use "Download Model" to fetch from HuggingFace`;

        const panel = vscode.window.createWebviewPanel(
            'localforge.help',
            'LocalForge Help',
            vscode.ViewColumn.Beside,
            { enableScripts: true }
        );
        panel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px 32px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); line-height: 1.6; max-width: 720px; }
h1 { border-bottom: 2px solid var(--vscode-textLink-activeForeground); padding-bottom: 8px; }
h2 { margin-top: 28px; color: var(--vscode-textLink-activeForeground); }
h3 { margin-top: 20px; }
code { background: var(--vscode-textBlockQuote-background); padding: 1px 6px; border-radius: 3px; font-size: 0.9em; }
pre { background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 6px; overflow-x: auto; }
kbd { background: var(--vscode-button-secondaryBackground); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; border: 1px solid var(--vscode-panel-border); }
ul { padding-left: 20px; }
li { margin: 4px 0; }
</style></head><body>
${help.replace(/^# (.*)/gm, '<h1>$1</h1>')
        .replace(/^## (.*)/gm, '<h2>$1</h2>')
        .replace(/^### (.*)/gm, '<h3>$1</h3>')
        .replace(/^- \*\*(.*?)\*\*/g, '<li><strong>$1</strong>')
        .replace(/^- (.*)/gm, '<li>$1')
        .replace(/^(\d+)\. \*\*(.*?)\*\*/gm, '<li><strong>$2</strong>')
        .replace(/^(\d+)\. (.*)/gm, '<li>$2')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n\n/g, '</li>\n\n')
    }
</body></html>`;
    }

    public sendContextToView(contextText: string) {
        this._view?.webview.postMessage({ type: 'contextLoaded', value: contextText });
    }

    private _getHtml(): string {
        return this._generateHTML();
    }

    private _generateHTML(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root {
  --radius: 8px;
  --transition: 0.2s ease;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100vh; width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: var(--vscode-editor-foreground, #d4d4d4);
  background: transparent;
  font-size: 13px;
  line-height: 1.5;
}

/* ── Header / Mode Tabs ── */
.header {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: var(--vscode-sideBarSectionHeader-background, #2a2d2e);
  border-bottom: 1px solid var(--vscode-panel-border, #333);
  gap: 4px;
  flex-shrink: 0;
  z-index: 20;
}
.logo {
  font-weight: 700;
  font-size: 12px;
  letter-spacing: -0.3px;
  margin-right: 8px;
  color: var(--vscode-textLink-activeForeground, #4da6ff);
}
.mode-tabs { display: flex; gap: 2px; flex: 1; }
.mode-tab {
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--vscode-disabledForeground, #888);
  border: 1px solid transparent;
  transition: all var(--transition);
  white-space: nowrap;
}
.mode-tab:hover { color: var(--vscode-editor-foreground, #ccc); background: rgba(255,255,255,0.04); }
.mode-tab.active { color: var(--vscode-editor-foreground, #e0e0e0); background: rgba(255,255,255,0.07); border-color: var(--vscode-panel-border, #444); }
.mode-tab .badge { font-size: 9px; opacity: 0.5; margin-left: 2px; }

.header-actions { display: flex; gap: 2px; }
.icon-btn {
  background: none; border: none; color: var(--vscode-disabledForeground, #888);
  cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 14px; line-height: 1;
  transition: all var(--transition);
}
.icon-btn:hover { color: var(--vscode-editor-foreground, #ccc); background: rgba(255,255,255,0.06); }

/* ── Scrollable Middle Area ── */
.scroll-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ── Chat Area ── */
.chat-area {
  display: flex;
  flex-direction: column;
  padding: 8px 10px;
  min-height: 0;
  flex: 1;
  scroll-behavior: smooth;
}
.msg {
  margin: 4px 0;
  padding: 10px 14px;
  border-radius: var(--radius);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 100%;
  animation: fadeIn 0.2s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.msg.user {
  background: var(--vscode-textBlockQuote-background, #2a2d2e);
  border: 1px solid var(--vscode-panel-border, #383838);
  align-self: flex-end;
  max-width: 92%;
  margin-left: 32px;
}
.msg.ai {
  align-self: flex-start;
  border-left: 3px solid var(--vscode-textLink-activeForeground, #4da6ff);
  padding-left: 12px;
}
.msg.ai.thinking { border-left-color: #f0a030; }
.msg-header {
  display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
}
.msg-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; flex-shrink: 0;
}
.msg-avatar.user { background: var(--vscode-button-background, #0e639c); color: #fff; }
.msg-avatar.lf { background: var(--vscode-textLink-activeForeground, #4da6ff); color: #fff; }
.msg-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; opacity: 0.6; }
.msg-time { font-size: 9px; opacity: 0.35; margin-left: auto; }
.msg.ai .msg-content { color: var(--vscode-editor-foreground, #d4d4d4); }
.msg-content code {
  background: var(--vscode-textBlockQuote-background, #2a2d2e);
  padding: 1px 5px; border-radius: 3px; font-size: 0.9em;
}
.msg-content pre {
  background: var(--vscode-textBlockQuote-background, #2a2d2e);
  padding: 10px 12px; border-radius: 6px; overflow-x: auto;
  margin: 6px 0; font-size: 12px; line-height: 1.4;
}
.cursor-blink { animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }

/* ── Welcome ── */
.welcome { text-align: center; padding: 20px 12px 12px; opacity: 0.6; }
.welcome h2 { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
.welcome p { font-size: 11px; }

/* ── Tasks ── */
#taskList { margin: 4px 10px; }
.task-card {
  display: flex; align-items: flex-start; gap: 8px;
  background: var(--vscode-welcomePage-tileBackground, #252526);
  padding: 8px 10px; margin: 4px 0; border-radius: 6px;
  font-size: 12px; border: 1px solid var(--vscode-panel-border, #333);
  animation: fadeIn 0.2s ease;
}
.task-status {
  width: 8px; height: 8px; border-radius: 50%;
  flex-shrink: 0; margin-top: 4px;
  background: var(--vscode-disabledForeground, #666);
}
.task-status.pending { background: var(--vscode-disabledForeground, #666); }
.task-status.running { background: #3399ff; animation: pulse 1s ease infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.task-status.completed { background: #4ec9b0; }
.task-status.failed { background: #f44747; }
.task-body { flex: 1; min-width: 0; }
.task-title { font-weight: 500; }
.task-desc { font-size: 11px; opacity: 0.6; margin-top: 1px; }
.task-log { font-family: monospace; font-size: 10px; margin-top: 4px; padding: 4px 6px; background: rgba(0,0,0,0.2); border-radius: 4px; max-height: 60px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }

/* ── Console ── */
.console-wrap { border-top: 1px solid var(--vscode-panel-border, #333); }
.console-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 5px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;
  font-weight: 600; color: var(--vscode-disabledForeground, #888);
  cursor: pointer; background: var(--vscode-sideBarSectionHeader-background, #2a2d2e);
  user-select: none;
}
.console-header:hover { background: rgba(255,255,255,0.03); }
.console-badge { font-size: 9px; opacity: 0.5; }
.console-area {
  max-height: 120px; overflow-y: auto;
  padding: 4px 10px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 10px; line-height: 1.6;
  background: var(--vscode-terminal-background, #1e1e1e);
}
.c-entry { white-space: pre-wrap; word-break: break-all; }
.c-entry .ct { opacity: 0.35; margin-right: 6px; }
.c-entry.info { color: var(--vscode-terminal-foreground, #ccc); }
.c-entry.success { color: #4ec9b0; }
.c-entry.warn { color: #dcdcaa; }
.c-entry.error { color: #f44747; }
.c-entry.debug { color: #555; }

/* ── Input Area ── */
.input-wrap {
  padding: 8px 10px;
  border-top: 1px solid var(--vscode-panel-border, #333);
  background: var(--vscode-sideBar-background, #1e1e1e);
}
.input-bar {
  display: flex; gap: 6px;
  background: var(--vscode-input-background, #3c3c3c);
  border: 1px solid var(--vscode-input-border, #555);
  border-radius: var(--radius);
  padding: 4px 6px;
  align-items: center;
  transition: border-color var(--transition);
}
.input-bar:focus-within { border-color: var(--vscode-focusBorder, #4da6ff); }
.input-bar input {
  flex: 1; background: none; border: none; outline: none;
  color: var(--vscode-input-foreground, #ccc);
  font-size: 13px; padding: 4px 2px;
  font-family: inherit;
}
.input-bar input::placeholder { color: var(--vscode-input-placeholderForeground, #666); }
.send-btn {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
  border: none; padding: 4px 12px; border-radius: 4px;
  cursor: pointer; font-size: 12px; font-weight: 600;
  transition: all var(--transition); white-space: nowrap;
}
.send-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.context-line {
  display: flex; gap: 6px; align-items: center;
  margin-top: 5px; font-size: 10px; color: var(--vscode-disabledForeground, #666);
}
.context-line textarea {
  flex: 1; height: 28px; resize: none;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #888);
  border: 1px solid transparent;
  border-radius: 4px; padding: 3px 6px;
  font-family: monospace; font-size: 10px; outline: none;
}
.context-line textarea:focus { border-color: var(--vscode-focusBorder, #4da6ff); color: var(--vscode-input-foreground, #ccc); }

.footer-row {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 5px; gap: 6px;
}
.model-select {
  font-size: 10px; color: var(--vscode-disabledForeground, #888);
  display: flex; align-items: center; gap: 4px;
}
.model-select select {
  background: var(--vscode-dropdown-background, #3c3c3c);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-dropdown-border, #555);
  border-radius: 3px; padding: 1px 4px; font-size: 10px;
  max-width: 120px;
  cursor: pointer;
}
.permission-toggle {
  display: flex; align-items: center; gap: 4px;
  font-size: 10px; cursor: pointer; user-select: none;
}
.permission-toggle input { cursor: pointer; }
.agent-badge {
  display: inline-block; background: #f0a030; color: #000;
  font-size: 8px; font-weight: 700; padding: 1px 4px; border-radius: 2px;
  text-transform: uppercase; letter-spacing: 0.3px;
}

/* ── Workflow Steps ── */
.wf-steps { margin: 4px 10px; }
.wf-step {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 6px 10px; margin: 3px 0;
  background: var(--vscode-welcomePage-tileBackground, #252526);
  border-radius: 6px; border-left: 3px solid var(--vscode-disabledForeground, #555);
  font-size: 11px;
}
.wf-step.completed { border-left-color: #4ec9b0; }
.wf-step.failed { border-left-color: #f44747; }
.wf-step.running { border-left-color: #3399ff; }
.wf-role { font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.3px; min-width: 60px; }
.wf-status { font-size: 10px; opacity: 0.6; margin-left: auto; }

/* ── Provider Config ── */
.prov-panel {
  display: none;
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--vscode-sideBar-background, #1e1e1e);
  z-index: 100;
  padding: 16px;
  overflow-y: auto;
}
.prov-panel.open { display: block; }
.prov-panel h3 { margin-bottom: 12px; font-size: 14px; }
.prov-panel .close-btn {
  position: absolute; top: 12px; right: 12px;
  background: none; border: none; color: var(--vscode-disabledForeground);
  font-size: 20px; cursor: pointer;
}
.prov-form label { display: block; margin: 8px 0 3px; font-size: 11px; font-weight: 500; opacity: 0.7; }
.prov-form input, .prov-form select {
  width: 100%; padding: 6px 8px; border-radius: 4px;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--vscode-input-border, #555);
  font-size: 12px;
}
.prov-form input:focus { border-color: var(--vscode-focusBorder, #4da6ff); outline: none; }
.prov-form .prov-btn {
  margin-top: 12px; width: 100%; padding: 7px; border-radius: 4px;
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
  border: none; cursor: pointer; font-weight: 600; font-size: 12px;
}
.prov-form .prov-btn:hover { background: var(--vscode-button-hoverBackground, #1177bb); }

/* ── Model Panel ── */
.model-panel {
  display: none;
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--vscode-sideBar-background, #1e1e1e);
  z-index: 100;
  padding: 16px;
  overflow-y: auto;
}
.model-panel.open { display: block; }
.model-panel h3 { margin-bottom: 12px; font-size: 14px; }
.model-panel .close-btn {
  position: absolute; top: 12px; right: 12px;
  background: none; border: none; color: var(--vscode-disabledForeground);
  font-size: 20px; cursor: pointer;
}
.model-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px; margin: 4px 0;
  background: var(--vscode-welcomePage-tileBackground, #252526);
  border-radius: 6px; border: 1px solid var(--vscode-panel-border, #333);
  cursor: pointer; transition: all var(--transition);
}
.model-item:hover { border-color: var(--vscode-focusBorder, #4da6ff); }
.model-item.active { border-color: var(--vscode-textLink-activeForeground, #4da6ff); }
.model-name { font-size: 13px; font-weight: 500; }
.model-size { font-size: 10px; opacity: 0.5; }
.download-section { margin-top: 16px; padding: 12px; background: var(--vscode-welcomePage-tileBackground, #252526); border-radius: 6px; }
.download-section select, .download-section button {
  margin-top: 6px; width: 100%; padding: 6px;
  border-radius: 4px;
}
.download-section select {
  background: var(--vscode-dropdown-background, #3c3c3c);
  color: var(--vscode-dropdown-foreground, #ccc);
  border: 1px solid var(--vscode-dropdown-border, #555);
}
.download-section button {
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #fff);
  border: none; cursor: pointer; font-weight: 600;
}
.download-section button:hover { background: var(--vscode-button-hoverBackground, #1177bb); }
.progress-bar { height: 4px; background: var(--vscode-panel-border, #333); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--vscode-textLink-activeForeground, #4da6ff); border-radius: 2px; transition: width 0.3s ease; }
</style>
</head>
<body>

<div class="header">
  <span class="logo">LF</span>
  <div class="mode-tabs">
    <div class="mode-tab active" data-mode="chat" onclick="setMode('chat')">Chat <span class="badge">⌘1</span></div>
    <div class="mode-tab" data-mode="agent" onclick="setMode('agent')">Agent <span class="badge">⌘2</span></div>
    <div class="mode-tab" data-mode="plan" onclick="setMode('plan')">Plan <span class="badge">⌘3</span></div>
    <div class="mode-tab" data-mode="build" onclick="setMode('build')">Build <span class="badge">⌘4</span></div>
  </div>
  <div class="header-actions">
    <button class="icon-btn" onclick="runWorkflow()" title="Multi-Agent Workflow" id="wfBtn" style="display:none">⟳</button>
    <button class="icon-btn" onclick="toggleModels()" title="Models">≡</button>
    <button class="icon-btn" onclick="showHelp()" title="Help">?</button>
  </div>
</div>

<div class="scroll-area">
  <div class="chat-area" id="chatArea">
    <div class="welcome" id="welcomeMsg">
      <h2>Welcome to LocalForge</h2>
      <p>Local-first AI development · 4 modes · Fully offline</p>
    </div>
  </div>

  <div id="taskList"></div>

  <div class="console-wrap">
    <div class="console-header" onclick="toggleConsole()">
      <span>Console Log</span>
      <span class="console-badge" id="consoleBadge"></span>
    </div>
    <div class="console-area" id="consoleArea"></div>
  </div>
</div>

<div class="input-wrap">
  <div class="input-bar">
    <input id="msgInput" type="text" placeholder="Type a message..." autofocus>
    <button class="send-btn" id="sendBtn" onclick="sendMsg()">Send</button>
  </div>
  <div class="context-line">
    <span>Context</span>
    <textarea id="ctxInput" placeholder="Optional: file context or extracted code map"></textarea>
  </div>
  <div class="footer-row">
    <div class="model-select">
      <select id="providerSelect" onchange="switchProvider(this.value)" title="Provider">
        <option value="local">llama.cpp</option>
        <option value="opencode">OpenCode</option>
        <option value="openai">OpenAI API</option>
      </select>
      <select id="modelSelect" onchange="selectModel(this.value)" title="Model">
        <option value="qwen2.5-coder-7b-instruct-q4_k_m">qwen2.5-coder-7b</option>
      </select>
    </div>
    <label class="permission-toggle" id="permRow" style="display:none">
      <input type="checkbox" onchange="setPerm(this.checked)">
      <span class="agent-badge">A</span> Autonomous
    </label>
  </div>
</div>

<div class="prov-panel" id="provPanel">
  <button class="close-btn" onclick="toggleProviders()">&times;</button>
  <h3>Provider Configuration</h3>
  <div class="prov-form">
    <label>Provider Type</label>
    <select id="provType" onchange="onProvTypeChange()">
      <option value="local">llama.cpp (Local)</option>
      <option value="opencode">OpenCode (75+ providers)</option>
      <option value="openai">OpenAI-Compatible API</option>
    </select>

    <label>Endpoint URL</label>
    <input id="provEndpoint" type="text" value="http://127.0.0.1:11434/v1" placeholder="http://127.0.0.1:11434/v1">

    <label>Model Name</label>
    <input id="provModel" type="text" value="qwen2.5-coder-7b-instruct-q4_k_m" placeholder="model-name">

    <label>API Key <span style="opacity:0.5;font-size:10px">(optional)</span></label>
    <input id="provApiKey" type="password" placeholder="sk-...">

    <button class="prov-btn" onclick="saveProvider()">Connect Provider</button>
    <button class="prov-btn" style="background:var(--vscode-button-secondaryBackground,#3c3c3c);color:var(--vscode-button-secondaryForeground,#ccc);margin-top:6px" onclick="testProvider()">Test Connection</button>
  </div>
</div>

<div class="model-panel" id="modelPanel">
  <button class="close-btn" onclick="toggleModels()">&times;</button>
  <h3>Models</h3>
  <div id="modelList"></div>
  <div class="download-section">
    <strong>Download Model</strong>
    <select id="dlSelect">
      <option value="qwen2.5-coder-7b-instruct">Qwen 2.5 Coder 7B (4.5 GB)</option>
      <option value="qwen2.5-coder-1.5b-instruct">Qwen 2.5 Coder 1.5B (1 GB)</option>
      <option value="deepseek-coder-6.7b-instruct">DeepSeek Coder 6.7B (4 GB)</option>
      <option value="llama-3.2-3b-instruct">Llama 3.2 3B (2 GB)</option>
      <option value="mistral-7b-instruct">Mistral 7B v0.2 (4.5 GB)</option>
    </select>
    <button onclick="downloadModel()">Download &amp; Use</button>
    <div class="progress-bar" id="dlProgress" style="display:none"><div class="progress-fill" id="dlFill" style="width:0%"></div></div>
  </div>
</div>

<script>
const vsc = acquireVsCodeApi();
let curMode = 'chat';
let streaming = false;
let streamEl = null;
let modelList = [];
let providerType = 'local';

// ── Init ──
document.getElementById('msgInput').focus();
vsc.postMessage({ command: 'listModels' });
vsc.postMessage({ command: 'getProviders' });

document.getElementById('msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    const map = { '1':'chat', '2':'agent', '3':'plan', '4':'build' };
    if (map[e.key]) { e.preventDefault(); setMode(map[e.key]); }
    if (e.key === 'l') { e.preventDefault(); resetSession(); }
  }
});

// ── Provider ──
function switchProvider(type) {
  providerType = type;
  toggleProviders();
}

function onProvTypeChange() {
  const t = document.getElementById('provType').value;
  if (t === 'local') {
    document.getElementById('provEndpoint').value = 'http://127.0.0.1:11434/v1';
    document.getElementById('provModel').value = 'qwen2.5-coder-7b-instruct-q4_k_m';
    document.getElementById('provApiKey').value = '';
  } else if (t === 'opencode') {
    document.getElementById('provEndpoint').value = 'http://127.0.0.1:4096';
    document.getElementById('provModel').value = 'opencode/big-pickle';
    document.getElementById('provApiKey').value = '';
  } else {
    document.getElementById('provEndpoint').value = 'https://api.openai.com/v1';
    document.getElementById('provModel').value = 'gpt-4o-mini';
  }
}

function saveProvider() {
  const type = document.getElementById('provType').value;
  const endpoint = document.getElementById('provEndpoint').value.trim();
  const model = document.getElementById('provModel').value.trim();
  const apiKey = document.getElementById('provApiKey').value.trim();

  const labels = { local:'llama.cpp (Local)', opencode:'OpenCode (75+ providers)', openai:'OpenAI-Compatible API' };
  vsc.postMessage({ command: 'setProvider', config: { type, label: labels[type] || type, endpoint, model, apiKey: apiKey || undefined } });
  toggleProviders();
  document.getElementById('modelSelect').innerHTML = '<option value="'+model+'">'+model+'</option>';
}

function testProvider() {
  addConsole({ timestamp:new Date().toLocaleTimeString(), level:'info', text:'Testing provider connection...' });
  vsc.postMessage({ command: 'testProviderConnection' });
}

function toggleProviders() {
  const p = document.getElementById('provPanel');
  p.classList.toggle('open');
  if (p.classList.contains('open')) {
    document.getElementById('provType').value = providerType;
    onProvTypeChange();
  }
}

// ── Workflow ──
function runWorkflow() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || streaming) return;
  input.value = '';
  const ctx = document.getElementById('ctxInput').value;

  addMsg(text, 'user');
  addConsole({ timestamp:new Date().toLocaleTimeString(), level:'info', text:'Workflow: Planner → Writer → Reviewer → Tester' });
  vsc.postMessage({ command: 'runWorkflow', goal: text, context: ctx });
}

function renderWorkflowSteps(steps) {
  const area = document.getElementById('taskList');
  area.innerHTML = '<div class="wf-steps"></div>';
  const list = area.querySelector('.wf-steps');
  steps.forEach(s => {
    const d = document.createElement('div');
    d.className = 'wf-step ' + s.status;
    d.id = 'wf-' + s.role;
    d.innerHTML = '<span class="wf-role">' + s.role + '</span><span>' + escHtml((s.output || s.error || '...').substring(0, 120)) + '</span><span class="wf-status">' + s.status + '</span>';
    list.appendChild(d);
  });
}

function updateWorkflowStep(step) {
  const el = document.getElementById('wf-' + step.role);
  if (el) {
    el.className = 'wf-step ' + step.status;
    el.querySelector('.wf-status').textContent = step.status;
    const txt = el.querySelector('span:not(.wf-role):not(.wf-status)');
    if (txt) txt.textContent = (step.output || step.error || '...').substring(0, 120);
  }
}

// ── Modes ──
function setMode(m) {
  curMode = m;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.mode-tab[data-mode="'+m+'"]')?.classList.add('active');
  document.getElementById('permRow').style.display = m === 'agent' ? 'flex' : 'none';
  document.getElementById('wfBtn').style.display = m === 'build' ? 'inline-block' : 'none';
  vsc.postMessage({ command: 'setMode', mode: m });
}

// ── Send ──
function sendMsg() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || streaming) return;
  input.value = '';
  const ctx = document.getElementById('ctxInput').value;

  addMsg(text, 'user');
  vsc.postMessage({ command: 'sendMessage', text, context: ctx });
}

// ── Messages ──
function addMsg(text, role, mode) {
  const area = document.getElementById('chatArea');
  const welc = document.getElementById('welcomeMsg');
  if (welc) welc.style.display = 'none';

  if (role === 'user') {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = '<div class="msg-header"><span class="msg-avatar user">U</span><span class="msg-label">You</span></div><div class="msg-content">' + escHtml(text) + '</div>';
    area.appendChild(div);
  } else {
    const div = document.createElement('div');
    div.className = 'msg ai thinking';
    div.innerHTML = '<div class="msg-header"><span class="msg-avatar lf">LF</span><span class="msg-label">' + (mode ? mode.charAt(0).toUpperCase()+mode.slice(1) : 'LocalForge') + '</span></div><div class="msg-content" id="streamTarget"></div><span class="cursor-blink">█</span>';
    div.id = 'streamingMsg';
    area.appendChild(div);
    streamEl = div;
    streaming = true;
  }
  area.scrollTop = area.scrollHeight;
}

function finalizeMsg() {
  if (streamEl) {
    const cursor = streamEl.querySelector('.cursor-blink');
    if (cursor) cursor.remove();
    streamEl.classList.remove('thinking');
    streamEl = null;
  }
  streaming = false;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Console ──
function toggleConsole() {
  const a = document.getElementById('consoleArea');
  a.style.display = a.style.display === 'none' ? 'block' : 'none';
}

function addConsole(entry) {
  const a = document.getElementById('consoleArea');
  const d = document.createElement('div');
  d.className = 'c-entry ' + entry.level;
  const t = document.createElement('span');
  t.className = 'ct';
  t.textContent = entry.timestamp || '';
  d.appendChild(t);
  d.appendChild(document.createTextNode(entry.text));
  a.appendChild(d);
  a.scrollTop = a.scrollHeight;
  document.getElementById('consoleBadge').textContent = a.children.length;
}

// ── Tasks ──
function renderTasks(tasks) {
  const list = document.getElementById('taskList');
  list.innerHTML = '';
  tasks.forEach(t => {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.id = 'task-' + t.id;
    card.innerHTML = '<div class="task-status ' + (t.status||'pending') + '"></div><div class="task-body"><div class="task-title">' + escHtml(t.id) + '</div><div class="task-desc">' + escHtml(t.description) + '</div></div>';
    list.appendChild(card);
  });
}

function updateTaskStatus(id, status, log) {
  const el = document.getElementById('task-' + id);
  if (!el) return;
  const dot = el.querySelector('.task-status');
  if (dot) { dot.className = 'task-status ' + status; }
  if (log) {
    let body = el.querySelector('.task-body');
    if (body && !body.querySelector('.task-log')) {
      const l = document.createElement('div');
      l.className = 'task-log'; l.textContent = log.substring(0, 300);
      body.appendChild(l);
    }
  }
}

// ── Models ──
function toggleModels() {
  const p = document.getElementById('modelPanel');
  p.classList.toggle('open');
  if (p.classList.contains('open')) vsc.postMessage({ command: 'listModels' });
}

function selectModel(name) {
  vsc.postMessage({ command: 'selectModel', modelName: name });
}

function downloadModel() {
  const sel = document.getElementById('dlSelect');
  vsc.postMessage({ command: 'downloadModel', modelKey: sel.value });
  document.getElementById('dlProgress').style.display = 'block';
}

// ── Permission ──
function setPerm(g) {
  vsc.postMessage({ command: 'setPermission', granted: g });
}

// ── Reset ──
function resetSession() {
  document.getElementById('chatArea').innerHTML = '<div class="welcome"><h2>Welcome to LocalForge</h2><p>Session reset</p></div>';
  document.getElementById('taskList').innerHTML = '';
  vsc.postMessage({ command: 'resetSession' });
}

// ── Help ──
function showHelp() {
  vsc.postMessage({ command: 'showHelp' });
}

// ── Message Handler ──
window.addEventListener('message', event => {
  const msg = event.data;
  switch (msg.type) {
    case 'userMessage':
      break;

    case 'aiMessage':
      if (streaming) finalizeMsg();
      const div = document.createElement('div');
      div.className = 'msg ai' + (msg.mode === 'error' ? '' : '');
      div.innerHTML = '<div class="msg-header"><span class="msg-avatar lf">LF</span><span class="msg-label">' + (msg.mode === 'error' ? 'Error' : (msg.mode||'LocalForge')) + '</span></div><div class="msg-content">' + escHtml(msg.text) + '</div>';
      document.getElementById('chatArea').appendChild(div);
      document.getElementById('chatArea').scrollTop = document.getElementById('chatArea').scrollHeight;
      break;

    case 'streamStart':
      addMsg('', 'ai', curMode);
      break;

    case 'streamToken':
      if (streamEl) {
        const target = streamEl.querySelector('#streamTarget') || streamEl;
        target.textContent += msg.token;
        document.getElementById('chatArea').scrollTop = document.getElementById('chatArea').scrollHeight;
      }
      break;

    case 'streamEnd':
      finalizeMsg();
      break;

    case 'console':
      addConsole(msg.entry);
      break;

    case 'clearChat':
      document.getElementById('chatArea').innerHTML = '<div class="welcome"><h2>Welcome to LocalForge</h2><p>Conversation cleared</p></div>';
      document.getElementById('taskList').innerHTML = '';
      break;

    case 'modeChanged':
      curMode = msg.mode;
      break;

    case 'contextLoaded':
      document.getElementById('ctxInput').value = msg.value;
      break;

    case 'renderTasks':
      renderTasks(msg.tasks);
      break;

    case 'updateStatus':
      updateTaskStatus(msg.id, msg.status, msg.log);
      break;

    case 'renderPlan':
      renderTasks((msg.plan||[]).map((s,i) => ({ id:'step_'+(i+1), description:s.title +': '+ (s.description||''), status:'pending', actionType:'plan_step', payload:{} })));
      break;

    case 'renderTests':
      renderTasks((msg.tests||[]).map((t,i) => ({ id:'test_'+(i+1), description: t.command + ' → ' + t.expected, status:'pending', actionType:'test_run', payload:{command:t.command} })));
      break;

    case 'modelList':
      modelList = msg.models || [];
      const sel = document.getElementById('modelSelect');
      sel.innerHTML = '';
      if (modelList.length === 0) {
        sel.innerHTML = '<option>No local models found</option>';
      } else {
        modelList.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name; opt.textContent = m.name + ' (' + (m.size/1e9).toFixed(1) + ' GB)';
          sel.appendChild(opt);
        });
      }
      const ml = document.getElementById('modelList');
      ml.innerHTML = '';
      modelList.forEach(m => {
        const d = document.createElement('div');
        d.className = 'model-item';
        d.innerHTML = '<div><div class="model-name">' + escHtml(m.name) + '</div><div class="model-size">' + (m.size/1e9).toFixed(2) + ' GB</div></div>';
        d.onclick = () => { selectModel(m.name); toggleModels(); };
        ml.appendChild(d);
      });
      break;

    case 'downloadProgress':
      document.getElementById('dlFill').style.width = msg.pct + '%';
      if (msg.pct >= 100) setTimeout(() => document.getElementById('dlProgress').style.display = 'none', 1000);
      break;
  }
});

setMode('chat');
</script>
</body>
</html>`;
    }
}

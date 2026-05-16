import { exec, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ExecutorResult {
  success: boolean;
  log: string;
}

export class SandboxExecutor {
  public requireApprovalFor: ('file_write' | 'file_delete' | 'terminal_cmd' | 'test_run')[] = [];
  public onApprovalRequired?: (actionType: string, payload: any) => Promise<boolean>;
  public autoCommit = false;
  public gitAuthor = 'Nrupal Akolkar <nrupalakolkar@gmail.com>';

  private blockList = [
    'rm -rf /', 'rm -rf ~', 'rm -rf .',
    'drop database', 'drop table',
    'format', 'dd ', 'mkfs',
    '> /dev/sda', '> /dev/hda',
    ':(){ :|:& };:', 'fork bomb',
    'wget ', 'curl ', 'chmod 777',
    'shutdown', 'reboot', 'init 0',
  ];

  private maxLogLength = 10000;

  public async runPayload(actionType: string, payload: any): Promise<ExecutorResult> {
    try {
      const at = actionType as any;
      if (this.requireApprovalFor.includes(at) && this.onApprovalRequired) {
        const approved = await this.onApprovalRequired(actionType, payload);
        if (!approved) {
          return { success: false, log: `Blocked: "${actionType}" requires approval` };
        }
      }

      switch (actionType) {
        case 'file_write':
          return this.handleFileWrite(payload);
        case 'file_read':
          return this.handleFileRead(payload);
        case 'file_delete':
          return this.handleFileDelete(payload);
        case 'terminal_cmd':
          return this.handleTerminalCmd(payload);
        case 'test_run':
          return this.handleTestRun(payload);
        default:
          return await this.tryAutoDetect(actionType, payload);
      }
    } catch (err: any) {
      return { success: false, log: `Exception: ${err.message}` };
    }
  }

  private async tryAutoDetect(actionType: string, payload: any): Promise<ExecutorResult> {
    if (payload?.path) return this.handleFileWrite(payload);
    if (payload?.command) return this.handleTerminalCmd(payload);
    return { success: false, log: `Unknown action type: ${actionType}. Supported: file_write, file_read, file_delete, terminal_cmd, test_run` };
  }

  private handleFileWrite(payload: any): ExecutorResult {
    if (!payload.path) return { success: false, log: 'file_write requires "path" in payload' };
    if (typeof payload.content !== 'string') payload.content = String(payload.content ?? '');

    const binaryExts = ['.bin', '.exe', '.dll', '.so', '.dylib', '.db', '.sqlite', '.pyc', '.class', '.o', '.obj'];
    if (binaryExts.some(ext => payload.path.toLowerCase().endsWith(ext))) {
      return { success: false, log: `Security: binary artifact modification blocked (${path.extname(payload.path)})` };
    }

    const targetPath = payload.path;
    const resolvedPath = path.isAbsolute(targetPath) ? targetPath : path.resolve(process.cwd(), targetPath);

    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resolvedPath, payload.content, 'utf8');
    const size = Buffer.byteLength(payload.content, 'utf8');
    const relPath = path.relative(process.cwd(), resolvedPath);
    this.gitCommit(resolvedPath, payload.commitMessage || `auto: update ${relPath}`);
    return { success: true, log: `Wrote ${this.formatSize(size)} → ${relPath}` };
  }

  private handleFileRead(payload: any): ExecutorResult {
    if (!payload.path) return { success: false, log: 'file_read requires "path" in payload' };
    const resolvedPath = path.isAbsolute(payload.path) ? payload.path : path.resolve(process.cwd(), payload.path);
    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      return { success: true, log: content.substring(0, this.maxLogLength) };
    } catch (err: any) {
      return { success: false, log: `Cannot read ${resolvedPath}: ${err.message}` };
    }
  }

  private handleFileDelete(payload: any): ExecutorResult {
    if (!payload.path) return { success: false, log: 'file_delete requires "path" in payload' };
    const resolvedPath = path.isAbsolute(payload.path) ? payload.path : path.resolve(process.cwd(), payload.path);
    try {
      fs.unlinkSync(resolvedPath);
      return { success: true, log: `Deleted ${path.relative(process.cwd(), resolvedPath)}` };
    } catch (err: any) {
      return { success: false, log: `Cannot delete: ${err.message}` };
    }
  }

  private handleTerminalCmd(payload: any): Promise<ExecutorResult> {
    if (!payload.command || typeof payload.command !== 'string') {
      return Promise.resolve({ success: false, log: 'terminal_cmd requires "command" string in payload' });
    }

    const cmd = payload.command.trim();
    const lowerCmd = cmd.toLowerCase();

    for (const pattern of this.blockList) {
      if (lowerCmd.includes(pattern)) {
        return Promise.resolve({ success: false, log: `Security: destructive command blocked (matched: "${pattern}")` });
      }
    }

    if (/^rm\s+(-rf?\s+)?\/$/i.test(cmd)) {
      return Promise.resolve({ success: false, log: 'Security: rm -rf / blocked' });
    }

    const cwd = payload.cwd || process.cwd();
    const timeout = payload.timeout || 60000;

    return new Promise((resolve) => {
      const child = exec(cmd, { timeout, cwd, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
        const output = stdout || '';
        const errOutput = stderr || '';

        if (error) {
          if (error.killed) {
            resolve({ success: false, log: `Command timed out after ${timeout}ms\n${output.substring(0, 1000)}` });
          } else {
            const detail = errOutput || error.message || 'Unknown error';
            resolve({ success: false, log: `Exit code ${error.code || '?'}: ${detail.substring(0, 1000)}\n${output.substring(0, 1000)}` });
          }
        } else {
          resolve({ success: true, log: output || '(completed with no output)' });
        }
      });

      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill();
        }
      }, timeout + 5000);
    });
  }

  private handleTestRun(payload: any): Promise<ExecutorResult> {
    if (!payload.command) return Promise.resolve({ success: false, log: 'test_run requires "command" in payload' });
    const cwd = payload.cwd || process.cwd();

    return new Promise((resolve) => {
      exec(payload.command, { timeout: 120000, cwd, maxBuffer: 1024 * 1024 }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          resolve({ success: false, log: `Test failed: ${(stderr || error.message).substring(0, 2000)}\n${stdout.substring(0, 2000)}` });
        } else {
          resolve({ success: true, log: `Tests passed:\n${stdout.substring(0, 2000)}` });
        }
      });
    });
  }

  private gitCommit(filePath: string, message: string): void {
    if (!this.autoCommit) return;
    const dir = path.isAbsolute(filePath) ? path.dirname(filePath) : process.cwd();
    try {
      execSync('git add "' + filePath + '"', { cwd: dir, stdio: 'ignore' });
      execSync('git commit --author="' + this.gitAuthor + '" -m "' + message.replace(/"/g, '') + '"', { cwd: dir, stdio: 'ignore' });
    } catch {
      // not a git repo or git not available — silently skip
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

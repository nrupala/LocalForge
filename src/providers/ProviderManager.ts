import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { ConsoleEntry } from '../AgentTask';
import { ModelInfo } from '../Mode';
import { getDemoResponse } from './DemoProvider';

export type ProviderType = 'local' | 'opencode' | 'openai' | 'demo';

export interface ProviderConfig {
  type: ProviderType;
  label: string;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface ProviderDef {
  type: ProviderType;
  label: string;
  builtIn: boolean;
}

const BUILTIN_PROVIDERS: ProviderDef[] = [
  { type: 'demo', label: 'Demo Mode (no LLM needed)', builtIn: true },
  { type: 'local', label: 'llama.cpp (Local)', builtIn: true },
  { type: 'opencode', label: 'OpenCode (75+ providers)', builtIn: true },
  { type: 'openai', label: 'OpenAI-Compatible API', builtIn: false },
];

export class ProviderManager {
  private activeConfig: ProviderConfig;
  private modelsDir: string;
  public onConsole?: (entry: ConsoleEntry) => void;

  constructor(modelsDir: string = '') {
    this.modelsDir = modelsDir || process.cwd();
    this.activeConfig = this.defaultConfig();
  }

  getModelsDir(): string { return this.modelsDir; }

  private log(level: ConsoleEntry['level'], text: string) {
    this.onConsole?.({ timestamp: new Date().toLocaleTimeString(), level, text });
  }

  private defaultConfig(): ProviderConfig {
    if (process.env.LOCALFORGE_DEMO === '1') {
      return { type: 'demo', label: 'Demo Mode (no LLM needed)', endpoint: '', model: '' };
    }
    return { type: 'local', label: 'llama.cpp (Local)', endpoint: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder-7b-instruct-q4_k_m' };
  }

  getConfig(): ProviderConfig { return { ...this.activeConfig }; }

  setConfig(cfg: ProviderConfig) {
    this.activeConfig = { ...cfg };
    this.log('info', `Provider: ${cfg.label} (${cfg.model})`);
  }

  getBuiltinProviders(): ProviderDef[] { return BUILTIN_PROVIDERS.map(p => ({ ...p })); }

  async query(
    messages: { role: string; content: string }[],
    temperature: number,
    maxTokens: number,
    stream: boolean
  ): Promise<string> {
    const maxRetries = 2;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        switch (this.activeConfig.type) {
          case 'demo': return Promise.resolve(getDemoResponse(messages));
          case 'local': return await this.queryLocal(messages, temperature, maxTokens, stream);
          case 'opencode': return await this.queryOpenCode(messages, temperature, maxTokens, stream);
          case 'openai': return await this.queryOpenAI(messages, temperature, maxTokens, stream);
        }
      } catch (err: any) {
        if (attempt > maxRetries) throw err;
        const msg = err.message || '';
        const retryable = msg.includes('ECONNREFUSED') || msg.includes('timeout') || msg.includes('timed out') || msg.includes('socket hang up') || msg.includes('ECONNRESET');
        if (!retryable) throw err;
        this.log('warn', `Connection issue, retry ${attempt}/${maxRetries}: ${msg}`);
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
    throw new Error('Unexpected: query fell through all retries');
  }

  private autoCorrectModel(name: string): string {
    if (name.includes('/')) return name;
    const cleaned = name.replace(/\.gguf$/i, '');
    const extensions = ['.gguf', '.bin', '.q4_k_m', '.q5_k_m', '.q8_0'];
    for (const ext of extensions) {
      if (cleaned.endsWith(ext)) return cleaned;
    }
    return cleaned;
  }

  private queryLocal(
    messages: { role: string; content: string }[],
    temperature: number,
    maxTokens: number,
    stream: boolean
  ): Promise<string> {
    return this.queryOpenAICompatible(this.activeConfig.endpoint, this.activeConfig.model, messages, temperature, maxTokens, stream, undefined);
  }

  private queryOpenAI(
    messages: { role: string; content: string }[],
    temperature: number,
    maxTokens: number,
    stream: boolean
  ): Promise<string> {
    return this.queryOpenAICompatible(this.activeConfig.endpoint, this.activeConfig.model, messages, temperature, maxTokens, stream, this.activeConfig.apiKey);
  }

  private queryOpenAICompatible(
    baseUrl: string,
    model: string,
    messages: { role: string; content: string }[],
    temperature: number,
    maxTokens: number,
    stream: boolean,
    apiKey?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream,
      });

      const url = new URL(baseUrl + '/chat/completions');
      const mod = url.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers,
        timeout: 300000,
      };

      const req = mod.request(options, (res) => {
        if (!res.statusCode || res.statusCode >= 400) {
          let data = '';
          res.on('data', (chunk: Buffer) => data += chunk.toString());
          res.on('end', () => {
            if (res.statusCode === 404) {
              reject(new Error(`Model "${model}" not found on server`));
            } else {
              reject(new Error(`Server error ${res.statusCode}: ${data.substring(0, 200)}`));
            }
          });
          return;
        }

        if (!stream) {
          let data = '';
          res.on('data', (chunk: Buffer) => data += chunk.toString());
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed.choices?.[0]?.message?.content?.trim() || '');
            } catch (e: any) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          });
        } else {
          let fullContent = '';
          let buffer = '';
          res.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const payload = trimmed.slice(6);
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) fullContent += delta;
              } catch { }
            }
          });
          res.on('end', () => resolve(fullContent.trim()));
        }
      });

      req.on('error', (err: any) => {
        if (err.code === 'ECONNREFUSED') {
          reject(new Error(`Cannot reach server at ${baseUrl}. Is it running?`));
        } else {
          reject(new Error(`LLM request failed: ${err.message}`));
        }
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('LLM request timed out')); });
      req.write(body);
      req.end();
    });
  }

  private async queryOpenCode(
    messages: { role: string; content: string }[],
    _temperature: number,
    _maxTokens: number,
    _stream: boolean
  ): Promise<string> {
    const modelSpec = this.activeConfig.model || 'opencode/big-pickle';
    const lastMsg = messages[messages.length - 1]?.content || '';

    this.log('info', `OpenCode: running with model ${modelSpec}...`);

    const cp = require('child_process');
    const args = ['run', '--model', modelSpec, '--format', 'json', lastMsg];

    if (this.activeConfig.endpoint && this.activeConfig.endpoint !== 'http://127.0.0.1:4096') {
      args.push('--attach', this.activeConfig.endpoint);
    }

    return new Promise((resolve, reject) => {
      const child = cp.spawn('opencode', args, {
        timeout: 300000,
        env: { ...process.env },
        shell: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('error', (err: any) => {
        if (err.code === 'ENOENT') {
          reject(new Error('opencode CLI not found. Install: npm install -g opencode'));
        } else {
          reject(new Error(`OpenCode spawn error: ${err.message}`));
        }
      });

      child.on('close', (code: number) => {
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(`OpenCode exited with code ${code}: ${stderr.substring(0, 500)}`));
          return;
        }
        try {
          const lines = stdout.trim().split('\n').filter(Boolean);
          const lastLine = lines[lines.length - 1] || '{}';
          const parsed = JSON.parse(lastLine);
          const content = parsed.text || parsed.content || parsed.response || parsed.output || stdout;
          resolve(typeof content === 'string' ? content : JSON.stringify(content));
        } catch {
          resolve(stdout);
        }
      });

      child.on('error', (err: any) => {
        reject(new Error(`OpenCode error: ${err.message}`));
      });

      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill();
          reject(new Error('OpenCode request timed out'));
        }
      }, 300000);
    });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const cfg = this.activeConfig;
      if (cfg.type === 'opencode') {
        return new Promise((resolve) => {
          const cp = require('child_process');
          cp.exec('opencode --version', { timeout: 10000 }, (err: any, stdout: string) => {
            if (err) resolve({ ok: false, message: 'opencode CLI not found' });
            else resolve({ ok: true, message: `opencode ${stdout.trim()}` });
          });
        });
      }
      const result = await this.query(
        [{ role: 'user', content: 'ping' }],
        0, 5, false
      );
      return { ok: true, message: `Connected: ${result.substring(0, 60)}` };
    } catch (err: any) {
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }

  listLocalModels(): ModelInfo[] {
    const dir = this.modelsDir;
    try {
      if (!fs.existsSync(dir)) return this._fallbackModels();
      const files = fs.readdirSync(dir).filter((f: string) => f.toLowerCase().endsWith('.gguf'));
      const models = files.map((f: string) => {
        const fullPath = path.join(dir, f);
        try {
          const stat = fs.statSync(fullPath);
          return { name: f.replace(/\.gguf$/i, ''), path: fullPath, size: stat.size };
        } catch { return null; }
      }).filter(Boolean) as ModelInfo[];
      return models.length > 0 ? models : this._fallbackModels();
    } catch { return this._fallbackModels(); }
  }

  private _fallbackModels(): ModelInfo[] {
    return [{ name: this.activeConfig.model || 'qwen2.5-coder-7b-instruct-q4_k_m', path: '', size: 0 }];
  }

  getDownloadUrl(modelName: string): string {
    const known: Record<string, string> = {
      'qwen2.5-coder-7b-instruct-q4_k_m': 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      'qwen2.5-coder-7b-instruct': 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
      'qwen2.5-coder-1.5b-instruct': 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
      'deepseek-coder-6.7b-instruct': 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.q4_k_m.gguf',
      'llama-3.2-3b-instruct': 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
      'mistral-7b-instruct': 'https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf',
    };
    return known[modelName] || '';
  }

  async downloadModel(modelKey: string, destDir: string, onProgress?: (pct: number) => void): Promise<string> {
    const url = this.getDownloadUrl(modelKey);
    if (!url) throw new Error(`No download URL for "${modelKey}"`);

    const fileName = modelKey + '.gguf';
    const dest = path.join(destDir, fileName);

    this.log('info', `Downloading ${modelKey}...`);

    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = fs.createWriteStream(dest);
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (total && onProgress) onProgress(Math.round((downloaded / total) * 100));
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          this.log('success', `Downloaded ${modelKey} to ${dest}`);
          resolve(dest);
        });
        file.on('error', (err: any) => {
          fs.unlink(dest, () => { });
          reject(err);
        });
      }).on('error', reject);
    });
  }
}

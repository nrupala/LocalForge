import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ProviderManager } from './providers/ProviderManager';
import { LocalForgeEngine } from './AgentTask';
import { Mode } from './Mode';
import { WorkflowEngine } from './Workflow';

const PORT = parseInt(process.env.LOCALFORGE_PORT || '3096', 10);
const HOST = process.env.LOCALFORGE_HOST || '127.0.0.1';

function createEngine(): { engine: LocalForgeEngine; pm: ProviderManager } {
  const pm = new ProviderManager(process.cwd());
  const type = (process.env.LOCALFORGE_PROVIDER || 'local') as 'local' | 'opencode' | 'openai';
  const labels: Record<string, string> = { local: 'llama.cpp (Local)', opencode: 'OpenCode (75+ providers)', openai: 'OpenAI-Compatible API' };
  pm.setConfig({
    type,
    label: labels[type] || type,
    endpoint: process.env.LOCALFORGE_ENDPOINT || (type === 'local' ? 'http://127.0.0.1:11434/v1' : type === 'opencode' ? 'http://127.0.0.1:4096' : 'https://api.openai.com/v1'),
    model: process.env.LOCALFORGE_MODEL || 'qwen2.5-coder-7b-instruct-q4_k_m',
    apiKey: process.env.LOCALFORGE_API_KEY || undefined,
  });
  return { engine: new LocalForgeEngine(pm), pm };
}

function serveHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LocalForge</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #1e1e1e; color: #d4d4d4; font-size: 14px; }
body { display: flex; flex-direction: column; }
.header { display: flex; align-items: center; padding: 8px 16px; background: #2a2d2e; border-bottom: 1px solid #333; gap: 8px; flex-shrink: 0; }
.logo { font-weight: 700; font-size: 15px; color: #4da6ff; margin-right: 12px; }
.modes { display: flex; gap: 4px; flex: 1; }
.mode-btn { padding: 5px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; color: #888; border: 1px solid transparent; background: none; transition: 0.15s; }
.mode-btn:hover { color: #ccc; background: rgba(255,255,255,0.04); }
.mode-btn.active { color: #e0e0e0; background: rgba(255,255,255,0.07); border-color: #444; }
.header-actions { display: flex; gap: 4px; }
.icon-btn { background: none; border: none; color: #888; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 16px; }
.icon-btn:hover { color: #ccc; background: rgba(255,255,255,0.06); }
.scroll-area { flex: 1; overflow-y: auto; display: flex; flex-direction: column; min-height: 0; }
.chat-area { flex: 1; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
.msg { padding: 10px 16px; border-radius: 8px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-width: 92%; animation: fadeIn 0.2s; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
.msg.user { background: #2a2d2e; border: 1px solid #383838; align-self: flex-end; margin-left: 40px; }
.msg.ai { align-self: flex-start; border-left: 3px solid #4da6ff; padding-left: 14px; }
.msg.ai.thinking { border-left-color: #f0a030; }
.msg .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; opacity: 0.5; margin-bottom: 4px; }
.msg-content code { background: #2a2d2e; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
.msg-content pre { background: #2a2d2e; padding: 10px 12px; border-radius: 6px; overflow-x: auto; margin: 6px 0; font-size: 13px; }
.cursor-blink { animation: blink 0.8s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.welcome { text-align: center; padding: 40px 16px; opacity: 0.5; }
.welcome h2 { font-weight: 600; font-size: 18px; margin-bottom: 4px; }
.welcome p { font-size: 13px; }
.wf-steps { margin: 4px 0; }
.wf-step { display: flex; align-items: center; gap: 8px; padding: 6px 10px; margin: 3px 0; background: #252526; border-radius: 6px; border-left: 3px solid #555; font-size: 12px; }
.wf-step.completed { border-left-color: #4ec9b0; }
.wf-step.failed { border-left-color: #f44747; }
.wf-step.running { border-left-color: #3399ff; }
.wf-role { font-weight: 600; text-transform: uppercase; font-size: 10px; min-width: 60px; }
.wf-status { font-size: 10px; opacity: 0.6; margin-left: auto; }
.input-wrap { flex-shrink: 0; padding: 10px 16px; border-top: 1px solid #333; background: #1e1e1e; }
.input-bar { display: flex; gap: 8px; background: #3c3c3c; border: 1px solid #555; border-radius: 8px; padding: 6px 10px; align-items: center; }
.input-bar:focus-within { border-color: #4da6ff; }
.input-bar input { flex: 1; background: none; border: none; outline: none; color: #ccc; font-size: 14px; padding: 4px 2px; }
.input-bar input::placeholder { color: #666; }
.send-btn { background: #0e639c; color: #fff; border: none; padding: 6px 16px; border-radius: 5px; cursor: pointer; font-size: 13px; font-weight: 600; }
.send-btn:hover { background: #1177bb; }
.send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.footer-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 8px; }
.footer-bar select { background: #3c3c3c; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 2px 6px; font-size: 11px; }
.console-box { max-height: 100px; overflow-y: auto; padding: 4px 12px; font-family: monospace; font-size: 11px; background: #111; border-top: 1px solid #333; display: none; }
.console-box .info { color: #ccc; } .console-box .success { color: #4ec9b0; } .console-box .warn { color: #dcdcaa; } .console-box .error { color: #f44747; }
</style>
</head>
<body>
<div class="header">
  <span class="logo">LocalForge</span>
  <div class="modes">
    <button class="mode-btn active" onclick="setMode('chat')">Chat</button>
    <button class="mode-btn" onclick="setMode('agent')">Agent</button>
    <button class="mode-btn" onclick="setMode('plan')">Plan</button>
    <button class="mode-btn" onclick="setMode('build')">Build</button>
  </div>
  <div class="header-actions">
    <button class="icon-btn" onclick="runWorkflow()" title="Workflow" id="wfBtn" style="display:none">⟳</button>
    <button class="icon-btn" onclick="toggleConsole()" title="Console">≡</button>
    <button class="icon-btn" onclick="clearChat()" title="Clear">✕</button>
  </div>
</div>

<div class="scroll-area">
  <div class="chat-area" id="chatArea">
    <div class="welcome" id="welcomeMsg">
      <h2>LocalForge</h2>
      <p>Local-first AI development · 4 modes · Connect via opencode or self-hosted</p>
    </div>
  </div>
</div>

<div class="console-box" id="consoleBox"></div>

<div class="input-wrap">
  <div class="input-bar">
    <input id="msgInput" type="text" placeholder="Type a message..." autofocus>
    <button class="send-btn" id="sendBtn" onclick="sendMsg()">Send</button>
  </div>
  <div class="footer-bar">
    <span style="font-size:11px;color:#666" id="statusBar">Connected</span>
    <div style="display:flex;gap:6px;align-items:center">
      <select id="providerSelect" onchange="switchProvider(this.value)" style="font-size:11px">
        <option value="local">llama.cpp</option>
        <option value="opencode">OpenCode</option>
        <option value="openai">OpenAI API</option>
      </select>
    </div>
  </div>
</div>

<script>
let curMode = 'chat';
let streaming = false;
let streamEl = null;

document.getElementById('msgInput').focus();
document.getElementById('msgInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});

function setMode(m) {
  curMode = m;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === m));
  document.getElementById('wfBtn').style.display = m === 'build' ? 'inline-block' : 'none';
}

function switchProvider(t) {
  fetch('/api/provider', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:t}) })
    .then(r=>r.json()).then(d => document.getElementById('statusBar').textContent = 'Provider: '+d.label);
}

function sendMsg() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || streaming) return;
  input.value = '';
  addMsg(text, 'user');
  streaming = true;

  fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text, mode:curMode}) })
    .then(r => {
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      const aiMsg = addMsg('', 'ai');

      function read() {
        reader.read().then(({done, value}) => {
          if (done) { streaming=false; aiMsg.classList.remove('thinking'); aiMsg.querySelector('.cursor-blink')?.remove(); return; }
          const text = decoder.decode(value);
          const target = aiMsg.querySelector('.msg-content') || aiMsg;
          target.textContent += text;
          document.getElementById('chatArea').scrollTop = document.getElementById('chatArea').scrollHeight;
          read();
        });
      }
      read();
    })
    .catch(err => { addConsole('error', 'Request failed: '+err.message); streaming=false; });
}

function addMsg(text, role) {
  const area = document.getElementById('chatArea');
  const welc = document.getElementById('welcomeMsg');
  if (welc) welc.style.display = 'none';
  const div = document.createElement('div');
  div.className = 'msg ' + role + (role === 'ai' ? ' thinking' : '');
  if (role === 'user') {
    div.innerHTML = '<div class="label">You</div><div class="msg-content">' + escHtml(text) + '</div>';
  } else {
    div.innerHTML = '<div class="label">LocalForge</div><div class="msg-content"></div><span class="cursor-blink">█</span>';
  }
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
  return div;
}

function runWorkflow() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text || streaming) return;
  input.value = '';
  addMsg(text, 'user');
  fetch('/api/workflow', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({goal:text}) })
    .then(r=>r.json()).then(d => {
      let html = '<div class="wf-steps">';
      (d.steps||[]).forEach(s => { html += '<div class="wf-step '+s.status+'"><span class="wf-role">'+s.role+'</span><span>'+(s.output||s.error||'...').substring(0,100)+'</span><span class="wf-status">'+s.status+'</span></div>'; });
      html += '</div>';
      const div = document.createElement('div');
      div.className = 'msg ai';
      div.innerHTML = '<div class="label">Workflow</div>'+html;
      document.getElementById('chatArea').appendChild(div);
      document.getElementById('chatArea').scrollTop = document.getElementById('chatArea').scrollHeight;
    });
}

function toggleConsole() {
  const c = document.getElementById('consoleBox');
  c.style.display = c.style.display === 'block' ? 'none' : 'block';
}

function addConsole(level, text) {
  const c = document.getElementById('consoleBox');
  const d = document.createElement('div');
  d.className = level;
  d.textContent = text;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function clearChat() {
  document.getElementById('chatArea').innerHTML = '<div class="welcome"><h2>LocalForge</h2><p>Session cleared</p></div>';
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
</script>
</body>
</html>`;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const apiKey = process.env.LOCALFORGE_API_KEY;
    if (apiKey) {
      const provided = req.headers['authorization']?.replace(/^Bearer\s+/i, '') || '';
      if (provided !== apiKey) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized. Set Authorization: Bearer <key> header.' }));
        return;
      }
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(serveHTML());
      return;
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => body += chunk.toString());
      req.on('end', async () => {
        try {
          const { message, mode } = JSON.parse(body);
          const { engine, pm } = createEngine();
          const m = (mode === 'agent' ? Mode.Agent : mode === 'plan' ? Mode.Plan : mode === 'build' ? Mode.Build : Mode.Chat) as Mode;

          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });

          engine.onToken = (token) => res.write(token);
          engine.onStreamStart = () => {};
          engine.onStreamEnd = () => res.end();

          try {
            const result = await engine.processRequest(m, message, '');
            if (!engine.onToken) {
              res.write(result.message || '');
              res.end();
            }
          } catch (err: any) {
            res.write(`Error: ${err.message}`);
            res.end();
          }
        } catch (err: any) {
          res.writeHead(400);
          res.end(`Bad request: ${err.message}`);
        }
      });
      return;
    }

    if (url.pathname === '/api/workflow' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => body += chunk.toString());
      req.on('end', async () => {
        try {
          const { goal } = JSON.parse(body);
          const { pm } = createEngine();
          const wf = new WorkflowEngine();
          const result = await wf.runWorkflow(goal, '', (messages, temp, maxTok, stream) => pm.query(messages, temp, maxTok, stream));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/provider' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk: Buffer) => body += chunk.toString());
      req.on('end', () => {
        try {
          const { type } = JSON.parse(body);
          const { pm } = createEngine();
          const labels: Record<string, string> = { local: 'llama.cpp (Local)', opencode: 'OpenCode (75+ providers)', openai: 'OpenAI-Compatible API' };
          const ep = type === 'local' ? 'http://127.0.0.1:11434/v1' : type === 'opencode' ? 'http://127.0.0.1:4096' : 'https://api.openai.com/v1';
          const cfg = pm.getConfig();
          if (type === 'openai') cfg.apiKey = process.env.LOCALFORGE_API_KEY || 'sk-demo';
          pm.setConfig({ ...cfg, type, label: labels[type] || type, endpoint: ep });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type, label: labels[type] }));
        } catch (err: any) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/config' && req.method === 'GET') {
      const { pm } = createEngine();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pm.getConfig()));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(PORT, HOST, () => {
    const authMsg = process.env.LOCALFORGE_API_KEY ? ' (API key required)' : '';
    console.log(`\n  LocalForge Web UI running at http://${HOST}:${PORT}${authMsg}`);
    console.log(`  Provider: ${process.env.LOCALFORGE_PROVIDER || 'local'}`);
    console.log(`  Press Ctrl+C to stop\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n  ${signal} received. Shutting down...`);
    server.close(() => {
      console.log('  Server stopped.');
      process.exit(0);
    });
    setTimeout(() => { console.error('  Forced shutdown.'); process.exit(1); }, 5000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    console.error(`\n  Uncaught exception: ${err.message}`);
    shutdown('ERROR');
  });
}

startServer();

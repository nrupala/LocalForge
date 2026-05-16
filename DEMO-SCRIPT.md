# LocalForge Demo Script

A 3-minute guided walkthrough of all three interfaces and the multi-agent workflow.

---

## CLI Demo (45 seconds)

```bash
# Open terminal, run:
localforge

# Interactive mode opens. Type:
> hello

> plan a REST API with Express

> /workflow "add input validation to API"
```

**What to show:** Terminal splitting (left pane = CLI, right pane = generated files).

**Narrator:** "LocalForge runs entirely on your machine. No cloud dependency, no data leaves your laptop. The CLI supports chat, planning, and our signature multi-agent workflow."

---

## Web UI Demo (60 seconds)

```bash
# Open second terminal:
localforge-server
```

**What to show:** Open `http://localhost:3096` in browser. Demo:
1. Type a message → see SSE streaming
2. Click "Workflow" button → see Planner→Writer→Reviewer→Tester pipeline animate
3. Switch provider dropdown from "local" to "opencode" to "openai"
4. Collapse/expand console panel

**Narrator:** "The web UI gives you the same power in your browser. Perfect for teams, demos, or when you don't want to leave your workflow."

---

## VS Code Extension Demo (60 seconds)

**What to show:**
1. Open VS Code, press `Ctrl+Shift+P`, type "LocalForge"
2. Chat panel opens in sidebar
3. Type "explain this code" → agent reads the active file
4. Switch to Build mode → run workflow → watch files get created in the explorer
5. Show settings: provider selection, encryption toggle, approval mode

**Narrator:** "The VS Code extension puts LocalForge right where you code. Chat, plan, build — all without leaving your editor."

---

## Multi-Agent Workflow Highlight (15 seconds)

Overlay showing the 4-step pipeline:

```
Planner → Writer → Reviewer → Tester
   │         │         │         │
   ▼         ▼         ▼         ▼
  Plan      Code      Review    Tests
  ready    written    passed    passing
```

**Narrator:** "The multi-agent workflow is what sets LocalForge apart. One command, four AI agents working together: plan the architecture, write the code, review for issues, and write tests. It's like having a full engineering team in your terminal."

---

## Recording Tips

1. **Use a dark terminal theme** (VS Code Dark+, Dracula, or similar)
2. **Set terminal font to 16pt** for readability
3. **Record at 1920×1080** for YouTube
4. **Show real file changes** in VS Code Explorer sidebar
5. **Highlight the auto-commit** (git log after workflow)
6. **End with the pricing page** (link to localforge.dev)

## Tools for recording
- **OBS Studio** (free, open source)
- **Screen Studio** (polished, $89 one-time)
- **Kap** (free, macOS only)

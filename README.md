# Antigravity Overview Hub

A dependency-free, version-safe enhancement patch for the **Antigravity** desktop application. It turns the Overview menu into a project control center with auto-discovered MCP server management, context and token analytics, rules and skills browsing, and auto-detected project actions.

Because the patch builds dynamically from your **currently installed** `app.asar` (never shipping or overwriting with stale binaries), it never downgrades Antigravity and adapts cleanly across updates.

---

## Features

1. **Auto-Discovered MCP Servers + Real Disable**
   - Reads servers dynamically from `~/.gemini/config/mcp_config.json` (plus `antigravity` / `antigravity-ide` configs) and loaded tool schemas under `~/.gemini/antigravity/mcp/`.
   - **Status dots**: green = enabled & tools loaded, amber = enabled without local schemas, grey = disabled. Click a server name to inspect its tools.
   - **Real unload/disable**: toggling a configured server OFF moves its definition to `~/.gemini/config/mcp_disabled.json` so it does not load or consume context window; toggling ON restores it cleanly.
   - **`RO` / `RW` mode toggle**: automatically appears for database or tool servers with `env.READONLY` or `env.DB_READONLY` (e.g., `mssql`, `sqlite`).
   - **Agent policy sync**: writes `<workspace>/.agents/rules/00-active-mcps.md` with `trigger: always_on` frontmatter so new agent sessions immediately know which MCP servers are active (and which ones to avoid).

2. **Smart Workspace Detection & Switcher**
   - Auto-detects the active project from your pinned workspace (`~/.gemini/config/hub_workspace.json`), working directory, or Antigravity's most recently used project in `~/.gemini/config/projects/`.
   - Status bar shows `<project> @ <branch> (<N> chg)`, `graphify` knowledge graph age (if present), `Hooks ON/OFF` shortcut, and `Map` (`AGENTS.md` / `GEMINI.md` / `CLAUDE.md`) shortcut.
   - Click the workspace name to switch target folders anytime via native folder picker.

3. **Auto-Detected Project Actions**
   - Automatically detects scripts and build commands for any repo:
     - `package.json` scripts (`npm run dev`, `build`, `test`, `lint`, `typecheck`, ...)
     - `.NET` (`dotnet build`, `dotnet test`)
     - `Python` (`pytest`), `Rust` (`cargo test`), `Go` (`go test ./...`)
     - `graphify` (`Update Graph` if `graphify-out/graph.json` exists)
     - Custom project buttons via `<workspace>/.agents/hub.json` (see [`examples/hub.example.json`](./examples/hub.example.json))

4. **Quick Prompts**
   - Universal one-click prompt starters (`Explain Codebase`, `Review Diff`, `Write Tests`, `Refactor`, `Fix Build / Lint`, `Commit Msg`), plus project-specific prompts from `.agents/hub.json`.

5. **Rules & Skills Explorer**
   - **Rules**: lists `.agents/rules/*.md` with trigger badges (`ALWAYS`, `COND`, `MANUAL`). Toggling off renames to `*.md.disabled` safely without deleting files.
   - **Skills**: scans project (`.agents/skills`), global (`~/.gemini/config/skills`), and plugin (`~/.gemini/config/plugins/*/skills`) skills with live filtering and click-to-insert.

6. **Context Usage & Token History**
   - Live context usage bar for the latest conversation.
   - Bar chart of peak context usage across your last 12 conversations (hover for title, output tokens, and step count).

7. **Auto-Repatch After Updates (Windows)**
   - Optional Windows Task Scheduler helper checks every 5 minutes (silently) and re-applies the patch after Antigravity updates once the app is closed.

---

## Requirements

- **Node.js** 18+ on `PATH` (no `npm install` needed — zero external dependencies).
- Antigravity desktop application installed (Windows, macOS, or Linux).

---

## Installation

### Windows
Double-click **`apply_patch.bat`** (or run from terminal):
```bat
apply_patch.bat
```
This closes Antigravity, backs up your original `app.asar` to `app.asar.bak`, injects and verifies the hub for your exact installed version, and relaunches Antigravity.

To automatically re-apply after Antigravity updates (once):
```bat
install_autopatch.bat
```
To remove the scheduled task later:
```bat
install_autopatch.bat /remove
```

### macOS / Linux
```bash
chmod +x apply_patch.sh restore_original.sh
./apply_patch.sh
```

### Manual / Custom Install Path
```bash
node src/build.js --install --resources "/path/to/Antigravity/resources"
node src/verify.js
```

---

## Customizing for Your Project (`.agents/hub.json`)

Drop an optional `.agents/hub.json` into any repository to add project-specific CLI buttons and prompt starters (see [`examples/hub.example.json`](./examples/hub.example.json)):

```json
{
  "actions": [
    { "label": "Dev Server", "command": "npm run dev", "primary": true },
    { "label": "Deploy Staging", "command": "./scripts/deploy-staging.sh", "confirm": true }
  ],
  "prompts": [
    { "label": "Feature Spec", "text": "Read the relevant modules first and propose a minimal plan." }
  ]
}
```

---

## Architecture

| File | Purpose |
| --- | --- |
| `src/asar.js` | Dependency-free ASAR reader/writer with SHA-256 block integrity recomputation |
| `src/paths.js` | Cross-platform Antigravity `resources` directory discovery |
| `src/main-inject.js` | Main-process IPC handlers injected into `dist/ipcHandlers.js` |
| `src/preload-inject.js` | Collapsible Overview Hub UI injected into `dist/preload.js` |
| `src/build.js` | Source-preserving patcher (`--install`, `--if-needed`, `--skip-if-running`, `--resources`) |
| `src/verify.js` | Syntax check and byte-for-byte verification of all untouched ASAR entries |
| `src/test-main.js` | Automated handler test suite running in an isolated temporary directory |

---

## Rollback

- **Windows:** run `restore_original.bat`
- **macOS / Linux:** run `./restore_original.sh`

Both restore the untouched `app.asar.bak` created during installation.

---

## Disclaimer

This tool modifies your local Electron `app.asar` bundle for personal productivity enhancements and is not affiliated with or endorsed by Google Antigravity. Always keep `app.asar.bak` intact for instant rollback.

## License

[MIT](./LICENSE)

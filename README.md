# Antigravity Overview Hub Patch

> **Documentation status:** Active
> **Last verified:** 2026-11-12 (Asia/Baku)

Patch for the Antigravity desktop application that adds an Overview hub with quick actions, auto-discovered MCP server toggles, context usage and skill discovery.

## Features

1. **Actions**: `Run /compact` and `Refresh` (rescan servers and skills).
2. **Context usage bar**: tokens used by the latest conversation (green below 60%, amber below 80%, red above).
3. **Auto-discovered MCP servers**:
   - Read from `~/.gemini/config/mcp_config.json` (plus `antigravity` and `antigravity-ide` configs) and the loaded tool schema folders under `~/.gemini/antigravity/mcp/`. Nothing is hard-coded; new servers appear automatically and default to enabled, removed servers disappear.
   - Status dot: green = enabled and tools loaded, amber = enabled but no tool schemas found, grey = disabled.
   - Click a server name to list its tools. `Config` opens `mcp_config.json`.
   - Toggles are stored in `~/.gemini/config/mcp_toggles.json` and written to `.agents/rules/00-active-mcps.md` (active servers with their tool lists, plus the disabled ones the agent must not use).
4. **Skills**: project, global and plugin skills (folders containing `SKILL.md`), colour-coded by scope, with a filter box. Click a skill to insert `Use the <skill> skill.` into the prompt.
5. **Real MCP disable & RO/RW toggle**: for servers defined in an `mcp_config.json`, switching off moves the definition into `~/.gemini/config/mcp_disabled.json` and switching on restores it, so a disabled server is not loaded and costs no context. Servers with `env.READONLY` (such as `mssql`) display an `RO`/`RW` button to switch between read-only and read-write modes. A banner asks for an Antigravity restart after a change. Plugin-provided servers are marked `rule only` (the switch only changes the rule file).
6. **Rules panel**: lists `.agents/rules/*.md` with their trigger (`ALWAYS`, `COND`); switching off renames the file to `*.md.disabled`. `00-active-mcps.md` is managed by the hub and not listed.
7. **SkyChef CLI & Workspace Strip**: status bar showing the git branch, uncommitted change count, `graphify` graph age, and shortcuts to `.agents/hooks.json` and `AGENTS.md`. Action buttons open `skychef.ps1` (`Menu`, `Sync`, `Deploy Test`, `Logs`, `Stats`, `Backup Test DB`, `SSH`), run architecture ratchet tests (`Arch Tests`), or update the knowledge graph (`Update Graph`). Production commands are intentionally excluded.
8. **Quick Prompts**: one-click SkyChef prompt starters (`CQRS Feature`, `Master Page`, `Detail Page`, `EF Migration`, `Review Diff`, `Commit Msg`).
9. **Token history**: bar chart of peak context for the last 12 conversations (hover for title, output tokens and steps).

Sections are collapsible; the open/closed state is remembered.

## Layout

| Path | Purpose |
| --- | --- |
| `src/main-inject.js` | Main-process IPC handlers, injected into `dist/ipcHandlers.js` |
| `src/preload-inject.js` | Renderer hub UI, appended to `dist/preload.js` |
| `src/asar.js` | Dependency-free ASAR reader/writer (recomputes integrity hashes) |
| `src/build.js` | Builds `app.asar` from the installed version; `--install` copies it in |
| `src/verify.js` | Syntax check and byte comparison of untouched entries |

## Apply

Run `apply_patch.bat`. It closes Antigravity, builds the patch from the **currently installed** version (so updates never get downgraded), refreshes `app.asar.bak`, installs and relaunches.

Antigravity auto-updates replace `app.asar`. Run `install_autopatch.bat` once to register the `AntigravityHubAutoRepatch` scheduled task: every 5 minutes it checks (hidden, via `auto_repatch.vbs`) whether the installed archive carries the current build hash and, if not and Antigravity is closed, re-applies the patch. Editing `src/*-inject.js` changes the build hash, so source changes are also picked up automatically. Log: `logs/auto_repatch.log`. Remove with `install_autopatch.bat /remove`.

Run `node src/test-main.js` to exercise the main-process handlers against a temporary home directory.

## Rollback

Run `restore_original.bat` to restore `app.asar.bak`.

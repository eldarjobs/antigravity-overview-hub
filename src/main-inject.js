    // ---- AG_EXTENSION_HUB (main process) --------------------------------------
    const agHubOs = require('os');
    const AG_HOME = agHubOs.homedir();
    const AG_CFG_DIR = path.join(AG_HOME, '.gemini', 'config');
    const AG_TOGGLES = path.join(AG_CFG_DIR, 'mcp_toggles.json');
    const AG_PARKED = path.join(AG_CFG_DIR, 'mcp_disabled.json');
    const AG_WS_PIN = path.join(AG_CFG_DIR, 'hub_workspace.json');
    const AG_MCP_CONFIGS = [
        path.join(AG_CFG_DIR, 'mcp_config.json'),
        path.join(AG_HOME, '.gemini', 'antigravity', 'mcp_config.json'),
        path.join(AG_HOME, '.gemini', 'antigravity-ide', 'mcp_config.json'),
    ];
    const AG_MCP_TOOL_DIRS = [
        path.join(AG_HOME, '.gemini', 'antigravity', 'mcp'),
        path.join(AG_HOME, '.gemini', 'antigravity-ide', 'mcp'),
    ];
    const AG_KNOWN = {
        serena: ['Codebase Intel', 'Actively use Serena semantic code tools (symbol search, references, structure) for code understanding and refactoring.'],
        context7: ['Docs & API Reference', 'Actively query Context7 for current library, framework, SDK and CLI documentation.'],
        graphify: ['Code Knowledge Graph', 'Actively use the Graphify knowledge graph to locate god nodes, dependencies, communities and architectural hubs.'],
        mssql: ['SQL Server', 'Use the MSSQL tools to inspect schemas, profile tables and run read queries. Ask before any write or DDL operation.'],
        postgres: ['PostgreSQL', 'Use PostgreSQL tools to inspect schemas and query data safely.'],
        sqlite: ['SQLite', 'Use SQLite tools to inspect local database schemas and query rows.'],
        github: ['GitHub', 'Use GitHub tools to inspect issues, pull requests, and repository state.'],
        playwright: ['Browser Automation', 'Use Playwright tools for end-to-end UI inspection and browser testing.'],
        filesystem: ['Filesystem', 'Use filesystem MCP tools when structured file operations are needed.'],
        'microsoft-learn': ['Microsoft Docs', 'Query Microsoft Learn for .NET, ASP.NET Core, EF Core, Azure and SQL Server documentation.'],
        'sequential-thinking': ['Step Reasoning', 'Use sequential thinking for complex multi-step design or debugging problems.'],
    };
    const agReadJson = (p) => { try { return JSON.parse(fsSync.readFileSync(p, 'utf8')); } catch { return null; } };
    let agRestartPending = false;
    let agMetaCache = { ts: 0, root: '', val: null };
    const agTokenCache = new Map();

    function agDecodeFolderUri(uri) {
        if (typeof uri !== 'string' || !uri.startsWith('file://')) return null;
        try {
            let p = decodeURIComponent(uri.replace(/^file:\/\//, ''));
            if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
            return path.normalize(p);
        } catch { return null; }
    }

    function agRecentProjectPaths() {
        const dir = path.join(AG_CFG_DIR, 'projects');
        const list = [];
        try {
            const files = fsSync.readdirSync(dir)
                .filter(f => f.endsWith('.json') && f !== 'outside-of-project.json')
                .map(f => {
                    const full = path.join(dir, f);
                    return { full, mtime: fsSync.statSync(full).mtimeMs };
                })
                .sort((a, b) => b.mtime - a.mtime);
            for (const f of files) {
                const data = agReadJson(f.full);
                const res = data?.projectResources?.resources;
                if (!Array.isArray(res)) continue;
                for (const r of res) {
                    const p = agDecodeFolderUri(r.folderUri);
                    if (p && fsSync.existsSync(p)) list.push(p);
                }
            }
        } catch {}
        return [...new Set(list)];
    }

    function agWorkspaceRoot() {
        const pinned = agReadJson(AG_WS_PIN);
        if (pinned && typeof pinned.workspace === 'string' && fsSync.existsSync(pinned.workspace)) {
            return pinned.workspace;
        }
        const cwd = process.cwd();
        const isGenericCwd = /\\(AppData|System32|Windows|Programs\\Antigravity)/i.test(cwd);
        if (!isGenericCwd && (fsSync.existsSync(path.join(cwd, '.git')) || fsSync.existsSync(path.join(cwd, '.agents')) || fsSync.existsSync(path.join(cwd, 'package.json')))) {
            return cwd;
        }
        const recent = agRecentProjectPaths();
        if (recent.length > 0) return recent[0];
        return cwd;
    }

    function agDiscoverServers() {
        const servers = new Map();
        let configPath = null;
        for (const cfgPath of AG_MCP_CONFIGS) {
            const cfg = agReadJson(cfgPath);
            if (!cfg || !cfg.mcpServers) continue;
            configPath = configPath || cfgPath;
            for (const [id, def] of Object.entries(cfg.mcpServers)) {
                if (servers.has(id)) continue;
                const transport = def.command ? 'stdio' : (def.serverUrl || def.url) ? 'http' : 'unknown';
                const roKey = def.env ? ['READONLY', 'DB_READONLY'].find(k => Object.prototype.hasOwnProperty.call(def.env, k)) : null;
                const readonly = roKey ? String(def.env[roKey]).toLowerCase() === 'true' : null;
                servers.set(id, { id, transport, disabledInConfig: Boolean(def.disabled), source: cfgPath, tools: [], readonly, roKey });
            }
        }
        for (const dir of AG_MCP_TOOL_DIRS) {
            let entries = [];
            try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
            for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                let tools = [];
                try { tools = fsSync.readdirSync(path.join(dir, ent.name)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch {}
                const s = servers.get(ent.name) || { id: ent.name, transport: 'plugin', disabledInConfig: false, source: dir, tools: [], readonly: null, roKey: null };
                if (tools.length > s.tools.length) s.tools = tools;
                servers.set(ent.name, s);
            }
        }
        const parked = agReadJson(AG_PARKED) || {};
        for (const [id, entry] of Object.entries(parked)) {
            const env = entry.def && entry.def.env;
            const roKey = env ? ['READONLY', 'DB_READONLY'].find(k => Object.prototype.hasOwnProperty.call(env, k)) : null;
            const readonly = roKey ? String(env[roKey]).toLowerCase() === 'true' : null;
            const s = servers.get(id) || { id, transport: entry.def && entry.def.command ? 'stdio' : 'http', source: entry.source, tools: [], readonly, roKey };
            s.parked = true;
            servers.set(id, s);
        }
        for (const s of servers.values()) s.configurable = Boolean(s.parked || AG_MCP_CONFIGS.includes(s.source));
        return { servers: [...servers.values()], configPath };
    }

    function agReadToggles(serverIds) {
        const stored = agReadJson(AG_TOGGLES) || {};
        const toggles = {};
        for (const id of serverIds) toggles[id] = Object.prototype.hasOwnProperty.call(stored, id) ? Boolean(stored[id]) : true;
        return { toggles, changed: JSON.stringify(stored) !== JSON.stringify(toggles) };
    }

    function agWriteRuleFile(servers, toggles) {
        try {
            const root = agWorkspaceRoot();
            if (!root || !fsSync.existsSync(root)) return;
            const rulesDir = path.join(root, '.agents', 'rules');
            const file = path.join(rulesDir, '00-active-mcps.md');
            const active = servers.filter(s => toggles[s.id] && !s.disabledInConfig);
            if (active.length === 0) { try { fsSync.unlinkSync(file); } catch {} return; }
            let md = '---\nname: active-mcp-servers\ndescription: MCP servers enabled in the Overview hub and how to use them proactively.\ntrigger: always_on\n---\n\n# Proactive MCP Tool Usage Policy\n\n';
            md += 'Generated by the Antigravity Overview hub. The following MCP servers are ACTIVE; use their tools proactively for relevant tasks without waiting for an explicit request. Lazy-loaded tools are called through `call_mcp_tool` after reading their schema.\n\n';
            if (active.some(s => s.id === 'serena')) {
                md += '**Serena first for code navigation**: at the start of any code task, call serena `initial_instructions` once per session, then prefer Serena symbol tools over text search for finding definitions, references and call sites.\n\n';
            }
            for (const s of active) {
                const known = AG_KNOWN[s.id];
                const tools = s.tools.length ? ` Tools: ${s.tools.join(', ')}.` : '';
                const ro = s.readonly === true ? ' (READONLY mode)' : s.readonly === false ? ' (READ/WRITE mode — ask before write/DDL)' : '';
                md += `- **${s.id}**${ro}: ${known ? known[1] : 'Active MCP server. Use its tools for relevant tasks.'}${tools}\n`;
            }
            const off = servers.filter(s => !toggles[s.id]).map(s => s.id);
            if (off.length) md += `\nDo not use these servers unless the user asks explicitly: ${off.join(', ')}.\n`;
            fsSync.mkdirSync(rulesDir, { recursive: true });
            const prev = (() => { try { return fsSync.readFileSync(file, 'utf8'); } catch { return null; } })();
            if (prev !== md) fsSync.writeFileSync(file, md, 'utf8');
        } catch {}
    }

    function agListSkills() {
        const skills = [];
        const scan = (dir, scope) => {
            try {
                for (const ent of fsSync.readdirSync(dir, { withFileTypes: true })) {
                    if (ent.isDirectory() && fsSync.existsSync(path.join(dir, ent.name, 'SKILL.md'))) skills.push({ name: ent.name, scope });
                }
            } catch {}
        };
        scan(path.join(agWorkspaceRoot(), '.agents', 'skills'), 'project');
        scan(path.join(AG_CFG_DIR, 'skills'), 'global');
        try {
            for (const p of fsSync.readdirSync(path.join(AG_CFG_DIR, 'plugins'), { withFileTypes: true })) {
                if (p.isDirectory()) scan(path.join(AG_CFG_DIR, 'plugins', p.name, 'skills'), `plugin:${p.name}`);
            }
        } catch {}
        return skills;
    }

    function agRulesDir() { return path.join(agWorkspaceRoot(), '.agents', 'rules'); }
    function agListRules() {
        const dir = agRulesDir();
        let files = [];
        try { files = fsSync.readdirSync(dir); } catch { return []; }
        return files.filter(f => (f.endsWith('.md') || f.endsWith('.md.disabled')) && f !== '00-active-mcps.md').map(f => {
            const enabled = f.endsWith('.md');
            const name = enabled ? f : f.slice(0, -'.disabled'.length);
            let trigger = 'always_on', desc = '';
            try {
                const head = fsSync.readFileSync(path.join(dir, f), 'utf8').slice(0, 1500);
                const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                if (fm) {
                    const t = fm[1].match(/^trigger:\s*(.+)$/m); if (t) trigger = t[1].trim();
                    const d = fm[1].match(/^description:\s*(.+)$/m); if (d) desc = d[1].trim();
                }
            } catch {}
            return { name, enabled, trigger, desc };
        }).sort((a, b) => a.name.localeCompare(b.name));
    }

    function agToggleRule(name, enabled) {
        if (typeof name !== 'string' || !/^[\w.-]+\.md$/.test(name) || name === '00-active-mcps.md') return;
        const dir = agRulesDir();
        const on = path.join(dir, name), off = on + '.disabled';
        if (enabled && fsSync.existsSync(off)) fsSync.renameSync(off, on);
        if (!enabled && fsSync.existsSync(on)) fsSync.renameSync(on, off);
    }

    // ---- Project Actions & Prompts Auto-Discovery ------------------------------
    function agDiscoverProjectActions() {
        const root = agWorkspaceRoot();
        const actions = [];
        const customPrompts = [];
        const add = (id, label, cmd, primary, confirm) => actions.push({ id, label, cmd, primary: Boolean(primary), confirm: Boolean(confirm) });

        // 1. Custom project config (.agents/hub.json)
        const hubCfg = agReadJson(path.join(root, '.agents', 'hub.json'));
        if (hubCfg) {
            if (Array.isArray(hubCfg.actions)) {
                for (const a of hubCfg.actions) {
                    if (a && a.label && a.command) add(`custom:${a.label}`, String(a.label), String(a.command), a.primary, a.confirm);
                }
            }
            if (Array.isArray(hubCfg.prompts)) {
                for (const p of hubCfg.prompts) {
                    if (p && p.label && p.text) customPrompts.push({ label: String(p.label), text: String(p.text) });
                }
            }
        }

        // 2. Node.js package.json scripts
        const pkg = agReadJson(path.join(root, 'package.json'));
        if (pkg && pkg.scripts) {
            const preferred = ['dev', 'start', 'build', 'test', 'lint', 'typecheck'];
            const keys = Object.keys(pkg.scripts);
            const picked = [...preferred.filter(k => keys.includes(k)), ...keys.filter(k => !preferred.includes(k))].slice(0, 6);
            for (const k of picked) {
                add(`npm:${k}`, `npm ${k}`, `npm run ${k}`, k === 'dev' || k === 'test', /deploy|release|prod/i.test(k));
            }
        }

        // 3. .NET solutions/projects
        try {
            const entries = fsSync.readdirSync(root);
            if (entries.some(f => f.endsWith('.sln') || f.endsWith('.csproj') || f === 'Directory.Build.props' || f === 'global.json')) {
                add('dotnet:build', 'dotnet build', 'dotnet build', false, false);
                add('dotnet:test', 'dotnet test', 'dotnet test', false, false);
            }
            if (entries.includes('pyproject.toml') || entries.includes('pytest.ini')) {
                add('py:test', 'pytest', 'pytest', false, false);
            }
            if (entries.includes('Cargo.toml')) {
                add('cargo:test', 'cargo test', 'cargo test', false, false);
            }
            if (entries.includes('go.mod')) {
                add('go:test', 'go test', 'go test ./...', false, false);
            }
        } catch {}

        // 4. Graphify graph update
        if (fsSync.existsSync(path.join(root, 'graphify-out', 'graph.json'))) {
            add('tool:graphify', 'Update Graph', 'graphify update .', false, false);
        }

        return { actions: actions.slice(0, 10), customPrompts };
    }

    function agRunCommandInTerminal(commandStr) {
        const root = agWorkspaceRoot();
        const { actions } = agDiscoverProjectActions();
        const allowed = actions.find(a => a.cmd === commandStr);
        if (!allowed || !fsSync.existsSync(root)) return false;
        const { spawn } = require('child_process');
        if (process.platform === 'win32') {
            spawn('cmd.exe', ['/c', 'start', `"${allowed.label}"`, 'powershell.exe', '-NoExit', '-Command', allowed.cmd], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref();
        } else if (process.platform === 'darwin') {
            const escCmd = `cd '${root.replace(/'/g, "'\\''")}' && ${allowed.cmd}`;
            spawn('osascript', ['-e', `tell application "Terminal" to do script "${escCmd.replace(/"/g, '\\"')}"`], { detached: true, stdio: 'ignore' }).unref();
        } else {
            spawn('x-terminal-emulator', ['-e', 'bash', '-lc', `${allowed.cmd}; exec bash`], { cwd: root, detached: true, stdio: 'ignore' }).unref();
        }
        agMetaCache.ts = 0;
        return true;
    }

    function agSetServerEnabled(id, enabled) {
        const parked = agReadJson(AG_PARKED) || {};
        if (enabled) {
            const entry = parked[id];
            if (!entry) return false;
            const cfg = agReadJson(entry.source) || { mcpServers: {} };
            cfg.mcpServers = cfg.mcpServers || {};
            cfg.mcpServers[id] = entry.def;
            fsSync.writeFileSync(entry.source, JSON.stringify(cfg, null, 2), 'utf8');
            delete parked[id];
        } else {
            const source = AG_MCP_CONFIGS.find(p => { const c = agReadJson(p); return c && c.mcpServers && c.mcpServers[id]; });
            if (!source) return false;
            const cfg = agReadJson(source);
            parked[id] = { source, def: cfg.mcpServers[id], parkedAt: new Date().toISOString() };
            delete cfg.mcpServers[id];
            fsSync.writeFileSync(source, JSON.stringify(cfg, null, 2), 'utf8');
        }
        fsSync.writeFileSync(AG_PARKED, JSON.stringify(parked, null, 2), 'utf8');
        agRestartPending = true;
        return true;
    }

    function agToggleServerReadonly(id) {
        const findKey = (env) => env && ['READONLY', 'DB_READONLY'].find(k => Object.prototype.hasOwnProperty.call(env, k));
        const source = AG_MCP_CONFIGS.find(p => { const c = agReadJson(p); return c && c.mcpServers && c.mcpServers[id] && findKey(c.mcpServers[id].env); });
        if (source) {
            const cfg = agReadJson(source);
            const k = findKey(cfg.mcpServers[id].env);
            cfg.mcpServers[id].env[k] = String(cfg.mcpServers[id].env[k]).toLowerCase() === 'true' ? 'false' : 'true';
            fsSync.writeFileSync(source, JSON.stringify(cfg, null, 2), 'utf8');
            agRestartPending = true;
        } else {
            const parked = agReadJson(AG_PARKED) || {};
            const k = findKey(parked[id]?.def?.env);
            if (!k) return false;
            parked[id].def.env[k] = String(parked[id].def.env[k]).toLowerCase() === 'true' ? 'false' : 'true';
            fsSync.writeFileSync(AG_PARKED, JSON.stringify(parked, null, 2), 'utf8');
        }
        const { servers } = agDiscoverServers();
        const { toggles } = agReadToggles(servers.map(s => s.id));
        agWriteRuleFile(servers, toggles);
        return true;
    }

    function agWorkspaceMeta(root) {
        if (agMetaCache.root === root && agMetaCache.val && Date.now() - agMetaCache.ts < 8000) return agMetaCache.val;
        let branch = '', dirtyCount = 0, graphAgeHours = null;
        const hooksActive = fsSync.existsSync(path.join(root, '.agents', 'hooks.json'));
        const mapFile = ['AGENTS.md', 'GEMINI.md', 'CLAUDE.md'].find(f => fsSync.existsSync(path.join(root, f))) || null;
        try {
            const { execFileSync } = require('child_process');
            branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            const st = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            dirtyCount = st ? st.split(/\r?\n/).length : 0;
        } catch {}
        try {
            const gf = path.join(root, 'graphify-out', 'graph.json');
            if (fsSync.existsSync(gf)) graphAgeHours = Math.round((Date.now() - fsSync.statSync(gf).mtimeMs) / 36e5);
        } catch {}
        const val = { name: path.basename(root), branch, dirtyCount, graphAgeHours, hooksActive, mapFile };
        agMetaCache = { ts: Date.now(), root, val };
        return val;
    }

    function agHubState() {
        const root = agWorkspaceRoot();
        const { servers, configPath } = agDiscoverServers();
        const { toggles, changed: togglesChanged } = agReadToggles(servers.map(s => s.id));
        let changed = togglesChanged;
        for (const s of servers) if (s.parked && toggles[s.id]) { toggles[s.id] = false; changed = true; }
        if (changed) {
            try { fsSync.mkdirSync(AG_CFG_DIR, { recursive: true }); fsSync.writeFileSync(AG_TOGGLES, JSON.stringify(toggles, null, 2), 'utf8'); } catch {}
            agWriteRuleFile(servers, toggles);
        }
        const { actions, customPrompts } = agDiscoverProjectActions();
        return {
            servers: servers.map(s => ({
                id: s.id,
                desc: (AG_KNOWN[s.id] || [s.transport === 'http' ? 'Remote MCP' : 'Local MCP'])[0],
                transport: s.transport,
                toolCount: s.tools.length,
                tools: s.tools,
                loaded: s.tools.length > 0,
                disabledInConfig: s.disabledInConfig,
                enabled: toggles[s.id],
                parked: Boolean(s.parked),
                configurable: Boolean(s.configurable),
                readonly: s.readonly,
            })),
            restartPending: agRestartPending,
            skills: agListSkills(),
            actions,
            customPrompts,
            meta: agWorkspaceMeta(root),
            configPath,
            workspace: root,
        };
    }

    function agTokenHistory(limit) {
        const brainDir = path.join(AG_HOME, '.gemini', 'antigravity', 'brain');
        const items = [];
        try {
            for (const ent of fsSync.readdirSync(brainDir, { withFileTypes: true })) {
                if (!ent.isDirectory()) continue;
                const t = path.join(brainDir, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
                try { const st = fsSync.statSync(t); items.push({ id: ent.name, file: t, st }); } catch {}
            }
        } catch { return []; }
        items.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
        return items.slice(0, limit).map(({ id, file, st }) => {
            const cacheKey = `${id}:${st.size}:${st.mtimeMs}`;
            if (agTokenCache.has(cacheKey)) return agTokenCache.get(cacheKey);
            let peak = 0, output = 0, steps = 0, title = '';
            try {
                const size = Math.min(st.size, 512 * 1024);
                const fd = fsSync.openSync(file, 'r');
                const buf = Buffer.alloc(size);
                fsSync.readSync(fd, buf, 0, size, st.size - size);
                fsSync.closeSync(fd);
                for (const line of buf.toString('utf8').split('\n')) {
                    if (!line.includes('PLANNER_RESPONSE') && !line.includes('USER_INPUT')) continue;
                    try {
                        const o = JSON.parse(line);
                        if (o.type === 'PLANNER_RESPONSE') {
                            steps++;
                            peak = Math.max(peak, (o.input_tokens || 0) + (o.cache_read_tokens || 0));
                            output += o.output_tokens || 0;
                        } else if (!title && o.type === 'USER_INPUT' && typeof o.content === 'string') {
                            title = o.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
                        }
                    } catch {}
                }
            } catch {}
            const r = { id: id.slice(0, 8), title, peak, output, steps, updated: st.mtime.toISOString() };
            agTokenCache.set(cacheKey, r);
            return r;
        });
    }

    electron_1.ipcMain.handle('antigravity:hub-state', async () => agHubState());
    electron_1.ipcMain.handle('antigravity:toggle-mcp', async (_e, p) => {
        const { servers } = agDiscoverServers();
        const { toggles } = agReadToggles(servers.map(s => s.id));
        const id = p && p.mcpName;
        if (id && Object.prototype.hasOwnProperty.call(toggles, id)) {
            toggles[id] = Boolean(p.enabled);
            try { fsSync.mkdirSync(AG_CFG_DIR, { recursive: true }); fsSync.writeFileSync(AG_TOGGLES, JSON.stringify(toggles, null, 2), 'utf8'); } catch {}
            agWriteRuleFile(servers, toggles);
        }
        return agHubState();
    });
    electron_1.ipcMain.handle('antigravity:set-server-enabled', async (_e, p) => {
        try { agSetServerEnabled(p && p.id, Boolean(p && p.enabled)); } catch {}
        return agHubState();
    });
    electron_1.ipcMain.handle('antigravity:toggle-readonly', async (_e, p) => {
        try { agToggleServerReadonly(p && p.id); } catch {}
        return agHubState();
    });
    electron_1.ipcMain.handle('antigravity:pick-workspace', async () => {
        try {
            const res = await electron_1.dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select Workspace for Overview Hub', defaultPath: agWorkspaceRoot() });
            if (!res.canceled && res.filePaths && res.filePaths[0]) {
                fsSync.mkdirSync(AG_CFG_DIR, { recursive: true });
                fsSync.writeFileSync(AG_WS_PIN, JSON.stringify({ workspace: res.filePaths[0] }, null, 2), 'utf8');
                agMetaCache.ts = 0;
            }
        } catch {}
        return agHubState();
    });
    electron_1.ipcMain.handle('antigravity:rules', async () => agListRules());
    electron_1.ipcMain.handle('antigravity:toggle-rule', async (_e, p) => { try { agToggleRule(p && p.name, Boolean(p && p.enabled)); } catch {} return agListRules(); });
    electron_1.ipcMain.handle('antigravity:run-cli', async (_e, cmd) => { try { return agRunCommandInTerminal(cmd); } catch { return false; } });
    electron_1.ipcMain.handle('antigravity:token-history', async () => { try { return agTokenHistory(12); } catch { return []; } });
    electron_1.ipcMain.handle('antigravity:open-path', async (_e, target) => {
        const root = agWorkspaceRoot();
        const mapFile = ['AGENTS.md', 'GEMINI.md', 'CLAUDE.md'].find(f => fsSync.existsSync(path.join(root, f))) || 'AGENTS.md';
        const allowed = {
            mcpConfig: AG_MCP_CONFIGS.find(p => fsSync.existsSync(p)),
            skillsDir: path.join(root, '.agents', 'skills'),
            rulesDir: path.join(root, '.agents', 'rules'),
            hooksFile: path.join(root, '.agents', 'hooks.json'),
            agentsMd: path.join(root, mapFile),
        };
        const p = allowed[target];
        if (p) await electron_1.shell.openPath(p);
        return Boolean(p);
    });
    electron_1.ipcMain.handle('antigravity:get-context-usage', async () => {
        try {
            const brainDir = path.join(AG_HOME, '.gemini', 'antigravity', 'brain');
            let latest = null, latestTime = 0;
            for (const ent of fsSync.readdirSync(brainDir, { withFileTypes: true })) {
                if (!ent.isDirectory()) continue;
                const t = path.join(brainDir, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
                try { const st = fsSync.statSync(t); if (st.mtimeMs > latestTime) { latestTime = st.mtimeMs; latest = t; } } catch {}
            }
            if (!latest) return null;
            const st = fsSync.statSync(latest);
            const size = Math.min(st.size, 65536);
            const fd = fsSync.openSync(latest, 'r');
            const buf = Buffer.alloc(size);
            fsSync.readSync(fd, buf, 0, size, st.size - size);
            fsSync.closeSync(fd);
            const lines = buf.toString('utf8').split('\n').filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const o = JSON.parse(lines[i]);
                    if (o.type === 'PLANNER_RESPONSE' && (o.input_tokens || o.cache_read_tokens)) {
                        const used = (o.input_tokens || 0) + (o.cache_read_tokens || 0);
                        const limit = used > 200000 ? 1000000 : 200000;
                        return { used, limit, pct: Math.min(100, Math.round(used / limit * 100)) };
                    }
                } catch {}
            }
        } catch {}
        return null;
    });
    // ---- /AG_EXTENSION_HUB -----------------------------------------------------

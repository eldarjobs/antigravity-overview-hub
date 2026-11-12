    // ---- AG_EXTENSION_HUB (main process) --------------------------------------
    const agHubOs = require('os');
    const AG_HOME = agHubOs.homedir();
    const AG_CFG_DIR = path.join(AG_HOME, '.gemini', 'config');
    const AG_TOGGLES = path.join(AG_CFG_DIR, 'mcp_toggles.json');
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
        graphify: ['Code Knowledge Graph', 'Actively use the Graphify knowledge graph to locate god nodes, dependencies, communities and PR impact.'],
        mssql: ['SQL Server', 'Use the MSSQL tools to inspect schemas, profile tables and run read queries. Ask before any write or DDL operation.'],
        'microsoft-learn': ['Microsoft Docs', 'Query Microsoft Learn for .NET, ASP.NET Core, EF Core, Azure and SQL Server documentation.'],
        'sequential-thinking': ['Step Reasoning', 'Use sequential thinking for complex multi-step design or debugging problems.'],
        rea: ['Binary & Asar Analysis', 'Use REA tools for analysing binaries, DLLs and asar packages.'],
    };
    const agReadJson = (p) => { try { return JSON.parse(fsSync.readFileSync(p, 'utf8')); } catch { return null; } };

    function agWorkspaceRoot() {
        const candidates = [process.cwd(), path.join(AG_HOME, 'Desktop', 'SkyChefPlatform')];
        for (const c of candidates) {
            try { if (fsSync.existsSync(path.join(c, '.agents'))) return c; } catch {}
        }
        return path.join(AG_HOME, 'Desktop', 'SkyChefPlatform');
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
                const readonly = def.env && Object.prototype.hasOwnProperty.call(def.env, 'READONLY')
                    ? String(def.env.READONLY).toLowerCase() === 'true'
                    : null;
                servers.set(id, { id, transport, disabledInConfig: Boolean(def.disabled), source: cfgPath, tools: [], readonly });
            }
        }
        for (const dir of AG_MCP_TOOL_DIRS) {
            let entries = [];
            try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
            for (const ent of entries) {
                if (!ent.isDirectory()) continue;
                let tools = [];
                try { tools = fsSync.readdirSync(path.join(dir, ent.name)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)); } catch {}
                const s = servers.get(ent.name) || { id: ent.name, transport: 'plugin', disabledInConfig: false, source: dir, tools: [], readonly: null };
                if (tools.length > s.tools.length) s.tools = tools;
                servers.set(ent.name, s);
            }
        }
        const parked = agReadJson(path.join(AG_CFG_DIR, 'mcp_disabled.json')) || {};
        for (const [id, entry] of Object.entries(parked)) {
            const env = entry.def && entry.def.env;
            const readonly = env && Object.prototype.hasOwnProperty.call(env, 'READONLY')
                ? String(env.READONLY).toLowerCase() === 'true'
                : null;
            const s = servers.get(id) || { id, transport: entry.def && entry.def.command ? 'stdio' : 'http', source: entry.source, tools: [], readonly };
            s.parked = true;
            servers.set(id, s);
        }
        for (const s of servers.values()) s.configurable = Boolean(s.parked || AG_MCP_CONFIGS.includes(s.source));
        return { servers: [...servers.values()], configPath };
    }

    function agReadToggles(serverIds) {
        const stored = agReadJson(AG_TOGGLES) || {};
        const toggles = {};
        // New servers default to enabled; servers that disappeared are dropped.
        for (const id of serverIds) toggles[id] = Object.prototype.hasOwnProperty.call(stored, id) ? Boolean(stored[id]) : true;
        return { toggles, changed: JSON.stringify(stored) !== JSON.stringify(toggles) };
    }

    function agWriteRuleFile(servers, toggles) {
        try {
            const rulesDir = path.join(agWorkspaceRoot(), '.agents', 'rules');
            const file = path.join(rulesDir, '00-active-mcps.md');
            const active = servers.filter(s => toggles[s.id] && !s.disabledInConfig);
            if (active.length === 0) { try { fsSync.unlinkSync(file); } catch {} return; }
            let md = '---\nname: active-mcp-servers\ndescription: MCP servers enabled in the Overview hub and how to use them proactively.\ntrigger: always_on\n---\n\n# Proactive MCP Tool Usage Policy\n\n';
            md += 'Generated by the Antigravity Overview hub. The following MCP servers are ACTIVE; use their tools proactively for relevant tasks without waiting for an explicit request. Lazy-loaded tools are called through `call_mcp_tool` after reading their schema.\n\n';
            if (active.some(s => s.id === 'serena')) {
                md += '**Serena first for code navigation**: at the start of any code task, call serena `initial_instructions` once per session, then prefer Serena symbol tools over text search for finding definitions, references and call sites in C# and TypeScript/Vue code.\n\n';
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

    let agMetaCache = { ts: 0, val: { branch: '', dirtyCount: 0, graphAgeHours: null, hooksActive: false } };
    function agWorkspaceMeta() {
        if (Date.now() - agMetaCache.ts < 8000) return agMetaCache.val;
        const root = agWorkspaceRoot();
        let branch = '', dirtyCount = 0, graphAgeHours = null;
        const hooksActive = fsSync.existsSync(path.join(root, '.agents', 'hooks.json'));
        try {
            const { execFileSync } = require('child_process');
            branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 1500 }).trim();
            const st = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 1500 }).trim();
            dirtyCount = st ? st.split(/\r?\n/).length : 0;
        } catch {}
        try {
            const gf = path.join(root, 'graphify-out', 'graph.json');
            if (fsSync.existsSync(gf)) graphAgeHours = Math.round((Date.now() - fsSync.statSync(gf).mtimeMs) / 36e5);
        } catch {}
        agMetaCache = { ts: Date.now(), val: { branch, dirtyCount, graphAgeHours, hooksActive } };
        return agMetaCache.val;
    }

    function agHubState() {
        const { servers, configPath } = agDiscoverServers();
        const { toggles, changed: togglesChanged } = agReadToggles(servers.map(s => s.id));
        let changed = togglesChanged;
        for (const s of servers) if (s.parked && toggles[s.id]) { toggles[s.id] = false; changed = true; }
        if (changed) {
            try { fsSync.mkdirSync(AG_CFG_DIR, { recursive: true }); fsSync.writeFileSync(AG_TOGGLES, JSON.stringify(toggles, null, 2), 'utf8'); } catch {}
            agWriteRuleFile(servers, toggles);
        }
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
            meta: agWorkspaceMeta(),
            configPath,
            workspace: agWorkspaceRoot(),
        };
    }

    electron_1.ipcMain.handle('antigravity:hub-state', async () => agHubState());

    electron_1.ipcMain.handle('antigravity:toggle-mcp', async (_event, payload) => {
        const { servers } = agDiscoverServers();
        const { toggles } = agReadToggles(servers.map(s => s.id));
        const id = payload && payload.mcpName;
        if (id && Object.prototype.hasOwnProperty.call(toggles, id)) {
            toggles[id] = Boolean(payload.enabled);
            try { fsSync.mkdirSync(AG_CFG_DIR, { recursive: true }); fsSync.writeFileSync(AG_TOGGLES, JSON.stringify(toggles, null, 2), 'utf8'); } catch {}
            agWriteRuleFile(servers, toggles);
        }
        return agHubState();
    });

    electron_1.ipcMain.handle('antigravity:open-path', async (_event, target) => {
        const allowed = {
            mcpConfig: AG_MCP_CONFIGS.find(p => fsSync.existsSync(p)),
            skillsDir: path.join(agWorkspaceRoot(), '.agents', 'skills'),
            rulesDir: path.join(agWorkspaceRoot(), '.agents', 'rules'),
            hooksFile: path.join(agWorkspaceRoot(), '.agents', 'hooks.json'),
            agentsMd: path.join(agWorkspaceRoot(), 'AGENTS.md'),
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
    // ---- Real MCP disable: park server definitions outside mcp_config.json ------
    const AG_PARKED = path.join(AG_CFG_DIR, 'mcp_disabled.json');
    let agRestartPending = false;

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

    // ---- Rules panel ------------------------------------------------------------
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

    function agToggleServerReadonly(id) {
        const source = AG_MCP_CONFIGS.find(p => { const c = agReadJson(p); return c && c.mcpServers && c.mcpServers[id] && c.mcpServers[id].env && Object.prototype.hasOwnProperty.call(c.mcpServers[id].env, 'READONLY'); });
        if (source) {
            const cfg = agReadJson(source);
            const cur = String(cfg.mcpServers[id].env.READONLY).toLowerCase() === 'true';
            cfg.mcpServers[id].env.READONLY = cur ? 'false' : 'true';
            fsSync.writeFileSync(source, JSON.stringify(cfg, null, 2), 'utf8');
            agRestartPending = true;
        } else {
            const parked = agReadJson(AG_PARKED) || {};
            if (!parked[id]?.def?.env || !Object.prototype.hasOwnProperty.call(parked[id].def.env, 'READONLY')) return false;
            const cur = String(parked[id].def.env.READONLY).toLowerCase() === 'true';
            parked[id].def.env.READONLY = cur ? 'false' : 'true';
            fsSync.writeFileSync(AG_PARKED, JSON.stringify(parked, null, 2), 'utf8');
        }
        const { servers } = agDiscoverServers();
        const { toggles } = agReadToggles(servers.map(s => s.id));
        agWriteRuleFile(servers, toggles);
        return true;
    }

    // ---- SkyChef CLI quick commands (whitelisted, opened in a visible terminal) -
    const AG_CLI = {
        menu: [], sync: ['sync'], test: ['test'], logs: ['logs'], stats: ['stats'],
        ssh: ['ssh'], backup: ['backup', '-Target', 'Test'], maintenance: ['maintenance', 'status'],
    };
    const AG_TOOLS = {
        graphUpdate: ['graphify', 'update', '.'],
        archTests: ['dotnet', 'test', 'SkyChef/Tests/Application.Tests/Application.Tests.csproj', '--filter', 'Architecture'],
    };
    function agRunCli(key) {
        const root = agWorkspaceRoot();
        const { spawn } = require('child_process');
        if (AG_TOOLS[key]) {
            const [bin, ...toolArgs] = AG_TOOLS[key];
            spawn('cmd.exe', ['/c', 'start', '"SkyChef ' + key + '"', 'powershell.exe', '-NoExit', '-Command', `${bin} ${toolArgs.join(' ')}`], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref();
            agMetaCache.ts = 0;
            return true;
        }
        const args = AG_CLI[key];
        const script = path.join(root, 'skychef.ps1');
        if (!args || !fsSync.existsSync(script)) return false;
        const psArgs = ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', script, ...args];
        spawn('cmd.exe', ['/c', 'start', '"SkyChef ' + key + '"', 'powershell.exe', ...psArgs], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true }).unref();
        return true;
    }

    // ---- Token history ----------------------------------------------------------
    const agTokenCache = new Map();
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

    electron_1.ipcMain.handle('antigravity:set-server-enabled', async (_e, p) => {
        try { agSetServerEnabled(p && p.id, Boolean(p && p.enabled)); } catch {}
        return agHubState();
    });
    electron_1.ipcMain.handle('antigravity:toggle-readonly', async (_e, p) => {
        try { agToggleServerReadonly(p && p.id); } catch {}
        return agHubState();
    });
    electron_1.ipcMain.handle('antigravity:rules', async () => agListRules());
    electron_1.ipcMain.handle('antigravity:toggle-rule', async (_e, p) => { try { agToggleRule(p && p.name, Boolean(p && p.enabled)); } catch {} return agListRules(); });
    electron_1.ipcMain.handle('antigravity:run-cli', async (_e, key) => { try { return agRunCli(key); } catch { return false; } });
    electron_1.ipcMain.handle('antigravity:token-history', async () => { try { return agTokenHistory(12); } catch { return []; } });
    // ---- /AG_EXTENSION_HUB -----------------------------------------------------


// ---- AG_EXTENSION_HUB (renderer) --------------------------------------------
function installAntigravityExtensionHub() {
    let state = { servers: [], skills: [] };
    let usage = null;
    let rules = [];
    let history = [];
    let skillFilter = '';
    let expanded = null;
    let rendering = false;
    let open = { mcp: true, cli: true, prompts: false, rules: false, skills: false, tokens: false };
    try { Object.assign(open, JSON.parse(localStorage.getItem('agHubOpen') || '{}')); } catch {}

    const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const invoke = (ch, ...a) => electron_1.ipcRenderer.invoke(ch, ...a);
    const k = (n) => n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);

    function sendPrompt(text) {
        const input = document.querySelector('textarea, [contenteditable="true"]');
        if (!input) return;
        input.focus();
        if (input.tagName === 'TEXTAREA') {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            document.execCommand('selectAll', false);
            document.execCommand('insertText', false, text);
        }
        setTimeout(() => {
            const btn = document.querySelector('button[aria-label*="Send" i], button[title*="Send" i]');
            if (btn) btn.click();
            else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        }, 80);
    }

    function findOverviewMenu() {
        for (const c of document.querySelectorAll('div')) {
            if (c.id === 'antigravity-overview-hub') continue;
            const text = c.textContent || '';
            if (!text.includes('Extensions') || !(text.includes('Review') || text.includes('Terminal'))) continue;
            for (const child of c.children) {
                if (child.id !== 'antigravity-overview-hub' && (child.textContent || '').trim().startsWith('Extensions')) {
                    return { container: c, anchorRow: child };
                }
            }
        }
        return null;
    }

    const S = {
        label: 'font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:.5px;',
        btn: 'background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.4);color:#60a5fa;border-radius:4px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer;',
        ghost: 'background:transparent;border:1px solid rgba(255,255,255,.1);color:#a1a1aa;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer;',
        div: '<div style="height:1px;background:rgba(255,255,255,.06);"></div>',
        muted: 'font-size:10px;color:#71717a;',
    };

    const toggle = (cls, id, on) => `
        <div class="${cls}" data-id="${esc(id)}" style="flex:none;width:28px;height:16px;background:${on ? '#3b82f6' : '#27272a'};border-radius:9px;position:relative;cursor:pointer;">
            <div style="width:12px;height:12px;background:#fff;border-radius:50%;position:absolute;top:2px;left:${on ? '14px' : '2px'};transition:left .2s;"></div>
        </div>`;

    const section = (key, title, right, body) => `
        <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="ag-sec" data-sec="${key}" style="${S.label}cursor:pointer;user-select:none;">${open[key] ? 'v' : '>'} ${title}</span>
                <div style="display:flex;gap:6px;align-items:center;">${right}</div>
            </div>
            ${open[key] ? body : ''}
        </div>`;

    function renderKey() {
        return JSON.stringify([state.servers.map(s => [s.id, s.enabled, s.toolCount, s.parked, s.readonly]), state.restartPending, state.skills.length,
            state.meta, usage && usage.pct, expanded, open, rules.map(r => [r.name, r.enabled]), history.map(h => [h.id, h.peak])]);
    }

    function mcpBody() {
        const rows = state.servers.map(s => {
            const dot = !s.enabled ? '#52525b' : s.loaded ? '#10b981' : '#f59e0b';
            const tip = s.parked ? 'Disabled: definition parked in mcp_disabled.json' : s.loaded ? s.tools.join(', ') : 'No tool schemas found; server may not be loaded';
            const roBtn = s.readonly !== null && s.readonly !== undefined
                ? `<button class="ag-ro" data-id="${esc(s.id)}" title="Click to switch READONLY mode (requires restart)" style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;cursor:pointer;border:1px solid ${s.readonly ? 'rgba(16,185,129,.4)' : 'rgba(245,158,11,.4)'};background:${s.readonly ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.15)'};color:${s.readonly ? '#34d399' : '#fbbf24'};">${s.readonly ? 'RO' : 'RW'}</button>`
                : '';
            return `
            <div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0;gap:6px;">
                    <div class="ag-srv" data-id="${esc(s.id)}" style="display:flex;align-items:center;gap:6px;cursor:pointer;min-width:0;flex:1;" title="${esc(tip)}">
                        <span style="width:6px;height:6px;border-radius:50%;flex:none;background:${dot};"></span>
                        <span style="font-weight:600;font-size:11px;color:${s.enabled ? '#f4f4f5' : '#a1a1aa'};">${esc(s.id)}</span>
                        <span style="font-size:9px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.desc)}${s.toolCount ? ` - ${s.toolCount} tools` : ''}${s.configurable ? '' : ' - rule only'}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px;flex:none;">${roBtn}${toggle('ag-tgl', s.id, s.enabled)}</div>
                </div>
                ${expanded === s.id && s.tools.length ? `<div style="display:flex;flex-wrap:wrap;gap:3px;padding:2px 0 4px 12px;">${s.tools.map(t => `<span style="font-size:9px;font-family:monospace;color:#a1a1aa;background:rgba(255,255,255,.04);border-radius:3px;padding:1px 4px;">${esc(t)}</span>`).join('')}</div>` : ''}
            </div>`;
        }).join('');
        const banner = state.restartPending ? `<div style="font-size:10px;color:#f59e0b;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:4px;padding:4px 6px;">MCP configuration changed. Restart Antigravity to load or unload servers.</div>` : '';
        return `${banner}<div style="display:flex;flex-direction:column;gap:2px;max-height:180px;overflow-y:auto;">${rows || `<span style="${S.muted}">No MCP servers found in mcp_config.json.</span>`}</div>`;
    }

    function cliBody() {
        const cmds = [['menu', 'Menu'], ['sync', 'Sync'], ['test', 'Deploy Test'], ['logs', 'Logs'], ['stats', 'Stats'], ['backup', 'Backup Test DB'], ['ssh', 'SSH'], ['archTests', 'Arch Tests'], ['graphUpdate', 'Update Graph']];
        return `<div style="display:flex;flex-wrap:wrap;gap:4px;">${cmds.map(([key, label]) =>
            `<button class="ag-cli" data-cmd="${key}" style="${key === 'test' ? S.btn : S.ghost}" title="${key === 'archTests' ? 'Run SkyChef architecture ratchet tests' : key === 'graphUpdate' ? 'Rebuild graphify-out/graph.json' : 'skychef.ps1 ' + (key === 'menu' ? '' : key)}">${label}</button>`).join('')}</div>`;
    }

    function promptsBody() {
        const list = [
            ['CQRS Feature', 'Use the skychef-cqrs-feature skill and implement a new CQRS command/query in '],
            ['Master Page', 'Use the skychef-master-page skill to create/refactor the master page for '],
            ['Detail Page', 'Use the skychef-detail-page skill to create/refactor the detail page for '],
            ['EF Migration', 'Use the skychef-ef-migrations skill to add and verify an EF Core migration for '],
            ['Review Diff', 'Review the current uncommitted git diff for correctness, cross-module boundaries, time/date rules, and zero-emoji compliance.'],
            ['Commit Msg', 'Inspect git status and staged/unstaged diff, then write a concise Conventional Commit message.'],
        ];
        return `<div style="display:flex;flex-wrap:wrap;gap:4px;">${list.map(([label, text]) =>
            `<button class="ag-prompt" data-text="${esc(text)}" style="${S.ghost}" title="${esc(text)}">${label}</button>`).join('')}</div>`;
    }

    function rulesBody() {
        const color = (t) => t === 'always_on' ? '#10b981' : t === 'model_decision' ? '#60a5fa' : '#a1a1aa';
        return `<div style="display:flex;flex-direction:column;gap:2px;max-height:160px;overflow-y:auto;">${rules.map(r => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;padding:1px 0;" title="${esc(r.desc || r.name)}">
                <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                    <span style="font-size:9px;color:${color(r.trigger)};font-family:monospace;flex:none;">${r.trigger === 'always_on' ? 'ALWAYS' : r.trigger === 'model_decision' ? 'COND' : esc(r.trigger).toUpperCase()}</span>
                    <span style="font-size:11px;color:${r.enabled ? '#e4e4e7' : '#71717a'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${r.enabled ? '' : 'text-decoration:line-through;'}">${esc(r.name.replace(/\.md$/, ''))}</span>
                </div>
                ${toggle('ag-rule', r.name, r.enabled)}
            </div>`).join('') || `<span style="${S.muted}">No rules found in .agents/rules.</span>`}</div>`;
    }

    function skillsBody() {
        const scopeColor = (sc) => sc === 'project' ? '#60a5fa' : sc === 'global' ? '#a1a1aa' : '#c084fc';
        return `
            <input id="ag-skill-filter" placeholder="Filter skills" value="${esc(skillFilter)}" style="background:#0c0c0e;border:1px solid rgba(255,255,255,.08);border-radius:4px;color:#e4e4e7;font-size:11px;padding:3px 6px;outline:none;">
            <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:96px;overflow-y:auto;">${state.skills.map(s => `
                <span class="ag-skill" data-name="${esc(s.name.toLowerCase())}" title="${esc(s.scope)} - click to insert" style="cursor:pointer;padding:2px 6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:4px;font-size:10px;color:${scopeColor(s.scope)};font-family:monospace;white-space:nowrap;">${esc(s.name)}</span>`).join('')}</div>`;
    }

    function tokensBody() {
        if (!history.length) return `<span style="${S.muted}">No conversation transcripts found.</span>`;
        const max = Math.max(200000, ...history.map(h => h.peak));
        const bars = history.slice().reverse().map(h => {
            const pct = Math.max(3, Math.round(h.peak / max * 100));
            const c = h.peak >= 160000 ? '#ef4444' : h.peak >= 120000 ? '#f59e0b' : '#10b981';
            return `<div title="${esc(h.title || h.id)}&#10;Peak context: ${k(h.peak)} - Output: ${k(h.output)} - Steps: ${h.steps}&#10;${esc(new Date(h.updated).toLocaleString())}" style="flex:1;height:${pct}%;background:${c};border-radius:2px 2px 0 0;min-width:4px;"></div>`;
        }).join('');
        const totalOut = history.reduce((a, h) => a + h.output, 0);
        const avgPeak = Math.round(history.reduce((a, h) => a + h.peak, 0) / history.length);
        return `
            <div style="display:flex;align-items:flex-end;gap:2px;height:48px;border-bottom:1px solid rgba(255,255,255,.08);">${bars}</div>
            <div style="display:flex;justify-content:space-between;${S.muted}"><span>Last ${history.length} conversations</span><span>avg peak ${k(avgPeak)} - output ${k(totalOut)}</span></div>`;
    }

    function render(force) {
        if (rendering || !document.body) return;
        rendering = true;
        try {
            const target = findOverviewMenu();
            if (!target) return;
            const { container, anchorRow } = target;
            let hub = container.querySelector('#antigravity-overview-hub');
            const key = renderKey();
            if (hub && hub.dataset.key === key && !force) return;
            if (!hub) {
                hub = document.createElement('div');
                hub.id = 'antigravity-overview-hub';
                hub.style.cssText = 'margin:8px 6px 4px;background:#141416;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#e4e4e7;font-size:12px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 12px rgba(0,0,0,.3);max-height:70vh;overflow-y:auto;';
                hub.addEventListener('click', e => e.stopPropagation());
                hub.addEventListener('mousedown', e => e.stopPropagation());
                container.insertBefore(hub, anchorRow.nextSibling);
            }
            hub.dataset.key = key;

            const active = state.servers.filter(s => s.enabled).length;
            const uc = !usage ? '#52525b' : usage.pct >= 80 ? '#ef4444' : usage.pct >= 60 ? '#f59e0b' : '#10b981';
            const usageHtml = usage ? `
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <div style="display:flex;justify-content:space-between;"><span style="${S.label}">CONTEXT</span>
                    <span style="font-size:10px;color:${uc};font-weight:600;">${k(usage.used)} / ${k(usage.limit)} (${usage.pct}%)</span></div>
                    <div style="height:4px;background:#27272a;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${usage.pct}%;background:${uc};"></div></div>
                </div>${S.div}` : '';
            const rulesOn = rules.filter(r => r.enabled).length;
            const projectSkills = state.skills.filter(s => s.scope === 'project').length;
            const m = state.meta || {};
            const graphLabel = m.graphAgeHours == null ? 'no graph' : m.graphAgeHours >= 48 ? `graph ${Math.round(m.graphAgeHours / 24)}d` : `graph ${m.graphAgeHours}h`;
            const metaBar = m.branch ? `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;font-size:10px;color:#a1a1aa;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:5px;padding:3px 6px;">
                    <span style="font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(m.branch)}${m.dirtyCount ? ` (${m.dirtyCount} chg)` : ''}</span>
                    <div style="display:flex;gap:4px;align-items:center;flex:none;">
                        <span style="color:${m.graphAgeHours != null && m.graphAgeHours > 72 ? '#f59e0b' : '#71717a'};">${graphLabel}</span>
                        <button id="ag-open-hooks" style="${S.ghost};color:${m.hooksActive ? '#34d399' : '#71717a'};" title="Open .agents/hooks.json">${m.hooksActive ? 'Hooks ON' : 'No Hooks'}</button>
                        <button id="ag-open-agents" style="${S.ghost}" title="Open AGENTS.md">Map</button>
                    </div>
                </div>` : '';

            hub.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
                    <span style="${S.label}">ACTIONS</span>
                    <div style="display:flex;gap:4px;">
                        <button id="ag-compact" style="${S.btn}">Run /compact</button>
                        <button id="ag-refresh" style="${S.ghost}" title="Rescan servers, rules and skills">Refresh</button>
                    </div>
                </div>
                ${metaBar}
                ${S.div}${usageHtml}
                ${section('mcp', 'MCP SERVERS', `<span style="font-size:10px;color:${active ? '#10b981' : '#71717a'};font-weight:600;">${active}/${state.servers.length} active</span><button id="ag-open-mcp" style="${S.ghost}">Config</button>`, mcpBody())}
                ${S.div}
                ${section('cli', 'SKYCHEF CLI', '', cliBody())}
                ${S.div}
                ${section('prompts', 'QUICK PROMPTS', '', promptsBody())}
                ${S.div}
                ${section('rules', 'RULES', `<span style="${S.muted}">${rulesOn}/${rules.length} on</span><button id="ag-open-rules" style="${S.ghost}">Open</button>`, rulesBody())}
                ${S.div}
                ${section('skills', 'SKILLS', `<span style="${S.muted}">${projectSkills} project / ${state.skills.length} total</span>`, skillsBody())}
                ${S.div}
                ${section('tokens', 'TOKEN HISTORY', '', tokensBody())}`;

            const applyFilter = () => {
                const q = skillFilter.trim().toLowerCase();
                hub.querySelectorAll('.ag-skill').forEach(el => { el.style.display = !q || el.dataset.name.includes(q) ? 'inline-block' : 'none'; });
            };
            applyFilter();

            const on = (sel, fn) => hub.querySelectorAll(sel).forEach(el => { el.onclick = (e) => fn(el, e); });
            on('#ag-compact', (b) => { b.textContent = 'Sent'; sendPrompt('/compact'); setTimeout(() => { b.textContent = 'Run /compact'; }, 1200); });
            on('#ag-refresh', () => sync(true));
            on('#ag-open-mcp', () => invoke('antigravity:open-path', 'mcpConfig'));
            on('#ag-open-rules', () => invoke('antigravity:open-path', 'rulesDir'));
            on('#ag-open-hooks', () => invoke('antigravity:open-path', 'hooksFile'));
            on('#ag-open-agents', () => invoke('antigravity:open-path', 'agentsMd'));
            on('.ag-sec', (el) => { open[el.dataset.sec] = !open[el.dataset.sec]; try { localStorage.setItem('agHubOpen', JSON.stringify(open)); } catch {} render(true); });
            on('.ag-srv', (el) => { expanded = expanded === el.dataset.id ? null : el.dataset.id; render(true); });
            on('.ag-ro', async (el) => {
                try { state = await invoke('antigravity:toggle-readonly', { id: el.dataset.id }) || state; } catch {}
                render(true);
            });
            on('.ag-prompt', (el) => {
                const input = document.querySelector('textarea, [contenteditable="true"]');
                if (!input) return;
                input.focus();
                document.execCommand('insertText', false, el.dataset.text || '');
            });
            on('.ag-tgl', async (el) => {
                const srv = state.servers.find(s => s.id === el.dataset.id);
                if (!srv) return;
                const next = !srv.enabled;
                srv.enabled = next;
                render(true);
                try {
                    if (srv.configurable) await invoke('antigravity:set-server-enabled', { id: srv.id, enabled: next });
                    state = await invoke('antigravity:toggle-mcp', { mcpName: srv.id, enabled: next }) || state;
                } catch {}
                render(true);
            });
            on('.ag-rule', async (el) => {
                const r = rules.find(x => x.name === el.dataset.id);
                if (!r) return;
                try { rules = await invoke('antigravity:toggle-rule', { name: r.name, enabled: !r.enabled }) || rules; } catch {}
                render(true);
            });
            on('.ag-cli', async (el) => {
                const cmd = el.dataset.cmd;
                if (cmd === 'test' && !window.confirm('Deploy the current branch to the TEST environment?')) return;
                const label = el.textContent;
                el.textContent = 'Opening';
                await invoke('antigravity:run-cli', cmd);
                setTimeout(() => { el.textContent = label; }, 1200);
            });
            on('.ag-skill', (el) => {
                const input = document.querySelector('textarea, [contenteditable="true"]');
                if (!input) return;
                input.focus();
                document.execCommand('insertText', false, `Use the ${el.textContent.trim()} skill. `);
            });
            const filter = hub.querySelector('#ag-skill-filter');
            if (filter) {
                filter.oninput = () => { skillFilter = filter.value; applyFilter(); };
                filter.onkeydown = (e) => e.stopPropagation();
            }
        } catch {} finally {
            rendering = false;
        }
    }

    let tick = 0;
    async function sync(force) {
        try {
            const heavy = force || tick % 6 === 0;
            const [s, u, r, h] = await Promise.all([
                invoke('antigravity:hub-state'),
                invoke('antigravity:get-context-usage'),
                invoke('antigravity:rules'),
                heavy ? invoke('antigravity:token-history') : Promise.resolve(null),
            ]);
            if (s) state = s;
            usage = u;
            if (r) rules = r;
            if (h) history = h;
            tick++;
        } catch {}
        render(force);
    }

    const start = () => {
        if (!document.body) { setTimeout(start, 200); return; }
        document.addEventListener('click', () => setTimeout(render, 120), { passive: true });
        setInterval(sync, 5000);
        setInterval(render, 1000);
        sync(true);
    };
    start();
}
try { installAntigravityExtensionHub(); } catch {}
// ---- /AG_EXTENSION_HUB ------------------------------------------------------

// Functional test of main-inject handlers against a temporary workspace and home directory.
const fs = require('fs'), path = require('path'), os = require('os');
const assert = require('assert');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aghub-'));
const ws = path.join(tmp, 'sample-project');
fs.mkdirSync(path.join(tmp, '.gemini', 'config'), { recursive: true });
fs.copyFileSync(path.join(os.homedir(), '.gemini/config/mcp_config.json'), path.join(tmp, '.gemini/config/mcp_config.json'));
fs.mkdirSync(path.join(ws, '.agents', 'rules'), { recursive: true });
fs.writeFileSync(path.join(ws, '.agents/rules/a.md'), '---\ntrigger: model_decision\ndescription: test\n---\n');
fs.writeFileSync(path.join(ws, 'package.json'), JSON.stringify({ name: 'demo', scripts: { dev: 'vite', test: 'vitest' } }));
fs.writeFileSync(path.join(ws, '.agents/hub.json'), JSON.stringify({
    actions: [{ label: 'Custom Check', command: 'echo ok', primary: true }],
    prompts: [{ label: 'Project Prompt', text: 'Inspect demo architecture.' }],
}));

const realHome = os.homedir();
os.homedir = () => tmp;
process.chdir(ws);
const fsSync = fs; const h = {};
const electron_1 = { ipcMain: { handle: (c, f) => { h[c] = f; } }, shell: { openPath: async () => '' }, dialog: { showOpenDialog: async () => ({ canceled: true }) } };
eval(fs.readFileSync(path.join(__dirname, 'main-inject.js'), 'utf8'));
const cfg = () => JSON.parse(fs.readFileSync(path.join(tmp, '.gemini/config/mcp_config.json'))).mcpServers;

(async () => {
    let s = await h['antigravity:hub-state']();
    assert.strictEqual(s.workspace, ws);
    assert(s.actions.some(a => a.label === 'npm dev'), 'package.json dev script detected');
    assert(s.actions.some(a => a.label === 'Custom Check'), '.agents/hub.json action detected');
    assert.strictEqual(s.customPrompts[0].label, 'Project Prompt');

    s = await h['antigravity:toggle-readonly'](null, { id: 'mssql' });
    const roAfter = s.servers.find(x => x.id === 'mssql').readonly;
    s = await h['antigravity:set-server-enabled'](null, { id: 'mssql', enabled: false });
    assert.strictEqual(s.servers.find(x => x.id === 'mssql').parked, true);
    assert.strictEqual(Boolean(cfg().mssql), false);
    assert(fs.readFileSync(path.join(ws, '.agents/rules/00-active-mcps.md'), 'utf8').includes('trigger: always_on'));

    s = await h['antigravity:set-server-enabled'](null, { id: 'mssql', enabled: true });
    s = await h['antigravity:toggle-mcp'](null, { mcpName: 'mssql', enabled: true });
    assert.strictEqual(Boolean(cfg().mssql), true);
    assert.strictEqual(s.servers.find(x => x.id === 'mssql').enabled, true);

    const rulesAfter = await h['antigravity:toggle-rule'](null, { name: 'a.md', enabled: false });
    assert.strictEqual(rulesAfter[0].enabled, false);
    await h['antigravity:toggle-rule'](null, { name: '../x.md', enabled: false });
    assert.strictEqual(fs.existsSync(path.join(ws, '.agents', 'x.md.disabled')), false);

    os.homedir = () => realHome;
    process.chdir(__dirname);
    const real = {};
    (function () {
        const electron_1 = { ipcMain: { handle: (c, f) => { real[c] = f; } }, shell: { openPath: async () => '' }, dialog: { showOpenDialog: async () => ({ canceled: true }) } };
        eval(fs.readFileSync(path.join(__dirname, 'main-inject.js'), 'utf8'));
    })();
    const hist = await real['antigravity:token-history']();
    console.log('all assertions passed; roToggled:', roAfter, 'actions:', s.actions.length, 'history:', hist.length);
    fs.rmSync(tmp, { recursive: true, force: true });
})();

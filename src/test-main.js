// Functional test of main-inject handlers against a temporary home directory.
const fs = require('fs'), path = require('path'), os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aghub-'));
fs.mkdirSync(path.join(tmp, '.gemini', 'config'), { recursive: true });
fs.copyFileSync(path.join(os.homedir(), '.gemini/config/mcp_config.json'), path.join(tmp, '.gemini/config/mcp_config.json'));
fs.mkdirSync(path.join(tmp, '.agents', 'rules'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.agents/rules/a.md'), '---\ntrigger: model_decision\ndescription: test\n---\n');
const realHome = os.homedir();
os.homedir = () => tmp;
process.chdir(tmp);
const fsSync = fs; const h = {};
const electron_1 = { ipcMain: { handle: (c, f) => { h[c] = f; } }, shell: { openPath: async () => '' } };
eval(fs.readFileSync(path.join(__dirname, 'main-inject.js'), 'utf8'));
const cfg = () => JSON.parse(fs.readFileSync(path.join(tmp, '.gemini/config/mcp_config.json'))).mcpServers;
(async () => {
    let s = await h['antigravity:hub-state']();
    console.log('servers:', s.servers.map(x => `${x.id}(${x.configurable ? 'cfg' : 'rule'})`).join(' '));
    s = await h['antigravity:toggle-readonly'](null, { id: 'mssql' });
    console.log('mssql readonly toggled ->', s.servers.find(x => x.id === 'mssql').readonly);
    s = await h['antigravity:set-server-enabled'](null, { id: 'mssql', enabled: false });
    console.log('disable mssql -> enabled:', s.servers.find(x => x.id === 'mssql').enabled, 'parked:', s.servers.find(x => x.id === 'mssql').parked, 'inConfig:', !!cfg().mssql, 'restartPending:', s.restartPending);
    console.log('rule file mentions mssql as off:', fs.readFileSync(path.join(tmp, '.agents/rules/00-active-mcps.md'), 'utf8').includes('explicitly: mssql'));
    s = await h['antigravity:set-server-enabled'](null, { id: 'mssql', enabled: true });
    s = await h['antigravity:toggle-mcp'](null, { mcpName: 'mssql', enabled: true });
    console.log('re-enable -> inConfig:', !!cfg().mssql, 'enabled:', s.servers.find(x => x.id === 'mssql').enabled);
    console.log('rules after disable:', JSON.stringify(await h['antigravity:toggle-rule'](null, { name: 'a.md', enabled: false })));
    await h['antigravity:toggle-rule'](null, { name: '../x.md', enabled: false });
    console.log('traversal rejected:', !fs.existsSync(path.join(tmp, '.agents', 'x.md.disabled')));
    os.homedir = () => realHome;
    process.chdir(__dirname);
    const real = {};
    (function () {
        const electron_1 = { ipcMain: { handle: (c, f) => { real[c] = f; } }, shell: { openPath: async () => '' } };
        eval(fs.readFileSync(path.join(__dirname, 'main-inject.js'), 'utf8'));
    })();
    const hist = await real['antigravity:token-history']();
    console.log('history:', hist.map(x => `${x.id}:${x.peak}:${x.steps}`).join(' '));
    fs.rmSync(tmp, { recursive: true, force: true });
})();

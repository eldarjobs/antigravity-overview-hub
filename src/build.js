'use strict';
// Builds the patched app.asar from the INSTALLED Antigravity version, so the
// patch survives app updates and never downgrades the application.
//   node build.js [--install] [--resources <dir>]
const fs = require('fs');
const path = require('path');
const { readArchive, readEntry, writeArchive } = require('./asar');

const MARKER = 'AG_EXTENSION_HUB';
const args = process.argv.slice(2);
const resIdx = args.indexOf('--resources');
const resDir = resIdx >= 0 ? args[resIdx + 1] : [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'resources'),
    path.join(process.env.ProgramFiles || '', 'Antigravity', 'resources'),
].find(d => fs.existsSync(path.join(d, 'app.asar')));
if (!resDir) { console.error('[ERROR] Antigravity resources directory not found.'); process.exit(1); }

const installed = path.join(resDir, 'app.asar');
const backup = path.join(resDir, 'app.asar.bak');
const mainInject = fs.readFileSync(path.join(__dirname, 'main-inject.js'), 'utf8');
const preloadInject = fs.readFileSync(path.join(__dirname, 'preload-inject.js'), 'utf8');
const buildHash = require('crypto').createHash('sha256').update(mainInject).update(preloadInject).digest('hex').slice(0, 12);
const buildTag = `// AG_EXTENSION_HUB_BUILD:${buildHash}`;
const preloadOf = (file) => readEntry(readArchive(file), 'dist/preload.js').toString('utf8');
const isPatched = (file) => { const p = preloadOf(file); return p.includes(MARKER) || p.includes('installAntigravityExtensionHub'); };

if (args.includes('--if-needed') && preloadOf(installed).includes(buildTag)) {
    console.log(`[SKIP] Installed archive already carries build ${buildHash}.`);
    process.exit(0);
}
if (args.includes('--skip-if-running')) {
    try {
        const out = require('child_process').execSync('tasklist /FI "IMAGENAME eq Antigravity.exe" /NH', { encoding: 'utf8' });
        if (/Antigravity\.exe/i.test(out)) { console.log('[SKIP] Antigravity is running; patch will be applied after it closes.'); process.exit(0); }
    } catch {}
}

// Pick a clean source: the installed archive if unpatched (refresh backup), else the backup.
let source;
if (!isPatched(installed)) {
    fs.copyFileSync(installed, backup);
    source = backup;
    console.log('[BACKUP] Installed archive is original; backup refreshed.');
} else if (fs.existsSync(backup) && !isPatched(backup)) {
    source = backup;
    console.log('[SOURCE] Installed archive already patched; rebuilding from backup.');
} else {
    console.error('[ERROR] No clean original archive available. Reinstall Antigravity and retry.');
    process.exit(1);
}

const archive = readArchive(source);
const pkg = JSON.parse(readEntry(archive, 'package.json').toString('utf8'));
let ipc = readEntry(archive, 'dist/ipcHandlers.js').toString('utf8');
let preload = readEntry(archive, 'dist/preload.js').toString('utf8');

const anchor = /function registerIpcHandlers\(storageManager\) \{\r?\n/;
if (!anchor.test(ipc)) { console.error('[ERROR] Injection anchor not found in dist/ipcHandlers.js (app version ' + pkg.version + ').'); process.exit(1); }
for (const sym of ['electron_1', 'fsSync', 'path']) {
    if (!new RegExp(`const ${sym} = `).test(ipc)) { console.error(`[ERROR] Expected symbol "${sym}" missing in ipcHandlers.js.`); process.exit(1); }
}
if (!preload.includes('electron_1')) { console.error('[ERROR] electron_1 missing in preload.js.'); process.exit(1); }

ipc = ipc.replace(anchor, (m) => m + mainInject + '\n');
preload = preload + '\n' + buildTag + '\n' + preloadInject;

const out = path.join(__dirname, '..', 'app.asar');
writeArchive(archive, {
    'dist/ipcHandlers.js': Buffer.from(ipc, 'utf8'),
    'dist/preload.js': Buffer.from(preload, 'utf8'),
}, out);
console.log(`[BUILD] Patched archive for Antigravity ${pkg.version} (build ${buildHash}) written to ${out}`);

if (args.includes('--install')) {
    try {
        fs.copyFileSync(out, installed);
    } catch (e) {
        console.error(`[ERROR] Could not replace ${installed} (${e.code}). Close Antigravity and retry.`);
        process.exit(2);
    }
    console.log('[INSTALL] Patched archive installed to ' + installed);
}

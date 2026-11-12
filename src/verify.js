'use strict';
// Verifies the built archive: syntax of patched files, and byte equality of all untouched entries.
const path = require('path');
const { readArchive, readEntry } = require('./asar');
const a = readArchive(path.join(__dirname, '..', 'app.asar'));
const o = readArchive(path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'app.asar.bak'));
new Function('require', 'exports', 'module', '__dirname', '__filename', readEntry(a, 'dist/ipcHandlers.js').toString());
new Function('require', 'exports', 'module', readEntry(a, 'dist/preload.js').toString());
let bad = 0, checked = 0;
(function walk(n, p) {
    for (const [k, v] of Object.entries(n.files)) {
        const q = p ? `${p}/${k}` : k;
        if (v.files) { walk(v, q); continue; }
        if (v.unpacked || v.link || q === 'dist/ipcHandlers.js' || q === 'dist/preload.js') continue;
        checked++;
        if (!readEntry(a, q).equals(readEntry(o, q))) bad++;
    }
})(o.header, '');
console.log(`syntax ok; version ${JSON.parse(readEntry(a, 'package.json')).version}; untouched files checked ${checked}, mismatched ${bad}`);
process.exit(bad ? 1 : 0);

#!/usr/bin/env node
'use strict';

// Packages agent.js and the Node runtime into one program (dist/TarionePrintAgent.exe on
// Windows) using Node's single-executable support, so the PC it runs on doesn't need Node
// installed. Run with the Node version you want bundled: `node build/build.js`.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const exe = path.join(dist, isWindows ? 'TarionePrintAgent.exe' : 'TarionePrintAgent');
const blob = path.join(dist, 'sea-prep.blob');
const seaConfig = path.join(dist, 'sea-config.json');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: path.join(root, 'agent.js'), output: blob, disableExperimentalSEAWarning: true }),
);
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

fs.copyFileSync(process.execPath, exe);
fs.chmodSync(exe, 0o755);

if (isWindows) {
  // Mark it a windowed program so Windows never opens a console window for it — staff closing
  // that window is what used to kill the agent.
  require('./set-gui-subsystem').setGuiSubsystem(exe);
}
if (isMac) execFileSync('codesign', ['--remove-signature', exe], { stdio: 'inherit' });

const postjectArgs = [
  '--yes',
  'postject@1.0.0-alpha.6',
  exe,
  'NODE_SEA_BLOB',
  blob,
  '--sentinel-fuse',
  'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
];
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
execFileSync(isWindows ? 'npx.cmd' : 'npx', postjectArgs, { stdio: 'inherit', shell: isWindows });

if (isMac) execFileSync('codesign', ['--sign', '-', exe], { stdio: 'inherit' });

fs.rmSync(blob);
fs.rmSync(seaConfig);
console.log(`Built ${exe}`);

#!/usr/bin/env node
'use strict';

// End-to-end check of the packaged agent against a stand-in Tarione API and a stand-in
// printer, both on localhost. Proves: a bad pairing code is refused, a good one connects,
// the agent polls, sends the docket bytes to the "printer" and reports the job as printed.
//
//   node build/smoke-test.js --exe dist/TarionePrintAgent        (packaged program)
//   node build/smoke-test.js --installer dist/TarionePrintAgentSetup.exe   (Windows: full
//       unattended install, checks auto-start is registered, then uninstalls)
//   node build/smoke-test.js --script agent.js                   (plain `node agent.js`)

const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const { spawn, spawnSync, execFileSync } = require('child_process');

const API_PORT = 4599;
const PRINTER_PORT = 9199;
const API_URL = `http://127.0.0.1:${API_PORT}/api/v1`;
const GOOD_CODE = 'ABCD-2345';
const TOKEN = 'smoke-test-token';
const DOCKET = Buffer.from('\x1b@SMOKE TEST DOCKET\n\x1dV\x00', 'binary');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const state = { polls: 0, jobHandedOut: false, reported: null, printed: Buffer.alloc(0), scanAsked: false, startupScan: null, discovered: null };

// The agent is pointed at the stand-in printer only, so the test never probes the network
// it happens to run on. (Working out which addresses to try is covered by discovery.test.js.)
process.env.KULODE_DISCOVERY_HOSTS = '127.0.0.1';
process.env.KULODE_DISCOVERY_PORT = String(PRINTER_PORT);

const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const send = (status, json) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    };
    const authed = req.headers.authorization === `Bearer ${TOKEN}`;

    if (req.method === 'POST' && req.url === '/api/v1/print-agent/pair') {
      const code = String(JSON.parse(body || '{}').code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code !== GOOD_CODE.replace('-', '')) return send(404, { message: 'That pairing code is not valid or has expired.' });
      return send(200, { data: { token: TOKEN, organizationName: 'Smoke Test Org' } });
    }
    if (!authed) return send(401, { message: 'Invalid print agent token' });
    if (req.method === 'POST' && req.url === '/api/v1/print-agent/discovered') {
      // The agent scans once by itself on start-up, then again when asked.
      const devices = JSON.parse(body).devices;
      if (state.scanAsked) state.discovered = devices;
      else state.startupScan = devices;
      return send(200, { data: { received: devices.length, corrected: 0 } });
    }
    if (req.method === 'GET' && req.url === '/api/v1/print-agent/jobs?v=2') {
      state.polls++;
      if (state.jobHandedOut) {
        // Once the docket is done, ask for a network scan exactly once.
        const scanRequested = state.reported !== null && !state.scanAsked;
        if (scanRequested) state.scanAsked = true;
        return send(200, { data: { jobs: [], scanRequested } });
      }
      state.jobHandedOut = true;
      return send(200, {
        data: { scanRequested: false, jobs: [
          {
            id: 'job-1',
            printer: { id: 'p1', name: 'Smoke Printer', station: 'Kitchen', connectionType: 'NETWORK', ipAddress: '127.0.0.1', port: PRINTER_PORT, devicePath: null },
            escposText: DOCKET.toString('base64'),
          },
        ] },
      });
    }
    if (req.method === 'PATCH' && req.url === '/api/v1/print-agent/jobs/job-1') {
      state.reported = JSON.parse(body);
      return send(200, { data: {} });
    }
    send(404, { message: 'Not found' });
  });
});

const printer = net.createServer((socket) => {
  socket.on('data', (chunk) => (state.printed = Buffer.concat([state.printed, chunk])));
});

function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  console.log(`ok - ${message}`);
}

// The stand-in API lives in this process, so anything that talks to it must not block the
// event loop — no spawnSync for those.
function runToExit(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (status) => resolve({ status }));
  });
}

async function waitFor(predicate, seconds, message) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (predicate()) return check(true, message);
    await new Promise((r) => setTimeout(r, 250));
  }
  check(false, `${message} (timed out after ${seconds}s)`);
}

async function checkPrinted() {
  await waitFor(() => state.polls > 0, 30, 'agent polls for jobs with the paired token');
  await waitFor(() => state.reported !== null, 30, 'agent reports the job result');
  check(state.reported.status === 'SENT', `job reported as SENT (got ${JSON.stringify(state.reported)})`);
  check(state.printed.equals(DOCKET), 'printer received the exact docket bytes');

  const printedBeforeScan = state.printed.length;
  await waitFor(() => state.startupScan !== null, 30, 'agent scanned by itself on start-up');
  await waitFor(() => state.discovered !== null, 30, 'agent scans again when asked from Settings');
  check(
    state.discovered.length === 1 && state.discovered[0].ipAddress === '127.0.0.1' && state.discovered[0].port === PRINTER_PORT,
    `the scan found the printer (got ${JSON.stringify(state.discovered)})`,
  );
  check(state.printed.length === printedBeforeScan, 'scanning sent nothing to the printer');
}

async function testProgram(command, baseArgs, installDir) {
  const run = (extra) => runToExit(command, [...baseArgs, ...extra]);

  const bad = await run(['--pair', 'WRONG-CODE', '--api', API_URL]);
  check(bad.status === 2, `a wrong pairing code is refused (exit ${bad.status})`);
  check(fs.readFileSync(path.join(installDir, 'pair-error.txt'), 'utf8').includes('not valid'), 'the refusal reason is saved for the installer to show');
  check(!fs.existsSync(path.join(installDir, '.env')), 'nothing is saved after a refused code');

  const good = await run(['--pair', GOOD_CODE, '--api', API_URL]);
  check(good.status === 0, `the right pairing code is accepted (exit ${good.status})`);
  const env = fs.readFileSync(path.join(installDir, '.env'), 'utf8');
  check(env.includes(`KULODE_PRINT_AGENT_TOKEN=${TOKEN}`) && env.includes(`KULODE_API_URL=${API_URL}`), 'token and API address are saved to .env');

  const child = spawn(command, baseArgs, { stdio: 'ignore' });
  try {
    await checkPrinted();
  } finally {
    child.kill();
  }
}

async function testInstaller(installer) {
  const installDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'Tarione Print Agent');
  const exe = path.join(installDir, 'TarionePrintAgent.exe');
  const isRunning = () => execFileSync('tasklist', ['/FI', 'IMAGENAME eq TarionePrintAgent.exe'], { encoding: 'utf8' }).includes('TarionePrintAgent.exe');

  const refused = await runToExit(installer, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/PAIR=WRONG-CODE', `/API=${API_URL}`]);
  check(refused.status !== 0, `installer stops when the pairing code is wrong (exit ${refused.status})`);
  check(!fs.existsSync(exe) && !isRunning(), 'nothing is installed or left running after a wrong code');

  const install = await runToExit(installer, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', `/PAIR=${GOOD_CODE}`, `/API=${API_URL}`, `/LOG=${path.join(os.tmpdir(), 'tarione-agent-install.log')}`]);
  check(install.status === 0, `installer runs unattended (exit ${install.status})`);
  check(fs.existsSync(exe), 'program is installed for the current user');
  check(fs.existsSync(path.join(installDir, '.env')), 'installer paired the agent');

  const runKey = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'TarionePrintAgent'], { encoding: 'utf8' });
  check(runKey.status === 0 && runKey.stdout.includes('TarionePrintAgent.exe'), 'agent is registered to start when the user signs in');

  check(isRunning(), 'installer started the agent');
  await checkPrinted();
  check(fs.readFileSync(path.join(installDir, 'agent.log'), 'utf8').includes('Printed job job-1'), 'agent writes its log file');

  const uninstall = await runToExit(path.join(installDir, 'unins000.exe'), ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART']);
  check(uninstall.status === 0, 'uninstaller runs');
  await waitFor(() => !isRunning() && !fs.existsSync(exe), 30, 'uninstall stops and removes the agent');
}

async function main() {
  await new Promise((r) => api.listen(API_PORT, '127.0.0.1', r));
  await new Promise((r) => printer.listen(PRINTER_PORT, '127.0.0.1', r));

  if (arg('--installer')) {
    await testInstaller(path.resolve(arg('--installer')));
  } else if (arg('--exe')) {
    const exe = path.resolve(arg('--exe'));
    await testProgram(exe, [], path.dirname(exe));
  } else {
    // Run a copy so the test never touches a real .env sitting next to agent.js.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarione-agent-'));
    fs.copyFileSync(path.resolve(arg('--script') || 'agent.js'), path.join(dir, 'agent.js'));
    await testProgram(process.execPath, [path.join(dir, 'agent.js')], dir);
  }
  console.log('\nAll checks passed.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });

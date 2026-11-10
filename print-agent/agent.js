#!/usr/bin/env node
'use strict';

/**
 * Kulode print agent.
 *
 * Runs on a machine physically connected to your kitchen/bar printers — either on the same
 * local network (NETWORK printers) or directly cabled to it (USB/BLUETOOTH printers). Kulode's
 * backend lives in the cloud and has no route to either — this agent bridges that gap: it polls
 * the backend for pending print jobs, sends each one straight to its printer, and reports the
 * result back.
 *
 * - NETWORK printers: opens a raw TCP socket straight to the printer's local IP.
 * - USB/BLUETOOTH printers (Windows only): the printer must already be installed and *shared*
 *   in Windows (Printer Properties > Sharing > Share this printer). The agent then copies the
 *   raw docket bytes to that share (\\localhost\<ShareName>) — Windows' print spooler forwards
 *   them to the printer untouched, regardless of whether it's plugged in via USB or Bluetooth.
 *   This only works when the agent runs on the same Windows machine the printer is attached to.
 *
 * Setup, the easy way (Windows): run TarionePrintAgentSetup.exe and type in the pairing code
 * from Settings > Printers. See README.md.
 *
 * Setup by hand (any OS):
 *   1. In Settings > Printers, get a pairing code and run `node agent.js --pair CODE`
 *      — or generate a token there and put it in .env as KULODE_PRINT_AGENT_TOKEN.
 *   2. Run: node agent.js   (or `npm start`)
 *
 * Requires Node.js 18+ (uses the built-in fetch API). No dependencies.
 */

const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const VERSION = '1.1.0';
const DEFAULT_API_URL = 'https://api.tarione.com/api/v1';

// True when running as the packaged Windows program (TarionePrintAgent.exe) rather than
// `node agent.js`. The packaged program has no console window, so it logs to a file instead.
let PACKAGED = false;
try {
  PACKAGED = require('node:sea').isSea();
} catch {
  PACKAGED = false;
}

// Config and logs live next to the program: the folder holding agent.js, or the install folder.
const BASE_DIR = PACKAGED ? path.dirname(process.execPath) : __dirname;
const ENV_PATH = path.join(BASE_DIR, '.env');
const LOG_PATH = path.join(BASE_DIR, 'agent.log');
const PAIR_ERROR_PATH = path.join(BASE_DIR, 'pair-error.txt');
const MAX_LOG_BYTES = 1024 * 1024;

function loadEnvFile() {
  if (!fs.existsSync(ENV_PATH)) return;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
}
loadEnvFile();

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const API_URL = (argValue('--api') || process.env.KULODE_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
const TOKEN = process.env.KULODE_PRINT_AGENT_TOKEN || '';
const POLL_INTERVAL_MS = Number(process.env.KULODE_POLL_INTERVAL_MS || 2000);
const SOCKET_TIMEOUT_MS = Number(process.env.KULODE_PRINT_TIMEOUT_MS || 5000);

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  try {
    console.log(line);
  } catch {
    // No console attached (packaged program) — the log file below is the record.
  }
  if (!PACKAGED) return;
  try {
    // One generation of history is plenty for "what happened this week".
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_PATH, `${LOG_PATH}.1`);
    }
    fs.appendFileSync(LOG_PATH, `${line}${os.EOL}`);
  } catch {
    // Logging must never take the agent down.
  }
}

// ─── Pairing ────────────────────────────────────────────────────────────────
// `--pair CODE` swaps the short code shown in Settings > Printers for this organization's
// agent token and saves it to .env, so nobody has to copy a token into a file by hand. The
// Windows installer runs this for you; it also works with plain `node agent.js --pair CODE`.

function saveEnv(values) {
  const lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(values)) {
    const index = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (index === -1) lines.push(`${key}=${value}`);
    else lines[index] = `${key}=${value}`;
  }
  fs.writeFileSync(ENV_PATH, `${lines.filter((l, i) => l !== '' || i < lines.length - 1).join(os.EOL)}${os.EOL}`);
}

async function pair(code) {
  const fail = (exitCode, message) => {
    log(`Pairing failed: ${message}`);
    // The installer has no console to read — it shows this file's contents to the user.
    try {
      fs.writeFileSync(PAIR_ERROR_PATH, message);
    } catch {
      // Nothing more we can do; the exit code still tells the installer it failed.
    }
    process.exit(exitCode);
  };

  if (!code) fail(2, 'No pairing code given.');

  let response;
  try {
    response = await fetch(`${API_URL}/print-agent/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    fail(3, `Could not reach Tarione (${(err.cause && err.cause.code) || err.message}). Check this computer's internet connection and try again.`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    fail(response.status === 429 ? 4 : 2, response.status === 429
      ? 'Too many attempts. Wait a minute, then try again.'
      : message || `Tarione rejected the code (${response.status}).`);
  }

  const token = (body.data || body).token;
  if (!token) fail(2, 'Tarione did not return a token.');

  saveEnv({ KULODE_API_URL: API_URL, KULODE_PRINT_AGENT_TOKEN: token });
  try {
    fs.unlinkSync(PAIR_ERROR_PATH);
  } catch {
    // No earlier failure to clear.
  }
  log(`Paired with ${(body.data || body).organizationName || 'Tarione'}.`);
  process.exit(0);
}

function writeToPrinter(ipAddress, port, buffer) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const timer = setTimeout(() => finish(new Error('Printer connection timed out')), SOCKET_TIMEOUT_MS);

    socket.once('error', (err) => finish(err));
    socket.connect(port, ipAddress, () => {
      socket.write(buffer, (err) => {
        if (err) return finish(err);
        finish();
      });
    });
  });
}

// Windows share names are chosen by whoever set up the printer share — keep this narrow since
// it's interpolated into a shell command below.
function assertSafeShareName(name) {
  if (!/^[A-Za-z0-9_\-. ]+$/.test(name)) {
    throw new Error(`Printer share name contains unsupported characters: "${name}"`);
  }
  return name;
}

function writeToUsbPrinter(devicePath, buffer) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('USB/Bluetooth printing is only supported when the agent runs on Windows'));
    }

    let shareName;
    try {
      shareName = assertSafeShareName(devicePath);
    } catch (err) {
      return reject(err);
    }

    const tempFile = path.join(os.tmpdir(), `kulode-print-${Date.now()}-${Math.round(Math.random() * 1e9)}.bin`);
    fs.writeFile(tempFile, buffer, (writeErr) => {
      if (writeErr) return reject(writeErr);

      // windowsHide: the packaged agent has no console, and without this every USB print
      // would flash a command window on screen.
      execFile('cmd.exe', ['/c', 'copy', '/b', tempFile, `\\\\localhost\\${shareName}`], { windowsHide: true }, (execErr, _stdout, stderr) => {
        fs.unlink(tempFile, () => {});
        if (execErr) {
          return reject(
            new Error(
              `${stderr || execErr.message} (is "${shareName}" shared in Windows? Printer Properties > Sharing)`,
            ),
          );
        }
        resolve();
      });
    });
  });
}

async function reportResult(jobId, status, error) {
  try {
    const response = await fetch(`${API_URL}/print-agent/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ status, error }),
      signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log(`Failed to report job ${jobId} result: ${response.status} ${response.statusText} ${body}`);
    }
  } catch (err) {
    log('Failed to report job result back to Kulode:', err.message);
  }
}

async function pollOnce() {
  const response = await fetch(`${API_URL}/print-agent/jobs`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    signal: AbortSignal.timeout(SOCKET_TIMEOUT_MS),
  });

  if (response.status === 401) {
    throw new Error(
      'Tarione rejected this agent\'s token. It was probably regenerated — connect this computer again from Settings > Printers.',
    );
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  const jobs = Array.isArray(body) ? body : body.data || [];

  for (const job of jobs) {
    const { printer } = job;
    const isUsbLike = printer.connectionType === 'USB' || printer.connectionType === 'BLUETOOTH';
    // The backend base64-encodes the docket bytes before storing/transmitting them (raw ESC/POS
    // control codes include a literal null byte, which breaks JSON/Postgres text storage) —
    // decode back to the real bytes here, right before writing to the printer.
    const buffer = Buffer.from(job.escposText, 'base64');

    try {
      if (isUsbLike) {
        if (!printer.devicePath) {
          throw new Error('Printer has no Windows share name configured');
        }
        await writeToUsbPrinter(printer.devicePath, buffer);
        log(`Printed job ${job.id} on "${printer.name}" via \\\\localhost\\${printer.devicePath}`);
      } else {
        if (!printer.ipAddress) {
          throw new Error('Printer has no IP address configured');
        }
        await writeToPrinter(printer.ipAddress, printer.port || 9100, buffer);
        log(`Printed job ${job.id} on "${printer.name}" (${printer.ipAddress}:${printer.port || 9100})`);
      }
      await reportResult(job.id, 'SENT');
    } catch (err) {
      log(`Failed to print job ${job.id} on "${printer.name}":`, err.message);
      await reportResult(job.id, 'FAILED', err.message);
    }
  }
}

async function main() {
  if (process.argv.includes('--version')) {
    console.log(VERSION);
    return;
  }
  if (process.argv.includes('--pair')) {
    await pair(argValue('--pair'));
    return;
  }

  if (!TOKEN) {
    log(
      `Not connected to Tarione yet. Get a pairing code from Settings > Printers and run this with --pair CODE (or set KULODE_PRINT_AGENT_TOKEN in ${ENV_PATH}).`,
    );
    process.exit(1);
  }

  log(`Tarione print agent ${VERSION} starting. Polling ${API_URL} every ${POLL_INTERVAL_MS}ms.`);
  let lastError = '';
  for (;;) {
    try {
      await pollOnce();
      if (lastError) log('Connection to Tarione restored.');
      lastError = '';
    } catch (err) {
      // An outage would otherwise write the same line every two seconds and bury everything
      // else in the log — say it once, then again only if the reason changes.
      if (err.message !== lastError) log('Poll failed:', err.message);
      lastError = err.message;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// This runs unattended for months; one unexpected error must not end it.
process.on('uncaughtException', (err) => log('Unexpected error:', (err && err.stack) || err));
process.on('unhandledRejection', (err) => log('Unexpected error:', (err && err.stack) || err));

main();

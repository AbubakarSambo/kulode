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
 * Setup:
 *   1. In Kulode, go to Settings > Printers > Print Agent and generate a token.
 *   2. Copy .env.example to .env and fill in KULODE_API_URL and KULODE_PRINT_AGENT_TOKEN.
 *   3. Run: node agent.js   (or `npm start`)
 *
 * Requires Node.js 18+ (uses the built-in fetch API). No dependencies.
 */

const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const API_URL = (process.env.KULODE_API_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.KULODE_PRINT_AGENT_TOKEN || '';
const POLL_INTERVAL_MS = Number(process.env.KULODE_POLL_INTERVAL_MS || 2000);
const SOCKET_TIMEOUT_MS = Number(process.env.KULODE_PRINT_TIMEOUT_MS || 5000);

if (!API_URL || !TOKEN) {
  console.error(
    'Missing config. Set KULODE_API_URL and KULODE_PRINT_AGENT_TOKEN in print-agent/.env (see .env.example).',
  );
  process.exit(1);
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function writeToPrinter(ipAddress, port, text) {
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
      socket.write(Buffer.from(text, 'binary'), (err) => {
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

function writeToUsbPrinter(devicePath, text) {
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
    fs.writeFile(tempFile, Buffer.from(text, 'binary'), (writeErr) => {
      if (writeErr) return reject(writeErr);

      execFile('cmd.exe', ['/c', 'copy', '/b', tempFile, `\\\\localhost\\${shareName}`], (execErr, _stdout, stderr) => {
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
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch jobs: ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  const jobs = Array.isArray(body) ? body : body.data || [];

  for (const job of jobs) {
    const { printer } = job;
    const isUsbLike = printer.connectionType === 'USB' || printer.connectionType === 'BLUETOOTH';

    try {
      if (isUsbLike) {
        if (!printer.devicePath) {
          throw new Error('Printer has no Windows share name configured');
        }
        await writeToUsbPrinter(printer.devicePath, job.escposText);
        log(`Printed job ${job.id} on "${printer.name}" via \\\\localhost\\${printer.devicePath}`);
      } else {
        if (!printer.ipAddress) {
          throw new Error('Printer has no IP address configured');
        }
        await writeToPrinter(printer.ipAddress, printer.port || 9100, job.escposText);
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
  log(`Kulode print agent starting. Polling ${API_URL} every ${POLL_INTERVAL_MS}ms.`);
  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      log('Poll failed:', err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main();

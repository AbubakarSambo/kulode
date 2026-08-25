# Kulode Print Agent

Kulode's backend is cloud-hosted and can't reach a printer directly — not a network printer's
private local address (e.g. `192.168.1.50`), and not a USB/Bluetooth printer cabled into a
specific PC. This agent runs on a machine physically connected to your kitchen/bar printers and
bridges the gap: it polls Kulode for pending print jobs, sends each one straight to its printer,
and reports back whether it printed.

It's a single dependency-free Node.js script — nothing to install beyond Node itself.

Two ways it reaches a printer, depending on how that printer is connected:

- **Network printers** — opens a raw TCP connection straight to the printer's local IP.
- **USB/Bluetooth printers (Windows only)** — the printer must already be installed and
  **shared** in Windows (right-click the printer > Printer Properties > Sharing tab > Share
  this printer). The agent then copies the raw docket bytes to that share
  (`\\localhost\<ShareName>`); Windows' print spooler forwards them to the printer untouched.
  This only works if the agent runs on the **same Windows machine** the printer is plugged into
  — it can't reach a USB printer attached to a different computer.

## Requirements

- Node.js 18 or later
- Network printers: run the agent on any always-on machine on the same local network as your
  printers, and configure each with a static IP in Kulode's Settings > Printers page
- USB/Bluetooth printers: run the agent **on the Windows PC each printer is physically plugged
  into** (if you have printers plugged into different PCs, you need an agent running on each
  one), with the printer shared in Windows, and its share name entered in Settings > Printers

## Setup

1. In Kulode, go to **Settings > Printers > Print Agent** and click **Generate Token**. Copy it
   — it's only shown once.
2. Copy `.env.example` to `.env` and fill in:
   - `KULODE_API_URL` — your Kulode API base URL (ends in `/api/v1`)
   - `KULODE_PRINT_AGENT_TOKEN` — the token from step 1
3. Run it:
   ```
   node agent.js
   ```
   or
   ```
   npm start
   ```

You should see it log `Kulode print agent starting...` and then, once an order is placed,
`Printed job ... on "Kitchen Printer" (192.168.1.50:9100)`.

## Keeping it running

This script needs to keep running in the background on the machine you chose. A few options,
pick whichever fits your setup:

- **pm2** (simplest, cross-platform): `npm install -g pm2 && pm2 start agent.js --name kulode-print-agent && pm2 save && pm2 startup`
- **Windows**: run it as a Scheduled Task set to start at login, or wrap it as a Windows service with [node-windows](https://github.com/coreybutler/node-windows)
- **macOS**: a `launchd` agent (`~/Library/LaunchAgents/`) that runs `node agent.js` at login
- **Linux**: a `systemd` user service

If the agent isn't running, print jobs simply queue up (for up to 10 minutes — after that
they're marked failed rather than printing a very stale docket once the agent reconnects) and
the Printers settings page will show them as failed/pending so staff know to check the machine.

## Troubleshooting

- **"Missing config" on startup** — `.env` wasn't found or is missing a value; double check it's
  in the same folder as `agent.js`.
- **Jobs fail with "Printer connection timed out"** — the agent machine can't reach the
  printer's IP. Confirm they're on the same network/VLAN, and that the printer's IP hasn't
  changed (set a DHCP reservation for it in your router to prevent this).
- **USB/Bluetooth job fails with a message about the share name** — the printer isn't shared in
  Windows yet (Printer Properties > Sharing > Share this printer), the share name in Kulode's
  Settings doesn't match exactly, or the agent isn't running on the same PC the printer is
  plugged into.
- **Nothing happens when an order is placed** — check the printer has categories routed to it
  correctly (or none, for "print every order") on the Printers settings page, and that the
  printer is marked active.

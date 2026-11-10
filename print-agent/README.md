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

## Windows: use the installer

This is the normal way to set it up, and needs no technical knowledge:

1. On the Windows PC that will stay on at the location, open Tarione and go to
   **Settings > Printers**.
2. Click **Download for Windows** and open the file. If Windows shows "Windows protected your
   PC", click **More info**, then **Run anyway** (the installer isn't code-signed yet).
3. Click **Connect a computer** on the Printers page and type the code it shows into the
   installer.
4. The Printers page changes to **Agent online** within a minute. Press **Test print** on a
   printer to check it.

That's all. The installer needs no administrator password, installs nothing else (Node is
built in), and sets the agent to start by itself, with no window, whenever that Windows user
signs in. To remove it, use **Add or remove programs > Tarione Print Agent**.

Where things are, if you ever need to look:

- Program, settings and log: `%LOCALAPPDATA%\Programs\Tarione Print Agent\` (`agent.log` is
  the place to look when something isn't printing)
- Check it's running: Task Manager > Details > `TarionePrintAgent.exe`
- Moving from the older hand-made Scheduled Task setup: disable that task first, so two agents
  aren't running on the same PC.

The installer is built by `.github/workflows/print-agent.yml`, which also installs it on a
Windows machine and runs a print end to end against a stand-in API and printer
(`build/smoke-test.js`). Merging to `main` publishes it to the `print-agent-latest` release,
which is what the Download button points at.

## Finding printers automatically

The agent searches its local network for printers, so nobody has to find or type an IP
address. It does this when it starts, every 10 minutes, whenever someone presses **Find
printers** in Settings > Printers, and right after a network printer can't be reached.

- It tries every address on the same network as the computer for something listening on the
  raw-print port (9100), and reports the hits to Tarione. Each one appears under **Printers on
  your network** with an **Add** button — only a name and a station are left to fill in.
- It only opens and closes a connection. It never sends anything, so an office printer that
  also listens on 9100 will be listed but can't be made to print rubbish.
- It also reports each printer's hardware (MAC) address. If the router later gives a printer a
  different IP, the next search recognises it and Tarione corrects the saved address by itself.
- The search covers at most the 254 addresses around the computer on each network. A printer
  on a different network (another VLAN, or a guest Wi-Fi) won't be found and can still be
  added by typing its IP.
- Optional `.env` settings: `KULODE_DISCOVERY_PORT` (default 9100),
  `KULODE_DISCOVERY_INTERVAL_MS` (default 600000), `KULODE_DISCOVERY_HOSTS` (comma-separated
  IPs to check instead of searching).

## Manual setup (any OS, or if the installer can't be used)

Requirements:

- Node.js 18 or later
- Network printers: run the agent on any always-on machine on the same local network as your
  printers, and configure each with a static IP in Settings > Printers
- USB/Bluetooth printers: run the agent **on the Windows PC each printer is physically plugged
  into**, with the printer shared in Windows, and its share name entered in Settings > Printers

Steps:

1. In **Settings > Printers**, click **Connect a computer** to get a pairing code.
2. In this folder, run:
   ```
   node agent.js --pair YOUR-CODE
   ```
   This saves the connection details to `.env`. (The older way still works too: under
   **Manual setup (advanced)** generate a token, copy `.env.example` to `.env` and paste it in
   as `KULODE_PRINT_AGENT_TOKEN`.)
3. Run it:
   ```
   node agent.js
   ```

You should see it log `Tarione print agent ... starting` and then, once an order is placed,
`Printed job ... on "Kitchen Printer" (192.168.1.50:9100)`.

## Keeping a manual setup running

This script needs to keep running in the background on the machine you chose. A few options,
pick whichever fits your setup:

- **pm2** (simplest, cross-platform): `npm install -g pm2 && pm2 start agent.js --name kulode-print-agent && pm2 save && pm2 startup`
- **Windows**: use the installer above instead; failing that, a Scheduled Task (see [WINDOWS_SETUP.md](./WINDOWS_SETUP.md))
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

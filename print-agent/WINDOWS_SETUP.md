# Running the Print Agent on Windows (Scheduled Task method)

This is the method that ended up working reliably for keeping `agent.js` running on a
Windows PC, after `pnpm`-based approaches didn't pan out (PATH/permission issues when run
outside an interactive shell). It uses a native Windows Scheduled Task that launches the
agent at login.

The task can run either **visibly** (a console window pops up showing it polling) or
**hidden** (no window, runs silently in the background). Visible is simpler to verify at a
glance, but staff can accidentally close the window and kill the agent — hidden avoids that
at the cost of losing the at-a-glance "is it running" check. Steps below cover the visible
setup first, then how to switch it to hidden.

## Prerequisites

- Node.js 18+ installed on the Windows machine ([nodejs.org](https://nodejs.org))
- The `print-agent` folder copied onto that machine, with `.env` filled in (see main
  [README.md](./README.md) for `.env` values and, if needed, sharing a USB/Bluetooth printer
  in Windows)

## Steps

1. **Confirm the agent runs manually first.** Open Command Prompt, `cd` into the
   `print-agent` folder, run:
   ```
   node agent.js
   ```
   Confirm you see `Kulode print agent starting...` before moving on. Ctrl+C to stop it.

2. **Create a `.bat` launcher** in the `print-agent` folder (e.g. `start-agent.bat`) so the
   Scheduled Task has a single, simple target:
   ```bat
   cd /d "C:\path\to\print-agent"
   node agent.js
   ```
   Adjust the path to wherever the folder actually lives on that machine.

3. **Open Task Scheduler** (Start menu → search "Task Scheduler") → **Create Task** (not
   "Create Basic Task" — need the extra options).

4. **General tab:**
   - Name: `Kulode Print Agent`
   - Select **"Run only when user is logged on"** (this is what keeps the console window
     visible — "Run whether user is logged on or not" hides it)

5. **Triggers tab → New:**
   - Begin the task: **At log on**
   - Specific user, or "any user" depending on setup
   - Enabled: checked

6. **Actions tab → New:**
   - Action: **Start a program**
   - Program/script: path to `start-agent.bat`
   - (Start in field can be left blank since the `.bat` already `cd`s)

7. **Conditions tab:** uncheck "Start the task only if the computer is on AC power" if this
   is a desktop that's always plugged in (irrelevant for most kitchen/bar PCs, but worth
   checking).

8. **Save**, entering the Windows account password if prompted.

9. **Test it:** log off and back on (or just restart the PC). A terminal window should pop
   open showing the agent polling. Leave it running and place a test order to confirm a
   docket prints.

## Notes / gotchas

- If `node` isn't recognized when the task runs, the Scheduled Task may be running in a
  context where Node isn't on PATH — use the full path to `node.exe` in the `.bat` instead
  (e.g. `"C:\Program Files\nodejs\node.exe" agent.js`).
- If running visibly, don't close the terminal window — closing it kills the agent.
  Minimizing is fine.
- If multiple printers are plugged into different PCs, repeat this whole setup on each one.
- **"fetch failed" on poll**: this is a network error, not a config one. Test with
  `node -e "fetch('YOUR_API_URL').then(r=>console.log('status',r.status)).catch(e=>console.log('ERROR:', e))"`
  to get the real underlying error instead of the generic message. Also check Windows
  Firewall → Allow an app through firewall → make sure `node.exe` is allowed on both
  Private and Public (it often isn't listed at all until manually added, which can silently
  block outbound requests). A response with *any* HTTP status (even 404) means the network
  path is fine.

## Running hidden (no visible terminal window)

Once the visible setup above is confirmed working, switch it to run without a console
window so staff can't accidentally close it and kill the agent:

1. Create `run-hidden.vbs` in the `print-agent` folder:
   ```vbs
   Set WshShell = CreateObject("WScript.Shell")
   WshShell.Run """C:\path\to\print-agent\start-agent.bat""", 0, False
   ```
   (adjust the path to match your `start-agent.bat`)

2. Open Task Scheduler → find the `Kulode Print Agent` task → **Properties** → **Actions**
   tab → edit the action → change **Program/script** from `start-agent.bat` to the path of
   `run-hidden.vbs`. Leave the trigger ("At log on") as-is.

3. Restart or log off/on to test. No terminal window should appear.

4. Since there's nothing visible to check anymore, verify it's running via **Task Manager →
   Details tab → look for `node.exe`**, and confirm with a test print.

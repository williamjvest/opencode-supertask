# OC2 Canary

Asmond-only, isolated SuperTask pilot. It does not replace or modify the production OC2 scheduler.

- Dashboard: `http://asmond.story-mimosa.ts.net:14680` (tailnet only)
- Database: `~/.local/share/opencode-supertask-canary/tasks.db`
- Logs: `~/.local/state/opencode-supertask-canary/`
- LaunchAgent: `com.vv.supertask-canary`
- Gatus heartbeat: `loops_supertask-canary` (8-hour dead-man)
- OpenCode executable: `/Users/williamvest/local/bin/opencode2`
- Human handoff: enabled into Herdr workspace `Scheduled Handoffs`

The pilot runs one harmless `infra` task every six hours. The prompt returns the marker `SUPERTASK_CANARY_OK` and explicitly forbids tool use. Keep the existing production scheduler unchanged for the full seven-day observation window.

For an explicit human handoff test, a managed Agent calls `supertask_handoff`. The original headless run becomes `awaiting_input`, a persistent tab opens in Herdr's `Scheduled Handoffs` workspace, and the same OpenCode 2 session resumes there. Exiting that TUI normally completes the task.

Verify with:

```sh
launchctl print gui/$(id -u)/com.vv.supertask-canary
launchctl print gui/$(id -u)/com.vv.supertask-canary-heartbeat
curl -fsS http://100.85.87.53:14680/health
SUPERTASK_DB_PATH="$HOME/.local/share/opencode-supertask-canary/tasks.db" \
SUPERTASK_CONFIG_PATH="$PWD/deploy/canary/supertask-canary.json" \
bun dist/cli/index.js list
```

Rollback stops only the canary:

```sh
launchctl bootout gui/$(id -u)/com.vv.supertask-canary
launchctl bootout gui/$(id -u)/com.vv.supertask-canary-heartbeat
```

# OC2 Canary

Asmond-only, isolated SuperTask pilot. It does not replace or modify the production OC2 scheduler.

- Dashboard: `http://127.0.0.1:14680`
- Database: `~/.local/share/opencode-supertask-canary/tasks.db`
- Logs: `~/.local/state/opencode-supertask-canary/`
- LaunchAgent: `com.vv.supertask-canary`
- Gatus heartbeat: `loops_supertask-canary` (8-hour dead-man)
- OpenCode executable: `/Users/williamvest/local/bin/opencode2`

The pilot runs one harmless `infra` task every six hours. The prompt returns the marker `SUPERTASK_CANARY_OK` and explicitly forbids tool use. Keep the existing production scheduler unchanged for the full seven-day observation window.

Verify with:

```sh
launchctl print gui/$(id -u)/com.vv.supertask-canary
launchctl print gui/$(id -u)/com.vv.supertask-canary-heartbeat
curl -fsS http://127.0.0.1:14680/health
SUPERTASK_DB_PATH="$HOME/.local/share/opencode-supertask-canary/tasks.db" \
SUPERTASK_CONFIG_PATH="$PWD/deploy/canary/supertask-canary.json" \
bun dist/cli/index.js list
```

Rollback stops only the canary:

```sh
launchctl bootout gui/$(id -u)/com.vv.supertask-canary
launchctl bootout gui/$(id -u)/com.vv.supertask-canary-heartbeat
```

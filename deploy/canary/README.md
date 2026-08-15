# OC2 SuperTask Pilot

Asmond-only SuperTask pilot. It began fully isolated, then started a staged production-loop migration on 2026-08-15 after the canary and Herdr handoff passed end to end.

- Dashboard: `http://asmond.story-mimosa.ts.net:14680` (tailnet only)
- Database: `~/.local/share/opencode-supertask-canary/tasks.db`
- Logs: `~/.local/state/opencode-supertask-canary/`
- LaunchAgent: `com.vv.supertask-canary`
- Gatus heartbeat: `loops_supertask-canary` (8-hour dead-man)
- OpenCode executable: `/Users/williamvest/local/bin/opencode2`
- Human handoff: enabled into Herdr workspace `Scheduled Handoffs`

The pilot retains one harmless `infra` task every six hours. The prompt returns the marker `SUPERTASK_CANARY_OK` and explicitly forbids tool use.

## Staged production migration

`task-janitor` is the first migrated loop. Its SuperTask template preserves the legacy schedule, prompt, agent, model, cwd, timeout, max-instance limit, and Gatus heartbeat. The legacy scheduler copy was deleted only after the enabled SuperTask template was read back successfully, so there is exactly one owner of the 07:00 heartbeat.

- SuperTask template ID: `2`
- Schedule: `0 7 * * *`
- Agent/model: `anton` / `zai/glm-5.2`
- Working directory: `/Users/williamvest`
- Timeout/retries: 10 minutes / 1 retry with 5-minute backoff
- Gatus dead-man: existing `loops_task-janitor` endpoint, unchanged
- First scheduled SuperTask run: 2026-08-16 at 07:00 local

Do not migrate another loop until this run completes successfully and its task/run history, report/spine writes, and Gatus heartbeat are verified. Daily brief and email loops migrate last.

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

Rollback for `task-janitor`: disable SuperTask template `2`, then restore the legacy job from `vv-opencode` git commit `5abc00c` / scheduler history. Never leave both enabled. Stopping the entire pilot remains:

```sh
launchctl bootout gui/$(id -u)/com.vv.supertask-canary
launchctl bootout gui/$(id -u)/com.vv.supertask-canary-heartbeat
```

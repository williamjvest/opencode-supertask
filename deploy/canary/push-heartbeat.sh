#!/bin/bash
set -euo pipefail

DB="$HOME/.local/share/opencode-supertask-canary/tasks.db"
[[ -f "$DB" ]] || exit 0

recent=$(/usr/bin/sqlite3 "$DB" \
  "SELECT COUNT(*) FROM task_runs r JOIN tasks t ON t.id=r.task_id WHERE t.template_id=1 AND r.status='done' AND instr(COALESCE(r.log,''),'SUPERTASK_CANARY_OK')>0 AND r.finished_at >= CAST(strftime('%s','now') AS INTEGER)-28800;")
[[ "$recent" -gt 0 ]] || exit 0

token=$(/Users/williamvest/.local/bin/agent-vault vault credential get \
  GATUS_HEARTBEAT_SUPERTASK_CANARY_TOKEN --vault vv-vault)
/usr/bin/curl -fsS -X POST \
  -H "Authorization: Bearer $token" \
  'http://100.69.216.6:3003/api/v1/endpoints/loops_supertask-canary/external?success=true' \
  >/dev/null

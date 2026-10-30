#!/usr/bin/env bash
# Uptime check sederhana: panggil /api/health, kalau gagal kirim alert ke webhook.
# Cocok untuk cron (Linux) atau Task Scheduler (Windows, jalankan lewat Git Bash).
#
# Pemakaian:
#   ./scripts/uptime-monitor.sh                       # pakai default
#   BASE_URL=https://erp.domain.com ./scripts/uptime-monitor.sh
#   ERROR_WEBHOOK_URL=https://hooks.slack.com/... ./scripts/uptime-monitor.sh
#
# Exit code: 0 sehat, 1 gagal (setelah 3 percobaan).
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
WEBHOOK="${ERROR_WEBHOOK_URL:-${ALERT_WEBHOOK_URL:-}}"
TRIES="${TRIES:-3}"
SLEEP="${SLEEP:-5}"
LOG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/uptime.log"

stamp() { date '+%Y-%m-%d %H:%M:%S'; }

check() {
  local body code
  body=$(curl -sS -m 10 -w '\n%{http_code}' "$BASE_URL$HEALTH_PATH" 2>/dev/null) || return 1
  code=$(printf '%s' "$body" | tail -n1)
  body=$(printf '%s' "$body" | sed '$d')
  if [ "$code" != "200" ]; then
    echo "$body" >&2
    return 1
  fi
  # Harus benar-benar "ok" — bukan halaman login atau HTML error.
  printf '%s' "$body" | grep -q '"status":"ok"'
}

alert() {
  local msg="$1"
  echo "$(stamp) ALERT $msg" | tee -a "$LOG" >&2
  if [ -n "$WEBHOOK" ]; then
    curl -sS -m 5 -X POST "$WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"🔴 ERP DOWN — $msg\",\"content\":\"🔴 ERP DOWN — $msg\"}" >/dev/null 2>&1 \
      || echo "$(stamp) webhook gagal" >> "$LOG"
  fi
}

for i in $(seq 1 "$TRIES"); do
  if check; then
    echo "$(stamp) OK $BASE_URL$HEALTH_PATH (percobaan $i)" >> "$LOG"
    exit 0
  fi
  echo "$(stamp) gagal percobaan $i/$TRIES" >> "$LOG"
  [ "$i" -lt "$TRIES" ] && sleep "$SLEEP"
done

alert "$BASE_URL$HEALTH_PATH tidak merespons 200/status ok setelah $TRIES percobaan ($(stamp))"
exit 1

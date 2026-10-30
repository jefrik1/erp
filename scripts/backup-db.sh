#!/usr/bin/env bash
# Backup database ERP ke ./backups (format custom pg_dump, bisa restore selektif).
# Pemakaian:
#   ./scripts/backup-db.sh                 # simpan ke ./backups
#   BACKUP_DIR=/mnt/backup ./scripts/backup-db.sh
# Jadwal harian (crontab -e):
#   0 1 * * * cd /path/erptest && ./scripts/backup-db.sh >> backups/backup.log 2>&1
set -euo pipefail

CONTAINER="${PG_CONTAINER:-erp_postgres}"
DB_USER="${POSTGRES_USER:-erp}"
DB_NAME="${POSTGRES_DB:-erp_db}"
DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/.." && pwd)/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DIR/erp_${STAMP}.dump"

mkdir -p "$DIR"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "[backup] container $CONTAINER tidak berjalan" >&2
  exit 1
fi

echo "[backup] dumping $DB_NAME dari $CONTAINER → $FILE"
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$FILE"

# Verifikasi hasil tidak kosong (pg_dump custom format minimal beberapa KB)
SIZE=$(wc -c < "$FILE" | tr -d ' ')
if [ "$SIZE" -lt 1024 ]; then
  echo "[backup] GAGAL: file terlalu kecil ($SIZE byte)" >&2
  rm -f "$FILE"
  exit 1
fi

# Hapus backup lebih tua dari KEEP_DAYS
find "$DIR" -name 'erp_*.dump' -type f -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "[backup] OK — $(du -h "$FILE" | cut -f1) — retensi ${KEEP_DAYS} hari"

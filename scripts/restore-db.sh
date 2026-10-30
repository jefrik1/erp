#!/usr/bin/env bash
# Restore database ERP dari file .dump hasil scripts/backup-db.sh.
# PERINGATAN: menimpa isi database saat ini.
#   ./scripts/restore-db.sh backups/erp_20261030-010000.dump
set -euo pipefail

FILE="${1:-}"
CONTAINER="${PG_CONTAINER:-erp_postgres}"
DB_USER="${POSTGRES_USER:-erp}"
DB_NAME="${POSTGRES_DB:-erp_db}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Pemakaian: $0 <file.dump>" >&2
  exit 1
fi

echo "PERINGATAN: semua data di $DB_NAME akan DIGANTI dengan isi $FILE"
read -r -p "Ketik 'RESTORE' untuk melanjutkan: " confirm
[ "$confirm" = "RESTORE" ] || { echo "Dibatalkan."; exit 1; }

echo "[restore] menghentikan backend agar tidak ada koneksi aktif..."
docker stop erp_backend >/dev/null 2>&1 || true

echo "[restore] drop & create schema public..."
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null

echo "[restore] memasukkan data..."
docker exec -i "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges < "$FILE"

echo "[restore] menyalakan backend..."
docker start erp_backend >/dev/null

echo "[restore] selesai. Cek http://localhost:4000/api/health"

#!/usr/bin/env bash
# Buat sertifikat self-signed untuk staging/uji internal.
# Untuk produksi pakai sertifikat nyata (certbot/Let's Encrypt atau CA perusahaan)
# lalu letakkan di docker/certs/fullchain.pem & docker/certs/privkey.pem.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)/docker/certs"
mkdir -p "$DIR"

HOST="${1:-localhost}"
DAYS="${2:-825}"

if [[ -f "$DIR/fullchain.pem" && -f "$DIR/privkey.pem" && "${FORCE:-0}" != "1" ]]; then
  echo "[tls] sertifikat sudah ada di $DIR (pakai FORCE=1 untuk menimpa)"
  exit 0
fi

cat > "$DIR/openssl.cnf" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3

[dn]
C  = ID
ST = Jawa Timur
L  = Gresik
O  = PT Sumber Material Jaya
CN = $HOST

[v3]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt

[alt]
DNS.1 = $HOST
DNS.2 = localhost
IP.1  = 127.0.0.1
IP.2  = ::1
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$DIR/privkey.pem" -out "$DIR/fullchain.pem" \
  -days "$DAYS" -config "$DIR/openssl.cnf" 2>/dev/null

chmod 600 "$DIR/privkey.pem" 2>/dev/null || true
echo "[tls] sertifikat dibuat untuk $HOST (berlaku $DAYS hari) di $DIR"
openssl x509 -in "$DIR/fullchain.pem" -noout -subject -dates

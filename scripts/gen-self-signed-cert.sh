#!/usr/bin/env bash
# Buat sertifikat self-signed untuk HTTPS lokal/staging.
# Produksi: ganti dengan sertifikat CA asli (certbot / Cloudflare origin cert).
#
# Pemakaian:  ./scripts/gen-self-signed-cert.sh [domain] [hari]
# Contoh:     ./scripts/gen-self-signed-cert.sh erp.local 825
set -euo pipefail

DOMAIN="${1:-localhost}"
DAYS="${2:-825}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker/certs"
mkdir -p "$DIR"

if [ -f "$DIR/fullchain.pem" ] && [ -f "$DIR/privkey.pem" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "Sertifikat sudah ada di $DIR (pakai FORCE=1 untuk menimpa)."
  exit 0
fi

cat > "$DIR/openssl.cnf" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = ID
ST = Jawa Timur
L  = Gresik
O  = PT Sumber Material Jaya
CN = ${DOMAIN}

[v3_req]
subjectAltName   = @alt
keyUsage         = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
basicConstraints = CA:FALSE

[alt]
DNS.1 = ${DOMAIN}
DNS.2 = localhost
IP.1  = 127.0.0.1
EOF

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$DIR/privkey.pem" \
  -out "$DIR/fullchain.pem" \
  -days "$DAYS" \
  -config "$DIR/openssl.cnf" >/dev/null 2>&1

chmod 600 "$DIR/privkey.pem"
echo "Sertifikat dibuat:"
echo "  cert : $DIR/fullchain.pem"
echo "  key  : $DIR/privkey.pem"
openssl x509 -in "$DIR/fullchain.pem" -noout -subject -dates | sed 's/^/  /'

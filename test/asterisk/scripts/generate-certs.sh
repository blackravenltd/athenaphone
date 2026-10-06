#!/usr/bin/env bash
#
# AthenaPhone - Open Source SIP Softphone
#
# Copyright (C) 2026 Tom Cully <mail@tomcully.com>
# Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
#
# Generate a private CA and a server certificate for the test fixture's TLS
# and WSS listeners.
#
# AthenaPhone has no option to skip certificate verification - deliberately -
# so testing TLS means trusting this CA. Paste tls/ca.crt into the account's
# "CA certificate" field.
#
# The certificate must carry the address the phone dials as a SAN, because
# verification checks the name the client asked for, not the one the server
# would like to be called. Pass that address as the first argument.

set -euo pipefail

cd "$(dirname "$0")/.."

HOST="${1:-127.0.0.1}"
DAYS=825          # The longest most TLS stacks now accept for a leaf.
OUT=tls

mkdir -p "$OUT"

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl not found" >&2
  exit 1
fi

echo "Generating a CA and a server certificate for: ${HOST}"

# ------------------------------------------------------------------------ CA
#
# basicConstraints and keyUsage are not optional. Without keyCertSign, modern
# TLS stacks reject the chain with "CA cert does not include key usage
# extension", which reads like a server problem and is not.
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
  -keyout "$OUT/ca.key" -out "$OUT/ca.crt" \
  -subj "/O=AthenaPhone Test/CN=AthenaPhone Test CA" \
  -addext "basicConstraints=critical,CA:TRUE" \
  -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null

# -------------------------------------------------------------------- server
openssl req -newkey rsa:2048 -nodes -sha256 \
  -keyout "$OUT/asterisk.key" -out "$OUT/asterisk.csr" \
  -subj "/O=AthenaPhone Test/CN=${HOST}" 2>/dev/null

# A SAN is required: common-name-only certificates have not been accepted for
# years, and the failure looks like an unrelated handshake error.
cat > "$OUT/san.cnf" <<SAN
subjectAltName = @alt
extendedKeyUsage = serverAuth
keyUsage = critical,digitalSignature,keyEncipherment
basicConstraints = critical,CA:FALSE
[alt]
DNS.1 = ${HOST}
DNS.2 = localhost
IP.1 = 127.0.0.1
SAN

# Also list the address as an IP SAN when it looks like one, since a name in
# DNS.1 does not satisfy verification of a dotted quad.
if printf '%s' "$HOST" | grep -qE '^[0-9]+(\.[0-9]+){3}$'; then
  echo "IP.2 = ${HOST}" >> "$OUT/san.cnf"
fi

openssl x509 -req -in "$OUT/asterisk.csr" \
  -CA "$OUT/ca.crt" -CAkey "$OUT/ca.key" -CAcreateserial \
  -out "$OUT/asterisk.crt" -days "$DAYS" -sha256 \
  -extfile "$OUT/san.cnf" 2>/dev/null

# Asterisk's HTTP server (used for WSS) wants one file with key and cert.
cat "$OUT/asterisk.key" "$OUT/asterisk.crt" > "$OUT/asterisk.pem"

chmod 600 "$OUT"/*.key "$OUT/asterisk.pem"
rm -f "$OUT/asterisk.csr" "$OUT/san.cnf"

echo
echo "Wrote:"
echo "  $OUT/ca.crt        <- paste this into the account's CA certificate field"
echo "  $OUT/asterisk.crt  server certificate (SIP TLS)"
echo "  $OUT/asterisk.key  server key"
echo "  $OUT/asterisk.pem  key + certificate, for the WSS listener"
echo
echo "Verifying the chain:"
openssl verify -CAfile "$OUT/ca.crt" "$OUT/asterisk.crt"
echo
echo "Subject alternative names:"
openssl x509 -in "$OUT/asterisk.crt" -noout -ext subjectAltName

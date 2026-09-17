#!/bin/sh
#
# AthenaPhone - Open Source SIP Softphone
#
# Copyright (C) 2026 Tom Cully <mail@tomcully.com>
# Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
#
# Asterisk expands ${...} in the dialplan but not in pjsip.conf, so the
# external address is substituted here before Asterisk starts.

set -eu

: "${ASTERISK_EXTERNAL_IP:=127.0.0.1}"

echo "[entrypoint] advertising media and signalling at ${ASTERISK_EXTERNAL_IP}"

envsubst '${ASTERISK_EXTERNAL_IP}' \
  < /etc/asterisk/pjsip.conf.template \
  > /etc/asterisk/pjsip.conf

if [ ! -f /etc/asterisk/keys/asterisk.crt ]; then
  echo "[entrypoint] WARNING: no TLS certificate at /etc/asterisk/keys." >&2
  echo "[entrypoint] Run scripts/generate-certs.sh; TLS will fail to start." >&2
fi

exec "$@"

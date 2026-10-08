#!/usr/bin/env bash
#
# AthenaPhone - Open Source SIP Softphone
#
# Copyright (C) 2026 Tom Cully <mail@tomcully.com>
# Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
#
# AthenaPhone's entry point in AthenaSIP's combined suite
# (../athenasip/test/suite/run.sh). Runs the unit tests and the suite
# against the live node the runner exported (ATHENA_INTEROP_*), writes
# $ATHENA_SUITE_RESULTS/phone/summary.json with the SIP trace beside it, and
# exits 0 only if nothing failed. Never starts or stops a node.

set -uo pipefail
cd "$(dirname "$0")/.."

results="${ATHENA_SUITE_RESULTS:-$(mktemp -d)/results}"
export ATHENA_SUITE_RESULTS="$results"
out="$results/phone"
mkdir -p "$out"

# WSS goes through Node's global WebSocket, which takes no CA option but
# reads extra roots from here at startup.
ca="../athenasip/tls/ca/snakeca.crt"
if [[ -f "$ca" ]]; then
  export NODE_EXTRA_CA_CERTS="$(cd "$(dirname "$ca")" && pwd)/$(basename "$ca")"
fi

npx jest --ci --silent --json --outputFile="$out/unit.json" \
  >"$out/unit.log" 2>&1
npx jest --ci --config jest.athenasip.config.js --runInBand --json \
  --outputFile="$out/athenasip.json" >"$out/athenasip.log" 2>&1

node scripts/athenasip-summary.js "$out/summary.json" \
  "$out/unit.json" "$out/athenasip.json"
status=$?

cat "$out/summary.json"
exit $status

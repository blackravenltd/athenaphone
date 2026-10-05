//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import fs from 'node:fs';
import path from 'node:path';

import { accountDefaults } from '../../src/store/accountStore';
import type { SipAccount, SipTransport } from '../../src/types';

/**
 * The live AthenaSIP node the suite runs against.
 *
 * Everything comes from the environment the AthenaSIP runner exports from
 * `../athenasip/test/interop/generated/fixture.env`; nothing here starts,
 * stops or assumes a node. Unset ports fall back to the fixture's defaults so
 * a developer who sourced fixture.env by hand gets the same behaviour.
 */
const env = process.env;

export const NODE_HOST =
  env.ATHENA_INTEROP_PUBLIC_ADDRESS || env.ATHENA_INTEROP_BIND || '127.0.0.1';
export const REALM = env.ATHENA_INTEROP_REALM || NODE_HOST;
export const PASSWORD = env.ATHENA_INTEROP_PASSWORD || 'athenaphone';

export const PORTS = {
  udp: Number(env.ATHENA_INTEROP_SIP_PORT || 5060),
  tcp: Number(env.ATHENA_INTEROP_SIP_PORT || 5060),
  tls: Number(env.ATHENA_INTEROP_TLS_PORT || 5061),
  ws: Number(env.ATHENA_INTEROP_WS_PORT || 8088),
  // The fixture serves plain WS only; a WSS port appears if it gains one.
  wss: env.ATHENA_INTEROP_WSS_PORT
    ? Number(env.ATHENA_INTEROP_WSS_PORT)
    : undefined,
};

/** Subscribers the fixture provisioned, in order; 1001..1004 by default. */
export const SUBSCRIBERS = (
  env.ATHENA_INTEROP_SUBSCRIBERS || '1001,1002,1003,1004'
)
  .split(/[\s,]+/)
  .filter(Boolean);

/** Whether the person-and-phone tests may run. */
export const DEVICE = env.ATHENA_SUITE_DEVICE === '1';

/** AthenaSIP's test CA, which signs the node's certificate. */
export function nodeCaPem(): string | undefined {
  const file = path.resolve(
    __dirname,
    '..',
    '..',
    '..',
    'athenasip',
    'tls',
    'ca',
    'snakeca.crt',
  );
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

/** An account for `username` on the node over `transport`. */
export function nodeAccount(
  transport: SipTransport,
  username = SUBSCRIBERS[0],
): SipAccount {
  const port = transport === 'wss' ? PORTS.wss ?? 0 : PORTS[transport as 'udp'];
  return {
    ...accountDefaults,
    id: `athenasip-${transport}-${username}`,
    name: `AthenaSIP ${transport.toUpperCase()}`,
    username,
    domain: REALM,
    server: NODE_HOST,
    transport,
    port,
    wsUri:
      transport === 'ws' || transport === 'wss'
        ? `${transport}://${NODE_HOST}:${port}/ws`
        : undefined,
    tlsCaPem: transport === 'tls' ? nodeCaPem() : undefined,
    // No STUN: the node is on this machine or the LAN, and the default
    // public server only adds candidates and bytes.
    iceServers: [],
    registerExpires: 60,
    createdAt: Date.now(),
  };
}

/** Resolve when `check` is true, or reject with `label` on timeout. */
export function waitFor(
  check: () => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (check()) {
        clearInterval(poll);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(poll);
        reject(
          new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`),
        );
      }
    }, 50);
  });
}

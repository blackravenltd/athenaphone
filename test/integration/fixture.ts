//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { accountDefaults } from '../../src/store/accountStore';
import type { SipAccount, SipTransport } from '../../src/types';

/**
 * Details of the Asterisk fixture in `test/asterisk`, and the helpers the
 * integration tests share.
 *
 * The host defaults to localhost because the harness runs on the same machine
 * as the container. Override with ATHENA_FIXTURE_HOST to point at a fixture
 * elsewhere - it must match the address the certificate was issued for.
 */
export const FIXTURE_HOST = process.env.ATHENA_FIXTURE_HOST ?? '127.0.0.1';
export const FIXTURE_PASSWORD = 'athenaphone';

export const PORTS: Record<'udp' | 'tcp' | 'tls' | 'ws' | 'wss', number> = {
  udp: 5060,
  tcp: 5060,
  tls: 5061,
  ws: 8088,
  wss: 8089,
};

/** The fixture's CA, for verifying its TLS certificate. */
export function fixtureCaPem(): string | undefined {
  const file = path.join(__dirname, '..', 'asterisk', 'tls', 'ca.crt');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}

/**
 * Is the fixture up?
 *
 * The integration suite is skipped rather than failed when it is not: these
 * tests need `docker compose up` in test/asterisk, and a developer who has not
 * started it should get a clear skip, not a wall of timeouts.
 */
export function fixtureReachable(timeoutMs = 1500): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.connect({ host: FIXTURE_HOST, port: PORTS.tcp });
    const done = (reachable: boolean) => {
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });
}

/** An account pointed at the fixture, for `username` over `transport`. */
export function fixtureAccount(
  transport: SipTransport,
  username = '1001',
): SipAccount {
  return {
    ...accountDefaults,
    id: `fixture-${transport}-${username}`,
    name: `Fixture ${transport.toUpperCase()}`,
    username,
    domain: FIXTURE_HOST,
    transport,
    port: PORTS[transport as keyof typeof PORTS],
    wsUri:
      transport === 'ws' || transport === 'wss'
        ? `${transport}://${FIXTURE_HOST}:${PORTS[transport]}/ws`
        : undefined,
    tlsCaPem: transport === 'tls' ? fixtureCaPem() : undefined,
    // Short, so re-registration is observable without a long wait.
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
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`));
      }
    }, 50);
  });
}

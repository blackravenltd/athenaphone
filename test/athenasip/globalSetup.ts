//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import net from 'node:net';

/**
 * Probe the AthenaSIP node before Jest collects any tests, so an absent node
 * gives skipped tests rather than a wall of timeouts or vacuous passes.
 *
 * Self-contained for the same reason as the Asterisk harness's: globalSetup
 * runs outside Jest's module registry and cannot load the app's modules.
 */
export default async function globalSetup(): Promise<void> {
  const host =
    process.env.ATHENA_INTEROP_PUBLIC_ADDRESS ||
    process.env.ATHENA_INTEROP_BIND ||
    '127.0.0.1';
  const port = Number(process.env.ATHENA_INTEROP_SIP_PORT || 5060);

  const reachable = await new Promise<boolean>(resolve => {
    const socket = net.connect({ host, port });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(2000);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });

  process.env.ATHENA_NODE_UP = reachable ? '1' : '0';
  if (!reachable) {
    console.warn(
      `\n  AthenaSIP node unreachable at ${host}:${port} - the suite will ` +
        'be skipped.\n  The AthenaSIP runner brings it up; by hand, ' +
        'run ../athenasip/test/interop/up.sh and source generated/fixture.env.\n',
    );
  }
}

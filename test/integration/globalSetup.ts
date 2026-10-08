//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import net from 'node:net';

/**
 * Probe the fixture before Jest collects any tests.
 *
 * This runs early enough that the suite can choose `it` or `it.skip`, so a
 * missing fixture produces genuinely skipped tests rather than tests that pass
 * while asserting nothing. A green tick should mean something was verified.
 *
 * Deliberately self-contained: globalSetup runs outside Jest's module
 * registry, so importing the shared helpers would drag in the app's stores and
 * their React Native dependencies, which cannot load here.
 */
export default async function globalSetup(): Promise<void> {
  const host = process.env.ATHENA_FIXTURE_HOST ?? '127.0.0.1';
  const port = 5060;

  const reachable = await new Promise<boolean>(resolve => {
    const socket = net.connect({ host, port });
    const done = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
  });

  process.env.ATHENA_FIXTURE_UP = reachable ? '1' : '0';

  if (!reachable) {
    console.warn(
      `\n  Asterisk fixture unreachable at ${host}:${port} - ` +
        'integration tests will be skipped.' +
        '\n  Start it with: cd test/asterisk && docker compose up -d\n',
    );
  }
}

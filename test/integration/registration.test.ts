//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { SipClient } from '../../src/sip/SipClient';
import {
  resetSocketFactories,
  setSocketFactories,
} from '../../src/sip/transports/sockets';
import type { RegistrationStatus, SipTransport } from '../../src/types';
import { FIXTURE_PASSWORD, fixtureAccount, fixtureCaPem, waitFor } from './fixture';
import { nodeSockets } from './nodeSockets';

/**
 * Registration against a real Asterisk, over every transport.
 *
 * This is the point of the harness: the code under test is the shipping
 * `SipClient`, with the shipping transports and framing, talking to a real SIP
 * server. Only the sockets are swapped, for Node's.
 *
 * Needs the fixture running:
 *
 *   cd test/asterisk && docker compose up -d
 */

// globalSetup probed the fixture before collection, so these skip properly
// when it is down rather than passing without asserting anything.
const available = process.env.ATHENA_FIXTURE_UP === '1';
const maybeIt = available ? it : it.skip;
const maybeEach = available ? it.each : it.skip.each;

beforeAll(() => setSocketFactories(nodeSockets));
afterAll(() => resetSocketFactories());

/** Track every registration state a client passes through. */
function watch(client: SipClient) {
  const seen: RegistrationStatus[] = [];
  client.on('registration', status => seen.push(status));
  return {
    seen,
    reached: (state: RegistrationStatus['state']) =>
      seen.some(status => status.state === state),
  };
}

describe('registration against the fixture', () => {
  const clients: SipClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.stop()));
  });

  function newClient(): SipClient {
    const client = new SipClient();
    clients.push(client);
    return client;
  }

  // udp, tcp and tls exercise this project's own transports; ws exercises
  // JsSIP's stock WebSocket socket, which accounts can also select.
  //
  // wss is deliberately absent: JsSIP's WebSocket transport uses the global
  // WebSocket, which offers no way to pass a CA, so it cannot verify the
  // fixture's self-signed certificate the way our own TLS transport can. Run
  // with NODE_EXTRA_CA_CERTS=test/asterisk/tls/ca.crt to cover it.
  const transports: SipTransport[] = ['udp', 'tcp', 'tls', 'ws'];

  maybeEach(transports)('registers over %s', async transport => {
    if (transport === 'tls' && !fixtureCaPem()) {
      throw new Error(
        'No fixture CA. Run test/asterisk/scripts/generate-certs.sh 127.0.0.1',
      );
    }

    const client = newClient();
    const registration = watch(client);

    await client.start(fixtureAccount(transport), FIXTURE_PASSWORD);
    await waitFor(
      () => registration.reached('registered'),
      `${transport} registration`,
      15_000,
    );

    expect(client.registrationStatus.state).toBe('registered');
    // 200 OK, not merely "no error": a challenge answered wrongly can still
    // leave the client quiet.
    expect(client.registrationStatus.statusCode).toBe(200);
  }, 30_000);

  maybeIt(
    'reports a bad password as a failure rather than hanging',
    async () => {
      const client = newClient();
      const registration = watch(client);

      await client.start(fixtureAccount('tcp'), 'wrong-password');
      await waitFor(
        () => registration.reached('failed'),
        'registration failure',
        15_000,
      );

      const failure = registration.seen.find(s => s.state === 'failed');
      expect(failure?.reason).toBeDefined();
      // 401 means the challenge was answered and rejected, which is the
      // distinction that matters: an unreachable server looks different.
      expect(failure?.statusCode).toBe(401);
    },
    30_000,
  );

  maybeIt(
    'reports an unreachable server without throwing',
    async () => {
      const client = newClient();
      const registration = watch(client);

      // Port 9 is discard: reachable host, nothing listening for SIP.
      await client.start(
        { ...fixtureAccount('tcp'), port: 9 },
        FIXTURE_PASSWORD,
      );

      await waitFor(
        () =>
          registration.reached('failed') || registration.reached('unregistered'),
        'transport failure',
        15_000,
      );

      expect(client.registrationStatus.state).not.toBe('registered');
    },
    30_000,
  );

  maybeIt(
    'unregisters cleanly',
    async () => {
      const client = newClient();
      const registration = watch(client);

      await client.start(fixtureAccount('tcp'), FIXTURE_PASSWORD);
      await waitFor(() => registration.reached('registered'), 'registration', 15_000);

      client.unregister();
      await waitFor(
        () => client.registrationStatus.state === 'unregistered',
        'unregistration',
        10_000,
      );

      expect(client.registrationStatus.state).toBe('unregistered');
    },
    30_000,
  );
});

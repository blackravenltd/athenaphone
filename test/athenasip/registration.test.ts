//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import fs from 'node:fs';
import path from 'node:path';

import { SipClient } from '../../src/sip/SipClient';
import { sipTrace } from '../../src/sip/SipTrace';
import {
  resetSocketFactories,
  setSocketFactories,
} from '../../src/sip/transports/sockets';
import type { RegistrationStatus, SipTransport } from '../../src/types';
import { nodeSockets } from '../integration/nodeSockets';
import { nodeAccount, nodeCaPem, PASSWORD, PORTS, waitFor } from './fixture';

/**
 * AthenaPhone's SIP stack against a live AthenaSIP node.
 *
 * The code under test is the shipping `SipClient` and transports; only the
 * sockets are Node's. Run as part of AthenaSIP's combined suite
 * (`npm run test:athenasip`), which supplies the node.
 */

const up = process.env.ATHENA_NODE_UP === '1';
const maybeIt = up ? it : it.skip;
const maybeEach = up ? it.each : it.skip.each;

beforeAll(() => {
  setSocketFactories(nodeSockets);
  sipTrace.setEnabled(true);
});

afterAll(() => {
  resetSocketFactories();
  const results = process.env.ATHENA_SUITE_RESULTS;
  if (results) {
    const dir = path.join(results, 'phone');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sip-trace.txt'), sipTrace.dump());
  }
  sipTrace.setEnabled(false);
});

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

/** The last REGISTER this side sent, raw, from the trace. */
function lastRegisterSent(): string | undefined {
  return sipTrace
    .all()
    .filter(e => e.direction === 'sent' && e.summary.startsWith('REGISTER'))
    .pop()?.raw;
}

describe('registration against AthenaSIP', () => {
  const clients: SipClient[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map(client => client.stop()));
  });

  async function registered(transport: SipTransport): Promise<SipClient> {
    const client = new SipClient();
    clients.push(client);
    const registration = watch(client);
    await client.start(nodeAccount(transport), PASSWORD);
    await waitFor(
      () =>
        registration.reached('registered') || registration.reached('failed'),
      `${transport} registration`,
      15_000,
    );
    expect(client.registrationStatus.state).toBe('registered');
    expect(client.registrationStatus.statusCode).toBe(200);
    return client;
  }

  maybeEach(['udp', 'tcp', 'ws'] as SipTransport[])(
    'registers over %s',
    async transport => {
      await registered(transport);
    },
    30_000,
  );

  maybeIt(
    'registers over tls, verifying the node against the test CA',
    async () => {
      if (!nodeCaPem()) {
        throw new Error('No ../athenasip/tls/ca/snakeca.crt to verify against');
      }
      await registered('tls');
    },
    30_000,
  );

  (up && PORTS.wss ? it : it.skip)(
    'registers over wss (needs ATHENA_INTEROP_WSS_PORT)',
    async () => {
      await registered('wss');
    },
    30_000,
  );

  maybeIt(
    'refuses tls when the node cannot be verified',
    async () => {
      const client = new SipClient();
      clients.push(client);
      const registration = watch(client);
      // The system trust store, which does not hold the test CA.
      await client.start(
        { ...nodeAccount('tls'), tlsCaPem: undefined },
        PASSWORD,
      );
      await waitFor(
        () =>
          registration.reached('failed') ||
          registration.reached('unregistered') ||
          registration.reached('registered'),
        'tls verification outcome',
        15_000,
      ).catch(() => undefined);
      expect(client.registrationStatus.state).not.toBe('registered');
    },
    30_000,
  );

  maybeIt(
    'registers as an RFC 5626 outbound client',
    async () => {
      await registered('tcp');
      const register = lastRegisterSent() ?? '';
      expect(register).toMatch(/\+sip\.instance="<urn:uuid:[0-9a-f-]+>"/i);
      expect(register).toMatch(/;reg-id=1\b/);
      expect(register).toMatch(/^Supported:.*\boutbound\b/im);
    },
    30_000,
  );

  maybeIt(
    'reports a bad password as a 401 failure',
    async () => {
      const client = new SipClient();
      clients.push(client);
      const registration = watch(client);
      await client.start(nodeAccount('tcp'), 'wrong-password');
      await waitFor(() => registration.reached('failed'), 'failure', 15_000);
      const failure = registration.seen.find(s => s.state === 'failed');
      expect(failure?.statusCode).toBe(401);
    },
    30_000,
  );

  maybeIt(
    'unregisters cleanly',
    async () => {
      const client = await registered('tcp');
      client.unregister();
      await waitFor(
        () => client.registrationStatus.state === 'unregistered',
        'unregistration',
        10_000,
      );
      const register = lastRegisterSent() ?? '';
      expect(register).toMatch(/^Expires: 0/im);
    },
    30_000,
  );

  // A negative test of the node more than of the phone: the app does not
  // implement push yet, so the parameters are put on the Contact here.
  maybeIt(
    'gets 555 for RFC 8599 push parameters naming a service the node lacks',
    async () => {
      const client = await registered('tcp');
      const statuses = watch(client);
      const ua = (
        client as unknown as {
          ua: {
            registrator(): {
              setExtraContactParams(p: Record<string, string>): void;
            };
            register(): void;
          };
        }
      ).ua;
      ua.registrator().setExtraContactParams({
        'pn-provider': 'athenaphone-test',
        'pn-prid': 'suite-device-token',
        'pn-param': 'suite.athenaphone',
      });
      ua.register();
      await waitFor(() => statuses.reached('failed'), '555 response', 15_000);
      expect(lastRegisterSent()).toMatch(/pn-provider=athenaphone-test/);
      const failure = statuses.seen.find(s => s.state === 'failed');
      expect(failure?.statusCode).toBe(555);
    },
    30_000,
  );
});

// Calls need a WebRTC stack under Node, which the harness does not have yet
// (werift is the candidate). Listed as todo so the summary counts them as skipped
// rather than leaving them out.
describe('calls through AthenaSIP', () => {
  it.todo(
    'call between two UAs with media flowing (needs a Node WebRTC stack)',
  );
  it.todo('hold and resume (needs a Node WebRTC stack)');
  it.todo('DTMF received by the far UA (needs a Node WebRTC stack)');
  it.todo('BYE from each end (needs a Node WebRTC stack)');
  it.todo('CANCEL before answer (needs a Node WebRTC stack)');
  it.todo('re-registration after the node restarts (the runner restarts it)');
});

describe('on the A85 (ATHENA_SUITE_DEVICE=1)', () => {
  it.todo(
    'inbound video call answered on the phone (device tests are not automated yet)',
  );
});

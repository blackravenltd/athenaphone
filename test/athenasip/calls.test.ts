//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import fs from 'node:fs';
import path from 'node:path';

import { mediaDevices } from 'react-native-webrtc';

import { SipClient } from '../../src/sip/SipClient';
import { sipTrace } from '../../src/sip/SipTrace';
import {
  resetSocketFactories,
  setSocketFactories,
} from '../../src/sip/transports/sockets';
import type { Call, SipAccount } from '../../src/types';
import { nodeSockets } from '../integration/nodeSockets';
import { nodeAccount, OWN_SUBSCRIBERS, PASSWORD, waitFor } from './fixture';
import { fakeMicrophone, installWebRtc, packetsReceived } from './media';

/**
 * Calls between two copies of the app's SIP stack through a live AthenaSIP
 * node: 1003 calls 1004. Signalling is the shipping code end to end; WebRTC
 * is werift's (see media.ts), so media is real RTP over real DTLS-SRTP and
 * ICE, through whatever media path the node's phase sets up.
 */

const up = process.env.ATHENA_NODE_UP === '1';
const maybeIt = up ? it : it.skip;

/** 50 packets a second each way; this is about a second's worth. */
const FLOWING = 40;

beforeAll(() => {
  setSocketFactories(nodeSockets);
  installWebRtc();
  (mediaDevices.getUserMedia as jest.Mock).mockImplementation(async () =>
    fakeMicrophone(),
  );
  sipTrace.setEnabled(true);
});

afterAll(() => {
  resetSocketFactories();
  const results = process.env.ATHENA_SUITE_RESULTS;
  if (results) {
    const dir = path.join(results, 'phone');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sip-trace-calls.txt'), sipTrace.dump());
  }
  sipTrace.setEnabled(false);
});

/** A registered client and everything that happened to its calls. */
interface Party {
  client: SipClient;
  incoming: Call[];
  ended: Call[];
  dtmf: string[];
  latest(callId: string): Call | undefined;
  peerConnection(callId: string): unknown;
}

async function party(
  username: string,
  changes: Partial<SipAccount> = {},
): Promise<Party> {
  const client = new SipClient();
  const incoming: Call[] = [];
  const ended: Call[] = [];
  const dtmf: string[] = [];
  const latest = new Map<string, Call>();

  client.on('call:new', call => {
    latest.set(call.id, call);
    if (call.direction === 'inbound') {
      incoming.push(call);
    }
  });
  client.on('call:update', call => latest.set(call.id, call));
  client.on('call:ended', call => {
    latest.set(call.id, call);
    ended.push(call);
  });
  client.on('dtmf:received', ({ tone }) => dtmf.push(tone));

  await client.start({ ...nodeAccount('tcp', username), ...changes }, PASSWORD);
  await waitFor(
    () => client.registrationStatus.state === 'registered',
    `${username} registration`,
    15_000,
  );

  return {
    client,
    incoming,
    ended,
    dtmf,
    latest: callId => latest.get(callId),
    peerConnection: callId =>
      (
        client as unknown as {
          sessions: Map<string, { session: { connection?: unknown } }>;
        }
      ).sessions.get(callId)?.session.connection,
  };
}

describe('calls through AthenaSIP', () => {
  let caller: Party;
  let callee: Party;

  beforeEach(async () => {
    if (!up) {
      return;
    }
    [caller, callee] = await Promise.all([
      // INFO for DTMF: RFC 4733 needs an RTCDTMFSender, which werift lacks.
      party(OWN_SUBSCRIBERS[0], { dtmfMode: 'info' }),
      party(OWN_SUBSCRIBERS[1], { dtmfMode: 'info' }),
    ]);
  }, 40_000);

  afterEach(async () => {
    await Promise.all(
      [caller, callee]
        .filter(Boolean)
        .map(side => side.client.stop().catch(() => undefined)),
    );
  });

  /** Place a call from the caller, answer it, and wait until both are up. */
  async function connected(): Promise<{ out: Call; inbound: Call }> {
    const out = await caller.client.placeCall(OWN_SUBSCRIBERS[1]);
    await waitFor(() => callee.incoming.length > 0, 'the INVITE at 1004');
    const inbound = callee.incoming[0];
    await callee.client.answerCall(inbound.id);
    await waitFor(
      () =>
        caller.latest(out.id)?.state === 'active' &&
        callee.latest(inbound.id)?.state === 'active',
      'both ends active',
      20_000,
    );
    return { out, inbound };
  }

  maybeIt(
    'connects 1003 to 1004 with media flowing both ways',
    async () => {
      const { out, inbound } = await connected();
      await waitFor(
        () =>
          packetsReceived(caller.peerConnection(out.id)).audio > FLOWING &&
          packetsReceived(callee.peerConnection(inbound.id)).audio > FLOWING,
        'RTP in both directions',
        20_000,
      );
    },
    60_000,
  );

  maybeIt(
    'holds and resumes',
    async () => {
      const { out, inbound } = await connected();

      caller.client.setHold(out.id, true);
      await waitFor(
        () =>
          caller.latest(out.id)?.state === 'held' &&
          callee.latest(inbound.id)?.state === 'remote-held',
        'hold at both ends',
      );

      caller.client.setHold(out.id, false);
      await waitFor(
        () =>
          caller.latest(out.id)?.state === 'active' &&
          callee.latest(inbound.id)?.state === 'active',
        'resumed at both ends',
      );
    },
    60_000,
  );

  maybeIt(
    'delivers DTMF to the far end',
    async () => {
      const { out } = await connected();
      caller.client.sendDtmf(out.id, '1234#');
      await waitFor(() => callee.dtmf.join('') === '1234#', 'all five tones');
    },
    60_000,
  );

  maybeIt(
    'ends on a BYE from the caller',
    async () => {
      const { out, inbound } = await connected();
      caller.client.hangup(out.id);
      await waitFor(
        () => callee.ended.some(call => call.id === inbound.id),
        'the far end to see the BYE',
      );
      const far = callee.ended.find(call => call.id === inbound.id)!;
      expect(far.endReason).toBe('remote-hangup');
      expect(far.endedLocally).toBe(false);
      await waitFor(() => caller.ended.length > 0, 'the caller to end');
      expect(caller.ended[0].endedLocally).toBe(true);
    },
    60_000,
  );

  maybeIt(
    'ends on a BYE from the callee',
    async () => {
      const { out, inbound } = await connected();
      callee.client.hangup(inbound.id);
      await waitFor(
        () => caller.ended.some(call => call.id === out.id),
        'the caller to see the BYE',
      );
      expect(caller.ended[0].endReason).toBe('remote-hangup');
    },
    60_000,
  );

  maybeIt(
    'cancels before answer',
    async () => {
      const out = await caller.client.placeCall(OWN_SUBSCRIBERS[1]);
      await waitFor(() => callee.incoming.length > 0, 'the INVITE at 1004');
      caller.client.hangup(out.id);
      await waitFor(() => callee.ended.length > 0, 'the CANCEL at 1004');
      expect(callee.ended[0].endReason).toBe('cancelled');
      expect(callee.ended[0].answeredAt).toBeUndefined();
    },
    60_000,
  );

  maybeIt(
    'reports a declined call as busy, with the 486',
    async () => {
      const out = await caller.client.placeCall(OWN_SUBSCRIBERS[1]);
      await waitFor(() => callee.incoming.length > 0, 'the INVITE at 1004');
      callee.client.rejectCall(callee.incoming[0].id, 486);
      await waitFor(() => caller.ended.length > 0, 'the caller to fail');
      const failed = caller.ended[0];
      expect(failed.id).toBe(out.id);
      expect(failed.endReason).toBe('busy');
      expect(failed.endStatus?.code).toBe(486);
    },
    60_000,
  );
});

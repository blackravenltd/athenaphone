//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { sipTrace } from '../src/sip/SipTrace';
import { StreamTransport } from '../src/sip/transports/StreamTransport';
import {
  resetSocketFactories,
  setSocketFactories,
  type StreamSocket,
} from '../src/sip/transports/sockets';

/**
 * The trace is the artefact an interoperability result is argued from, so
 * these cover the ways it could quietly lie: missing a direction, reordering,
 * mangling a body, or reporting a length that is not what went on the wire.
 */

const CRLF = '\r\n';

function message(lines: string[], body = ''): string {
  return lines.join(CRLF) + CRLF + CRLF + body;
}

const SDP = ['v=0', 'o=- 1 1 IN IP4 10.35.1.50', 's=-', 'm=audio 9 UDP/TLS/RTP/SAVPF 111'].join(CRLF) + CRLF;

const INVITE = message(
  [
    'INVITE sip:1001@10.35.1.132 SIP/2.0',
    'Call-ID: abc123@10.35.1.50',
    'CSeq: 1 INVITE',
    'Content-Type: application/sdp',
    `Content-Length: ${SDP.length}`,
  ],
  SDP,
);

const OK = message(
  [
    'SIP/2.0 200 OK',
    'Call-ID: abc123@10.35.1.50',
    'CSeq: 1 INVITE',
    'Content-Type: application/sdp',
    `Content-Length: ${SDP.length}`,
  ],
  SDP,
);

/** A minimal stand-in for a JsSIP socket, with the same assignment shape. */
function fakeSocket() {
  return {
    url: 'udp://10.35.1.132:5060',
    via_transport: 'UDP',
    sent: [] as string[],
    ondata: (_data: string) => {},
    send(payload: string) {
      this.sent.push(payload);
      return true;
    },
  };
}

beforeEach(() => {
  sipTrace.clear();
  sipTrace.setEnabled(true);
  sipTrace.setRedactCredentials(true);
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  sipTrace.setEnabled(false);
  jest.restoreAllMocks();
});

describe('sipTrace', () => {
  it('records what was sent and what arrived, in order', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');

    const received: string[] = [];
    traced.ondata = data => received.push(data);

    traced.send(INVITE);
    socket.ondata(OK);

    const entries = sipTrace.all();
    expect(entries.map(entry => entry.direction)).toEqual([
      'sent',
      'received',
    ]);
    expect(entries[0].summary).toBe('INVITE sip:1001@10.35.1.132 SIP/2.0');
    expect(entries[1].summary).toBe('SIP/2.0 200 OK');
    expect(entries.map(entry => entry.method)).toEqual(['INVITE', 'INVITE']);
    expect(entries[0].callId).toBe('abc123@10.35.1.50');
  });

  it('still delivers to the real socket and the real handler', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');

    const received: string[] = [];
    traced.ondata = data => received.push(data);

    traced.send(INVITE);
    socket.ondata(OK);

    // Tracing must be transparent: JsSIP has to see exactly what it would
    // have seen without it, or the trace has changed the thing it measures.
    expect(socket.sent).toEqual([INVITE]);
    expect(received).toEqual([OK]);
  });

  it('passes plain properties through the proxy', () => {
    const traced = sipTrace.traceSocket(fakeSocket(), 'UDP');
    expect(traced.url).toBe('udp://10.35.1.132:5060');
    expect(traced.via_transport).toBe('UDP');
  });

  it('records nothing while disabled', () => {
    sipTrace.setEnabled(false);
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    traced.send(INVITE);

    expect(sipTrace.all()).toHaveLength(0);
    // ...but the message still goes out.
    expect(socket.sent).toEqual([INVITE]);
  });

  it('pulls out the offer and the answer with their direction', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    traced.ondata = () => {};

    traced.send(INVITE);
    socket.ondata(OK);

    const exchanges = sipTrace.sdpExchanges();
    expect(exchanges).toHaveLength(2);
    expect(exchanges[0]).toMatchObject({ direction: 'sent', role: 'offer' });
    expect(exchanges[1]).toMatchObject({
      direction: 'received',
      role: 'answer',
    });
    // The body must survive byte-for-byte; a profile is read off these lines.
    expect(exchanges[0].sdp).toBe(SDP);
    expect(exchanges[0].sdp).toContain('UDP/TLS/RTP/SAVPF');
  });

  it('ignores a non-SDP body', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    traced.send(
      message(
        [
          'INFO sip:1001@10.35.1.132 SIP/2.0',
          'CSeq: 2 INFO',
          'Content-Type: application/dtmf-relay',
          'Content-Length: 10',
        ],
        'Signal=1\r\n',
      ),
    );
    expect(sipTrace.sdpExchanges()).toHaveLength(0);
  });

  it('redacts the digest response but keeps the rest of the challenge', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    traced.send(
      message([
        'REGISTER sip:10.35.1.132 SIP/2.0',
        'CSeq: 2 REGISTER',
        'Authorization: Digest username="1001", realm="10.35.1.132", ' +
          'nonce="deadbeef", response="0123456789abcdef0123456789abcdef"',
        'Content-Length: 0',
      ]),
    );

    const raw = sipTrace.all()[0].raw;
    expect(raw).not.toContain('0123456789abcdef');
    expect(raw).toContain('response="<redacted>"');
    // The parts needed to debug the exchange must survive redaction.
    expect(raw).toContain('nonce="deadbeef"');
    expect(raw).toContain('realm="10.35.1.132"');
  });

  it('counts bytes rather than characters, so fragmentation is judged right', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    // A pound sign is one character and two bytes in UTF-8.
    traced.send(
      message(['INVITE sip:1001@10.35.1.132 SIP/2.0', 'CSeq: 1 INVITE', 'Subject: £']),
    );

    const entry = sipTrace.all()[0];
    expect(entry.bytes).toBe(entry.raw.length + 1);
  });

  it('does not mistake an SDP line for a header', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    // A session name that looks like a Call-ID header must not be read as one.
    const body = ['v=0', 's=Call-ID: not-a-header', ''].join(CRLF);
    traced.send(
      message(
        [
          'INVITE sip:1001@10.35.1.132 SIP/2.0',
          'Call-ID: real@host',
          'CSeq: 1 INVITE',
          'Content-Type: application/sdp',
          `Content-Length: ${body.length}`,
        ],
        body,
      ),
    );
    expect(sipTrace.all()[0].callId).toBe('real@host');
  });

  it('notes a CRLF keep-alive without filling the buffer with it', () => {
    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    traced.send('\r\n\r\n');
    expect(sipTrace.all()[0].summary).toBe('(CRLF keep-alive)');
  });

  it('dumps a readable artefact, and says so when there is nothing', () => {
    expect(sipTrace.dump()).toContain('No SIP messages captured');

    const socket = fakeSocket();
    const traced = sipTrace.traceSocket(socket, 'UDP');
    traced.send(INVITE);

    const dump = sipTrace.dump();
    expect(dump).toContain('--> UDP');
    expect(dump).toContain('INVITE sip:1001@10.35.1.132 SIP/2.0');
    expect(dump).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 111');
    expect(sipTrace.dumpSdp()).toContain('sent offer');
  });
});

/**
 * The tests above drive a stand-in with the right shape. TCP is the transport
 * the first interoperability call actually runs on, so this drives the real
 * `StreamTransport` through the wrapper: the Proxy has to cooperate with a
 * transport that calls its own `this.ondata` from inside, after framing, and
 * that is not something a hand-rolled fake can prove.
 */
describe('sipTrace over a real StreamTransport', () => {
  type Handler = (data: unknown) => void;

  function connected() {
    const handlers: Record<string, Handler> = {};
    const socket = {
      on: jest.fn((event: string, handler: Handler) => {
        handlers[event] = handler;
      }),
      write: jest.fn(),
      destroy: jest.fn(),
      removeAllListeners: jest.fn(),
      setKeepAlive: jest.fn(),
      setNoDelay: jest.fn(),
    };
    setSocketFactories({
      createDatagram: () => {
        throw new Error('not used here');
      },
      connectStream: (_options, onReady) => {
        onReady();
        return socket as unknown as StreamSocket;
      },
      connectTls: (_options, onReady) => {
        onReady();
        return socket as unknown as StreamSocket;
      },
    });

    const transport = sipTrace.traceSocket(
      new StreamTransport('10.35.1.132', 15060, false),
      'TCP',
    );
    const received: string[] = [];
    transport.ondata = incoming => received.push(incoming);
    transport.connect();

    return {
      transport,
      received,
      socket,
      feed: (chunk: string) => handlers.data?.(chunk),
    };
  }

  afterEach(() => resetSocketFactories());

  it('traces a framed message the transport reassembled from two reads', () => {
    const { feed, received } = connected();

    // Split mid-body, which is the case the framing exists for. The trace
    // must see one whole message, not two fragments.
    const head =
      'SIP/2.0 200 OK\r\n' +
      'Call-ID: tcp-1@10.35.1.50\r\n' +
      'CSeq: 1 INVITE\r\n' +
      'Content-Type: application/sdp\r\n' +
      `Content-Length: ${SDP.length}\r\n\r\n`;
    feed(head + SDP.slice(0, 10));
    feed(SDP.slice(10));

    const entries = sipTrace.all();
    expect(entries).toHaveLength(1);
    expect(entries[0].direction).toBe('received');
    expect(entries[0].transport).toBe('TCP');
    expect(entries[0].summary).toBe('SIP/2.0 200 OK');
    expect(entries[0].callId).toBe('tcp-1@10.35.1.50');
    // And the transport still delivered it to JsSIP intact.
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('m=audio 9 UDP/TLS/RTP/SAVPF 111');
    expect(sipTrace.sdpExchanges()[0].sdp).toBe(SDP);
  });

  it('traces an outbound message and still writes it to the socket', () => {
    const { transport, socket } = connected();
    transport.send(INVITE);

    expect(socket.write).toHaveBeenCalledTimes(1);
    const entry = sipTrace.all()[0];
    expect(entry.direction).toBe('sent');
    expect(entry.transport).toBe('TCP');
    expect(entry.summary).toBe('INVITE sip:1001@10.35.1.132 SIP/2.0');
  });

  it('keeps the transport usable through the proxy', () => {
    const { transport } = connected();
    expect(transport.isConnected()).toBe(true);
    expect(transport.via_transport).toBe('TCP');
  });
});

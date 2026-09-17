//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import { Buffer } from 'buffer';

import { StreamTransport } from '../src/sip/transports/StreamTransport';
import TcpSocket from 'react-native-tcp-socket';

/**
 * The framing tests. A stream transport has no message boundaries, so these
 * cover the cases a real server will produce: a message split across reads,
 * several messages in one read, and bodies that must be counted in bytes
 * rather than characters.
 */

type Handler = (data: unknown) => void;

/** A fake socket whose 'data' handler the tests can drive directly. */
function mockSocket() {
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
  return { socket, handlers };
}

function connected() {
  const { socket, handlers } = mockSocket();
  (TcpSocket.createConnection as jest.Mock).mockImplementation(
    (_options: unknown, callback: () => void) => {
      callback();
      return socket;
    },
  );

  const transport = new StreamTransport('pbx.example.com', 5060, false);
  const received: string[] = [];
  transport.ondata = message => received.push(message);
  transport.connect();

  return {
    transport,
    received,
    socket,
    feed: (chunk: string | Buffer) => handlers.data?.(chunk),
    close: (hadError: boolean) => handlers.close?.(hadError as unknown as string),
  };
}

const message = (body = '') =>
  [
    'OPTIONS sip:alice@example.com SIP/2.0',
    'Via: SIP/2.0/TCP pbx.example.com;branch=z9hG4bK1',
    `Content-Length: ${Buffer.byteLength(body, 'utf8')}`,
    '',
    body,
  ].join('\r\n');

describe('StreamTransport framing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('surfaces a whole message that arrives in one read', () => {
    const { feed, received } = connected();
    const wire = message();

    feed(Buffer.from(wire, 'utf8'));

    expect(received).toEqual([wire]);
  });

  it('waits for the body before surfacing anything', () => {
    const { feed, received } = connected();
    const wire = message('hello');
    const split = wire.length - 3;

    feed(Buffer.from(wire.slice(0, split), 'utf8'));
    expect(received).toHaveLength(0);

    feed(Buffer.from(wire.slice(split), 'utf8'));
    expect(received).toEqual([wire]);
  });

  it('splits two messages delivered in a single read', () => {
    const { feed, received } = connected();
    const first = message('one');
    const second = message('two');

    feed(Buffer.from(first + second, 'utf8'));

    expect(received).toEqual([first, second]);
  });

  it('counts Content-Length in bytes, not characters', () => {
    const { feed, received } = connected();
    // Four characters, but seven UTF-8 bytes. Slicing by character would cut
    // the message short and desynchronise every message after it.
    const body = 'héllo';
    const wire = message(body);
    expect(Buffer.byteLength(body, 'utf8')).toBeGreaterThan(body.length);

    feed(Buffer.from(wire, 'utf8'));

    expect(received).toEqual([wire]);
  });

  it('answers a CRLF keep-alive ping and ignores the pong', () => {
    const { feed, received } = connected();

    // JsSIP replies to the ping itself, so the transport just surfaces it.
    feed(Buffer.from('\r\n\r\n', 'utf8'));
    expect(received).toEqual(['\r\n\r\n']);

    feed(Buffer.from('\r\n', 'utf8'));
    expect(received).toEqual(['\r\n\r\n']);
  });

  it('handles a keep-alive immediately followed by a message', () => {
    const { feed, received } = connected();
    const wire = message();

    feed(Buffer.from('\r\n\r\n' + wire, 'utf8'));

    expect(received).toEqual(['\r\n\r\n', wire]);
  });

  it('treats a missing Content-Length as an empty body', () => {
    const { feed, received } = connected();
    const wire = 'SIP/2.0 200 OK\r\nVia: SIP/2.0/TCP pbx\r\n\r\n';

    feed(Buffer.from(wire, 'utf8'));

    expect(received).toEqual([wire]);
  });

  it('accepts the compact form of Content-Length', () => {
    const { feed, received } = connected();
    const wire = 'SIP/2.0 200 OK\r\nl: 2\r\n\r\nhi';

    feed(Buffer.from(wire, 'utf8'));

    expect(received).toEqual([wire]);
  });
});

describe('StreamTransport lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports a SIP URI and Via transport JsSIP can use', () => {
    const tcp = new StreamTransport('pbx.example.com', 5060, false);
    expect(tcp.via_transport).toBe('TCP');
    expect(tcp.sip_uri).toBe('sip:pbx.example.com:5060;transport=tcp');

    const tls = new StreamTransport('pbx.example.com', 5061, true);
    expect(tls.via_transport).toBe('TLS');
    expect(tls.sip_uri).toBe('sip:pbx.example.com:5061;transport=tls');
  });

  it('reports a disconnect when the peer closes', () => {
    const { transport, close } = connected();
    const ondisconnect = jest.fn();
    transport.ondisconnect = ondisconnect;

    expect(transport.isConnected()).toBe(true);
    close(false);

    expect(ondisconnect).toHaveBeenCalledWith(false, undefined, undefined);
    expect(transport.isConnected()).toBe(false);
  });

  it('refuses to send once disconnected', () => {
    const { transport, socket } = connected();
    transport.disconnect();

    expect(transport.send('OPTIONS sip:x SIP/2.0\r\n\r\n')).toBe(false);
    expect(socket.write).not.toHaveBeenCalled();
  });
});
